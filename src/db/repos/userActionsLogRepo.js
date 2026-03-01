import { pool } from "../pool.js";
import { TABLES, COLUMNS } from "../schema.js";

export async function logUserAction({ telegramUserId, companyId = null, action, payload = null }) {
  if (!telegramUserId || !action) return;

  try {
    await pool.query(
      `
      INSERT INTO ${TABLES.USER_ACTIONS_LOG}
        (${COLUMNS.USER_ACTIONS_LOG.TELEGRAM_USER_ID},
         ${COLUMNS.USER_ACTIONS_LOG.COMPANY_ID},
         ${COLUMNS.USER_ACTIONS_LOG.ACTION},
         ${COLUMNS.USER_ACTIONS_LOG.PAYLOAD})
      VALUES ($1, $2, $3, $4::jsonb)
      `,
      [Number(telegramUserId), companyId == null ? null : Number(companyId), String(action), payload ? JSON.stringify(payload) : null]
    );
  } catch (e) {
    console.warn("[user_actions_log] write failed", e?.message || e);
  }
}
