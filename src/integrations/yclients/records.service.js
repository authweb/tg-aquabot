// src/yclients/records.service.js
import { yclients } from "./client.js";

function extractYclientsError(raw) {
    return {
        message: raw?.meta?.message || "Произошла ошибка",
        errors: raw?.meta?.errors,
    };
}

function normalizeServicesForUpdate(recServices) {
    const src = Array.isArray(recServices) ? recServices : [];
    return src
        .map((s) => {
            const id = s?.id;
            if (!id) return null;
            const out = { id: Number(id) };
            if (s?.amount != null) out.amount = Number(s.amount);
            if (s?.cost != null) out.cost = Number(s.cost);
            if (s?.discount != null) out.discount = Number(s.discount);
            return out;
        })
        .filter(Boolean);
}

function buildUpdatePayloadFromRecord({ rec, patch = {} }) {
    return {
        staff_id: rec?.staff_id,
        services: normalizeServicesForUpdate(rec?.services),
        client: { id: rec?.client?.id },
        seance_length: rec?.seance_length ?? rec?.length,
        datetime: rec?.datetime,
        ...patch,
    };
}

export async function getRecordFromYclients({ companyId, recordId }) {
    try {
        const r = await yclients.get(`/record/${companyId}/${recordId}`);
        return { ok: r.data?.success === true, status: r.status, raw: r.data, data: r.data?.data };
    } catch (e) {
        const raw = e?.response?.data;
        const status = e?.response?.status || 0;
        return { ok: false, status, raw, message: raw?.meta?.message || e?.message || "Ошибка запроса" };
    }
}

/**
 * PUT /record/{companyId}/{recordId}
 * JSON only
 */
export async function updateRecord({ companyId, recordId, payload }) {
    const url = `/record/${companyId}/${recordId}`;

    try {
        const { data, status } = await yclients.put(url, payload, {
            headers: { "Content-Type": "application/json" },
        });

        if (data?.success === true) return { ok: true, status, raw: data };

        const { message, errors } = extractYclientsError(data);
        return { ok: false, status, message, raw: data, errors };
    } catch (e) {
        const raw = e?.response?.data;
        const status = e?.response?.status || 0;
        const { message, errors } = extractYclientsError(raw);
        return { ok: false, status, message: message || e?.message || "Ошибка запроса", raw, errors };
    }
}

export async function listRecordsFromYclients({
    companyId,
    clientId,
    startDate, // YYYY-MM-DD
    endDate, // YYYY-MM-DD optional
    count = 10,
    page = 1,
}) {
    try {
        const params = new URLSearchParams();
        if (clientId != null) params.set("client_id", String(clientId));
        if (startDate) params.set("start_date", String(startDate));
        if (endDate) params.set("end_date", String(endDate));
        if (count) params.set("count", String(count));
        if (page) params.set("page", String(page));

        const url = `/records/${companyId}?${params.toString()}`;
        const r = await yclients.get(url);

        return { ok: r.data?.success === true, status: r.status, raw: r.data, data: r.data?.data };
    } catch (e) {
        const raw = e?.response?.data;
        const status = e?.response?.status || 0;
        return {
            ok: false,
            status,
            raw,
            message: raw?.meta?.message || e?.message || "Ошибка запроса",
        };
    }
}

export async function confirmRecordInYclients({ companyId, recordId }) {
    const check = await getRecordFromYclients({ companyId, recordId });
    if (!check.ok) return check;

    const rec = check.data || check.raw?.data;

    // ✅ защита от повторного подтверждения
    if (Number(rec?.attendance) === 1) {
        return { ok: true, status: 200, raw: check.raw, alreadyConfirmed: true };
    }

    const setVisit = String(process.env.YCLIENTS_CONFIRM_SET_VISIT_ATTENDANCE || "").trim() === "1";
    const patch = setVisit ? { attendance: 1, visit_attendance: 1 } : { attendance: 1 };

    const payload = buildUpdatePayloadFromRecord({ rec, patch });
    const upd = await updateRecord({ companyId, recordId, payload });

    return { ...upd, builtPayload: payload };
}


export async function cancelRecordInYclients({ companyId, recordId }) {
    const check = await getRecordFromYclients({ companyId, recordId });
    if (!check.ok) return check;

    const rec = check.data || check.raw?.data;

    if (Number(rec?.attendance) === 2 || rec?.deleted === true) {
        return { ok: true, status: 200, raw: check.raw, alreadyCanceled: true };
    }

    const payload = buildUpdatePayloadFromRecord({
        rec,
        patch: { attendance: 2, visit_attendance: 2 },
    });

    const upd = await updateRecord({ companyId, recordId, payload });
    return { ...upd, builtPayload: payload };
}
