import { getLinkByTelegramUserId } from "../db/repos/clientsLinkRepo.js";
import {
  getRecordCacheById,
  upsertRecordCache,
  updateRecordInternalStatus,
} from "../db/repos/recordsCache.repo.js";
import { isActionProcessed, markActionProcessed } from "../db/repos/processedActionsRepo.js";
import { logUserAction } from "../db/repos/userActionsLogRepo.js";
import {
  getRecordFromYclients,
  confirmRecordInYclients,
  cancelRecordInYclients,
  listRecordsFromYclients,
} from "../integrations/yclients/records.service.js";
import {
  INTERNAL_STATUS,
  mapInternalToYclientsAttendance,
  mapYclientsToInternal,
} from "./recordStatus.js";

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extractRecordModel(record) {
  if (!record) return null;

  const payload = record.payload || record;
  const dateTime = payload.datetime || payload.date || record.service_at || "—";
  const service = Array.isArray(payload.services)
    ? payload.services.map((s) => s?.title).filter(Boolean).join(", ")
    : "—";

  return {
    recordId: Number(record.record_id || payload.id || 0),
    companyId: Number(record.company_id || 0),
    internalStatus: record.internal_status || mapYclientsToInternal({ attendance: record.attendance, deleted: record.deleted }),
    attendance: record.attendance,
    deleted: Boolean(record.deleted),
    dateTime,
    service,
    branch: payload?.company?.title || payload?.salon?.title || "Основной филиал",
    payload,
  };
}

async function ensureLinkedClient({ companyId, telegramUserId }) {
  const link = await getLinkByTelegramUserId({ companyId, telegramUserId });
  if (!link?.yclients_client_id) {
    return { ok: false, reason: "not_linked" };
  }
  return { ok: true, yclientsClientId: Number(link.yclients_client_id) };
}

async function ensureRecordInCache({ companyId, recordId }) {
  let cache = await getRecordCacheById({ companyId, recordId });
  if (cache) return cache;

  const remote = await getRecordFromYclients({ companyId, recordId });
  if (!remote.ok) return null;

  const rec = remote.data || remote.raw?.data;
  const internalStatus = mapYclientsToInternal({
    attendance: rec?.attendance,
    deleted: rec?.deleted,
  });

  cache = await upsertRecordCache({
    companyId,
    recordId,
    payload: rec,
    yclientsClientId: rec?.client?.id,
    serviceAt: rec?.datetime || rec?.date,
    attendance: rec?.attendance,
    internalStatus,
    deleted: rec?.deleted,
    recordCreatedAt: rec?.create_date,
  });

  return cache;
}

async function validateOwnership({ companyId, telegramUserId, cache }) {
  const link = await ensureLinkedClient({ companyId, telegramUserId });
  if (!link.ok) return link;

  const recClientId = Number(cache?.yclients_client_id || cache?.payload?.client?.id || 0);
  if (!recClientId || recClientId !== Number(link.yclientsClientId)) {
    return { ok: false, reason: "forbidden" };
  }

  return { ok: true, yclientsClientId: link.yclientsClientId };
}

export async function confirmRecord({ companyId, recordId, telegramUserId }) {
  const company = toNumber(companyId);
  const record = toNumber(recordId);

  if (!company || !record || !telegramUserId) {
    return { ok: false, reason: "bad_request" };
  }

  if (await isActionProcessed({ companyId: company, recordId: record, action: "confirm_record" })) {
    const cache = await ensureRecordInCache({ companyId: company, recordId: record });
    return { ok: true, dedup: true, record: extractRecordModel(cache) };
  }

  const cache = await ensureRecordInCache({ companyId: company, recordId: record });
  if (!cache) return { ok: false, reason: "record_not_found" };

  const own = await validateOwnership({ companyId: company, telegramUserId, cache });
  if (!own.ok) return own;

  if (cache.internal_status === INTERNAL_STATUS.CONFIRMED) {
    await markActionProcessed({ companyId: company, recordId: record, action: "confirm_record" });
    return { ok: true, already: true, record: extractRecordModel(cache) };
  }

  const upd = await confirmRecordInYclients({ companyId: company, recordId: record });
  if (!upd?.ok) return { ok: false, reason: "yclients_error", error: upd };

  const rec = upd.raw?.data || upd.data || cache.payload;
  const updatedCache =
    (await updateRecordInternalStatus({
      companyId: company,
      recordId: record,
      internalStatus: INTERNAL_STATUS.CONFIRMED,
      attendance: mapInternalToYclientsAttendance(INTERNAL_STATUS.CONFIRMED),
      deleted: false,
      payload: rec,
    })) || cache;

  await markActionProcessed({ companyId: company, recordId: record, action: "confirm_record" });
  await logUserAction({
    telegramUserId,
    companyId: company,
    action: "confirm_record",
    payload: { recordId: record },
  });

  return { ok: true, record: extractRecordModel(updatedCache) };
}

