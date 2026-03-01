import { pool } from "../pool.js";
import { TABLES, COLUMNS } from "../schema.js";

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function hashPayload(payload) {
  return JSON.stringify(payload || {});
}

export async function getRecordCacheById({ companyId, recordId }) {
  const company = toInt(companyId);
  const record = toInt(recordId);
  if (!company || !record) return null;

  const { rows } = await pool.query(
    `
    SELECT *
    FROM ${TABLES.RECORDS_CACHE}
    WHERE ${COLUMNS.RECORDS_CACHE.COMPANY_ID} = $1
      AND ${COLUMNS.RECORDS_CACHE.RECORD_ID} = $2
    LIMIT 1
    `,
    [company, record]
  );

  return rows[0] || null;
}

export async function upsertRecordCache({
  companyId,
  recordId,
  payload,
  yclientsClientId,
  serviceAt,
  attendance,
  internalStatus,
  deleted,
  recordCreatedAt,
}) {
  const company = toInt(companyId);
  const record = toInt(recordId);
  if (!company || !record) return null;

  const payloadObj = payload || null;
  const payloadHash = hashPayload(payloadObj);

  const { rows } = await pool.query(
    `
    INSERT INTO ${TABLES.RECORDS_CACHE}
      (${COLUMNS.RECORDS_CACHE.COMPANY_ID},
       ${COLUMNS.RECORDS_CACHE.RECORD_ID},
       ${COLUMNS.RECORDS_CACHE.PAYLOAD_HASH},
       ${COLUMNS.RECORDS_CACHE.PAYLOAD},
       ${COLUMNS.RECORDS_CACHE.YCLIENTS_CLIENT_ID},
       ${COLUMNS.RECORDS_CACHE.SERVICE_AT},
       ${COLUMNS.RECORDS_CACHE.ATTENDANCE},
       ${COLUMNS.RECORDS_CACHE.INTERNAL_STATUS},
       ${COLUMNS.RECORDS_CACHE.DELETED},
       ${COLUMNS.RECORDS_CACHE.RECORD_CREATED_AT},
       ${COLUMNS.RECORDS_CACHE.UPDATED_AT})
    VALUES
      ($1, $2, $3, $4::jsonb, $5, $6::timestamptz, $7, $8, $9, $10::timestamptz, now())
    ON CONFLICT (${COLUMNS.RECORDS_CACHE.COMPANY_ID}, ${COLUMNS.RECORDS_CACHE.RECORD_ID})
    DO UPDATE SET
      ${COLUMNS.RECORDS_CACHE.PAYLOAD_HASH} = EXCLUDED.${COLUMNS.RECORDS_CACHE.PAYLOAD_HASH},
      ${COLUMNS.RECORDS_CACHE.PAYLOAD} = EXCLUDED.${COLUMNS.RECORDS_CACHE.PAYLOAD},
      ${COLUMNS.RECORDS_CACHE.YCLIENTS_CLIENT_ID} = EXCLUDED.${COLUMNS.RECORDS_CACHE.YCLIENTS_CLIENT_ID},
      ${COLUMNS.RECORDS_CACHE.SERVICE_AT} = EXCLUDED.${COLUMNS.RECORDS_CACHE.SERVICE_AT},
      ${COLUMNS.RECORDS_CACHE.ATTENDANCE} = EXCLUDED.${COLUMNS.RECORDS_CACHE.ATTENDANCE},
      ${COLUMNS.RECORDS_CACHE.INTERNAL_STATUS} = EXCLUDED.${COLUMNS.RECORDS_CACHE.INTERNAL_STATUS},
      ${COLUMNS.RECORDS_CACHE.DELETED} = EXCLUDED.${COLUMNS.RECORDS_CACHE.DELETED},
      ${COLUMNS.RECORDS_CACHE.RECORD_CREATED_AT} = COALESCE(EXCLUDED.${COLUMNS.RECORDS_CACHE.RECORD_CREATED_AT}, ${TABLES.RECORDS_CACHE}.${COLUMNS.RECORDS_CACHE.RECORD_CREATED_AT}),
      ${COLUMNS.RECORDS_CACHE.UPDATED_AT} = now()
    RETURNING *
    `,
    [
      company,
      record,
      payloadHash,
      payloadObj ? JSON.stringify(payloadObj) : null,
      toInt(yclientsClientId),
      asIsoOrNull(serviceAt),
      attendance == null ? null : Number(attendance),
      internalStatus,
      Boolean(deleted),
      asIsoOrNull(recordCreatedAt),
    ]
  );

  return rows[0] || null;
}

export async function updateRecordInternalStatus({ companyId, recordId, internalStatus, attendance, deleted, payload }) {
  const company = toInt(companyId);
  const record = toInt(recordId);
  if (!company || !record) return null;

  const payloadHash = hashPayload(payload);

  const { rows } = await pool.query(
    `
    UPDATE ${TABLES.RECORDS_CACHE}
    SET ${COLUMNS.RECORDS_CACHE.INTERNAL_STATUS} = $3,
        ${COLUMNS.RECORDS_CACHE.ATTENDANCE} = $4,
        ${COLUMNS.RECORDS_CACHE.DELETED} = $5,
        ${COLUMNS.RECORDS_CACHE.PAYLOAD} = COALESCE($6::jsonb, ${COLUMNS.RECORDS_CACHE.PAYLOAD}),
        ${COLUMNS.RECORDS_CACHE.PAYLOAD_HASH} = COALESCE($7, ${COLUMNS.RECORDS_CACHE.PAYLOAD_HASH}),
        ${COLUMNS.RECORDS_CACHE.UPDATED_AT} = now()
    WHERE ${COLUMNS.RECORDS_CACHE.COMPANY_ID} = $1
      AND ${COLUMNS.RECORDS_CACHE.RECORD_ID} = $2
    RETURNING *
    `,
    [
      company,
      record,
      internalStatus,
      attendance == null ? null : Number(attendance),
      deleted == null ? null : Boolean(deleted),
      payload ? JSON.stringify(payload) : null,
      payload ? payloadHash : null,
    ]
  );

  return rows[0] || null;
}
