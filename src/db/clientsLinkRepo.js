import { pool } from "./pool.js";
import { normalizePhone } from "../utils/phone.js";
import { TABLES, COLUMNS } from "./schema.js";

/**
 * Приводим ID к "безопасному" виду для bigint:
 * - если пришло число -> строка
 * - если пришла строка -> trim
 * - иначе -> null
 *
 * pg умеет bigint принимать как строку, это самый стабильный вариант.
 */
function toBigIntString(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    // важно: для больших bigint number может терять точность,
    // но если тебе прилетает из Telegram/DB — обычно ок.
    return String(Math.trunc(v));
  }
  const s = String(v).trim();
  return s ? s : null;
}

function toInt(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function upsertClientLink({
  companyId,
  phone,
  telegramUserId,
  telegramChatId,
}) {
  const company = toInt(companyId);
  if (!company) throw new Error("[upsertClientLink] companyId is invalid");

  const p = normalizePhone(phone);
  if (!p) throw new Error("[upsertClientLink] phone is empty");

  const tgUser = toBigIntString(telegramUserId);
  const tgChat = toBigIntString(telegramChatId);
  if (!tgUser) throw new Error("[upsertClientLink] telegramUserId is invalid");
  if (!tgChat) throw new Error("[upsertClientLink] telegramChatId is invalid");

  const sql = `
    INSERT INTO ${TABLES.CLIENTS_LINK}
      (${COLUMNS.CLIENTS_LINK.COMPANY_ID},
       ${COLUMNS.CLIENTS_LINK.PHONE},
       ${COLUMNS.CLIENTS_LINK.TELEGRAM_USER_ID},
       ${COLUMNS.CLIENTS_LINK.TELEGRAM_CHAT_ID},
       ${COLUMNS.CLIENTS_LINK.STATUS},
       ${COLUMNS.CLIENTS_LINK.UPDATED_AT})
    VALUES
      ($1, $2, $3, $4, 'pending', now())
    ON CONFLICT (${COLUMNS.CLIENTS_LINK.COMPANY_ID}, ${COLUMNS.CLIENTS_LINK.TELEGRAM_USER_ID})
    DO UPDATE SET
      ${COLUMNS.CLIENTS_LINK.PHONE} = EXCLUDED.${COLUMNS.CLIENTS_LINK.PHONE},
      ${COLUMNS.CLIENTS_LINK.TELEGRAM_CHAT_ID} = EXCLUDED.${COLUMNS.CLIENTS_LINK.TELEGRAM_CHAT_ID},
      ${COLUMNS.CLIENTS_LINK.UPDATED_AT} = now()
    RETURNING
      ${COLUMNS.CLIENTS_LINK.ID},
      ${COLUMNS.CLIENTS_LINK.COMPANY_ID},
      ${COLUMNS.CLIENTS_LINK.PHONE},
      ${COLUMNS.CLIENTS_LINK.TELEGRAM_USER_ID},
      ${COLUMNS.CLIENTS_LINK.TELEGRAM_CHAT_ID},
      ${COLUMNS.CLIENTS_LINK.STATUS},
      ${COLUMNS.CLIENTS_LINK.CREATED_AT},
      ${COLUMNS.CLIENTS_LINK.UPDATED_AT};
  `;

  const { rows } = await pool.query(sql, [company, p, tgUser, tgChat]);
  return rows[0];
}

export async function getPendingLinks({ companyId, limit = 20 }) {
  const company = toInt(companyId);
  if (!company) throw new Error("[getPendingLinks] companyId is invalid");

  const lim = Math.max(1, toInt(limit, 20));

  const sql = `
    SELECT
      ${COLUMNS.CLIENTS_LINK.ID},
      ${COLUMNS.CLIENTS_LINK.COMPANY_ID},
      ${COLUMNS.CLIENTS_LINK.PHONE},
      ${COLUMNS.CLIENTS_LINK.TELEGRAM_USER_ID},
      ${COLUMNS.CLIENTS_LINK.TELEGRAM_CHAT_ID},
      ${COLUMNS.CLIENTS_LINK.STATUS},
      ${COLUMNS.CLIENTS_LINK.CREATED_AT}
    FROM ${TABLES.CLIENTS_LINK}
    WHERE ${COLUMNS.CLIENTS_LINK.COMPANY_ID} = $1
      AND ${COLUMNS.CLIENTS_LINK.STATUS} = 'pending'
    ORDER BY ${COLUMNS.CLIENTS_LINK.CREATED_AT} ASC
    LIMIT $2;
  `;

  const { rows } = await pool.query(sql, [company, lim]);
  return rows;
}

export async function markClientLinked({
  companyId,
  telegramUserId,
  yclientsClientId,
}) {
  const company = toInt(companyId);
  if (!company) throw new Error("[markClientLinked] companyId is invalid");

  const tgUser = toBigIntString(telegramUserId);
  if (!tgUser) throw new Error("[markClientLinked] telegramUserId is invalid");

  const ycId = toBigIntString(yclientsClientId);
  if (!ycId) throw new Error("[markClientLinked] yclientsClientId is invalid");

  const sql = `
    UPDATE ${TABLES.CLIENTS_LINK}
    SET
      ${COLUMNS.CLIENTS_LINK.YCLIENTS_CLIENT_ID} = $3,
      ${COLUMNS.CLIENTS_LINK.STATUS} = 'linked',
      ${COLUMNS.CLIENTS_LINK.LINKED_AT} = now(),
      ${COLUMNS.CLIENTS_LINK.UPDATED_AT} = now()
    WHERE ${COLUMNS.CLIENTS_LINK.COMPANY_ID} = $1
      AND ${COLUMNS.CLIENTS_LINK.TELEGRAM_USER_ID} = $2
    RETURNING
      ${COLUMNS.CLIENTS_LINK.ID},
      ${COLUMNS.CLIENTS_LINK.COMPANY_ID},
      ${COLUMNS.CLIENTS_LINK.PHONE},
      ${COLUMNS.CLIENTS_LINK.TELEGRAM_USER_ID},
      ${COLUMNS.CLIENTS_LINK.TELEGRAM_CHAT_ID},
      ${COLUMNS.CLIENTS_LINK.STATUS},
      ${COLUMNS.CLIENTS_LINK.YCLIENTS_CLIENT_ID};
  `;

  const { rows } = await pool.query(sql, [company, tgUser, ycId]);
  return rows[0] || null;
}

/**
 * Возвращает telegram_chat_id для подтверждённой связки (linked)
 */
export async function getLinkedChatByPhone({ companyId, phone }) {
  const company = toInt(companyId);
  if (!company) throw new Error("[getLinkedChatByPhone] companyId is invalid");

  const p = normalizePhone(phone);
  if (!p) return null;

  const sql = `
    SELECT ${COLUMNS.CLIENTS_LINK.TELEGRAM_CHAT_ID} AS telegram_chat_id
    FROM ${TABLES.CLIENTS_LINK}
    WHERE ${COLUMNS.CLIENTS_LINK.COMPANY_ID} = $1
      AND ${COLUMNS.CLIENTS_LINK.PHONE} = $2
      AND ${COLUMNS.CLIENTS_LINK.STATUS} = 'linked'
    ORDER BY ${COLUMNS.CLIENTS_LINK.UPDATED_AT} DESC NULLS LAST,
             ${COLUMNS.CLIENTS_LINK.ID} DESC
    LIMIT 1;
  `;

  const { rows } = await pool.query(sql, [company, p]);
  return rows[0]?.telegram_chat_id ?? null;
}

export async function getLinkByTelegramUserId({ companyId, telegramUserId }) {
  const { rows } = await pool.query(
    `
    SELECT *
    FROM ${TABLES.CLIENTS_LINK}
      WHERE ${COLUMNS.CLIENTS_LINK.COMPANY_ID} = $1 
      AND ${COLUMNS.CLIENTS_LINK.TELEGRAM_USER_ID} = $2
    ORDER BY ${COLUMNS.CLIENTS_LINK.UPDATED_AT} DESC NULLS LAST, 
             ${COLUMNS.CLIENTS_LINK.CREATED_AT} DESC NULLS LAST
    LIMIT 1
    `,
    [companyId, telegramUserId]
  );

  return rows[0] || null;
}