export async function cancelRecord({ companyId, recordId, telegramUserId }) {
  const company = toNumber(companyId);
  const record = toNumber(recordId);

  if (!company || !record || !telegramUserId) {
    return { ok: false, reason: "bad_request" };
  }

  if (await isActionProcessed({ companyId: company, recordId: record, action: "cancel_record" })) {
    const cache = await ensureRecordInCache({ companyId: company, recordId: record });
    return { ok: true, dedup: true, record: extractRecordModel(cache) };
  }

  const cache = await ensureRecordInCache({ companyId: company, recordId: record });
  if (!cache) return { ok: false, reason: "record_not_found" };

  const own = await validateOwnership({ companyId: company, telegramUserId, cache });
  if (!own.ok) return own;

  if (cache.internal_status === INTERNAL_STATUS.CANCELLED) {
    await markActionProcessed({ companyId: company, recordId: record, action: "cancel_record" });
    return { ok: true, already: true, record: extractRecordModel(cache) };
  }

  const upd = await cancelRecordInYclients({ companyId: company, recordId: record });
  if (!upd?.ok) return { ok: false, reason: "yclients_error", error: upd };

  const rec = upd.raw?.data || upd.data || cache.payload;
  const updatedCache =
    (await updateRecordInternalStatus({
      companyId: company,
      recordId: record,
      internalStatus: INTERNAL_STATUS.CANCELLED,
      attendance: mapInternalToYclientsAttendance(INTERNAL_STATUS.CANCELLED),
      deleted: true,
      payload: rec,
    })) || cache;

  await markActionProcessed({ companyId: company, recordId: record, action: "cancel_record" });
  await logUserAction({
    telegramUserId,
    companyId: company,
    action: "cancel_record",
    payload: { recordId: record },
  });

  return { ok: true, record: extractRecordModel(updatedCache) };
}


export async function getNearestRecordForUser({ companyId, telegramUserId, startDate, count = 10, page = 1 }) {
  const company = toNumber(companyId);
  if (!company || !telegramUserId) return { ok: false, reason: "bad_request" };

  const link = await getLinkByTelegramUserId({ companyId: company, telegramUserId });
  if (!link?.phone) return { ok: false, reason: "need_phone" };

  const clientId = Number(link.yclients_client_id || 0);
  if (!clientId) return { ok: false, reason: "not_linked" };

  const list = await listRecordsFromYclients({
    companyId: company,
    clientId,
    startDate,
    count,
    page,
  });

  if (!list.ok || !Array.isArray(list.data)) return { ok: false, reason: "yclients_error" };

  const next = list.data.find((r) => r && r.deleted !== true) || null;
  if (!next) return { ok: true, empty: true };

  await upsertRecordCache({
    companyId: company,
    recordId: next.id,
    payload: next,
    yclientsClientId: next?.client?.id || clientId,
    serviceAt: next?.datetime || next?.date,
    attendance: next?.attendance,
    internalStatus: mapYclientsToInternal({ attendance: next?.attendance, deleted: next?.deleted }),
    deleted: next?.deleted,
    recordCreatedAt: next?.create_date,
  });

  return { ok: true, record: next, link };
}
