import { pool } from "../pool.js";
import { TABLES, COLUMNS } from "../schema.js";

function toInt(v, fallback = null) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

export async function enqueueJob({
    companyId,
    telegramChatId, // может быть null если решишь ставить job до linked
    type,
    payload = null,
    runAtISO, // ISO string
    dedupeKey = null,
}) {
    const company = toInt(companyId);
    if (!company) throw new Error("[enqueueJob] companyId invalid");

    if (!type) throw new Error("[enqueueJob] type required");
    if (!runAtISO) throw new Error("[enqueueJob] runAtISO required");

    const sql = `
    INSERT INTO ${TABLES.NOTIFICATION_JOBS}
      (${COLUMNS.NOTIFICATION_JOBS.COMPANY_ID},
       ${COLUMNS.NOTIFICATION_JOBS.TELEGRAM_CHAT_ID},
       ${COLUMNS.NOTIFICATION_JOBS.TYPE},
       ${COLUMNS.NOTIFICATION_JOBS.PAYLOAD},
       ${COLUMNS.NOTIFICATION_JOBS.STATUS},
       ${COLUMNS.NOTIFICATION_JOBS.RUN_AT},
       ${COLUMNS.NOTIFICATION_JOBS.DEDUPE_KEY},
       ${COLUMNS.NOTIFICATION_JOBS.UPDATED_AT})
    VALUES
      ($1, $2, $3, $4::jsonb, 'pending', $5::timestamptz, $6, now())
    ON CONFLICT (${COLUMNS.NOTIFICATION_JOBS.DEDUPE_KEY})
    WHERE ${COLUMNS.NOTIFICATION_JOBS.STATUS} IN ('pending','running')
    DO NOTHING
    RETURNING *;
  `;

    const { rows } = await pool.query(sql, [
        company,
        telegramChatId ?? null,
        String(type),
        payload ? JSON.stringify(payload) : null,
        runAtISO,
        dedupeKey,
    ]);

    return rows[0] || null; // null => дедуп сработал
}

/**
 * Забрать пачку задач, готовых к запуску
 */
export async function pickDueJobs({ limit = 25 }) {
    const lim = Math.max(1, Math.min(200, toInt(limit, 25)));

    const sql = `
    WITH picked AS (
      SELECT ${COLUMNS.NOTIFICATION_JOBS.ID}
      FROM ${TABLES.NOTIFICATION_JOBS}
      WHERE ${COLUMNS.NOTIFICATION_JOBS.STATUS} = 'pending'
        AND ${COLUMNS.NOTIFICATION_JOBS.RUN_AT} <= now()
      ORDER BY ${COLUMNS.NOTIFICATION_JOBS.RUN_AT} ASC, ${COLUMNS.NOTIFICATION_JOBS.ID} ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ${TABLES.NOTIFICATION_JOBS} j
    SET ${COLUMNS.NOTIFICATION_JOBS.STATUS} = 'running',
        ${COLUMNS.NOTIFICATION_JOBS.UPDATED_AT} = now()
    FROM picked
    WHERE j.${COLUMNS.NOTIFICATION_JOBS.ID} = picked.${COLUMNS.NOTIFICATION_JOBS.ID}
    RETURNING j.*;
  `;

    const { rows } = await pool.query(sql, [lim]);
    return rows;
}

export async function markJobDone(id) {
    await pool.query(
        `
    UPDATE ${TABLES.NOTIFICATION_JOBS}
    SET ${COLUMNS.NOTIFICATION_JOBS.STATUS} = 'done',
        ${COLUMNS.NOTIFICATION_JOBS.UPDATED_AT} = now()
    WHERE ${COLUMNS.NOTIFICATION_JOBS.ID} = $1
    `,
        [id]
    );
}

export async function markJobCanceled(id, reason = null) {
    await pool.query(
        `
    UPDATE ${TABLES.NOTIFICATION_JOBS}
    SET ${COLUMNS.NOTIFICATION_JOBS.STATUS} = 'canceled',
        ${COLUMNS.NOTIFICATION_JOBS.LAST_ERROR} = $2,
        ${COLUMNS.NOTIFICATION_JOBS.UPDATED_AT} = now()
    WHERE ${COLUMNS.NOTIFICATION_JOBS.ID} = $1
    `,
        [id, reason ? String(reason).slice(0, 1000) : null]
    );
}

export async function markJobFailed(id, err) {
    await pool.query(
        `
    UPDATE ${TABLES.NOTIFICATION_JOBS}
    SET ${COLUMNS.NOTIFICATION_JOBS.STATUS} = 'failed',
        ${COLUMNS.NOTIFICATION_JOBS.ATTEMPTS} = ${COLUMNS.NOTIFICATION_JOBS.ATTEMPTS} + 1,
        ${COLUMNS.NOTIFICATION_JOBS.LAST_ERROR} = $2,
        ${COLUMNS.NOTIFICATION_JOBS.UPDATED_AT} = now()
    WHERE ${COLUMNS.NOTIFICATION_JOBS.ID} = $1
    `,
        [id, (err?.message || String(err)).slice(0, 1000)]
    );
}
