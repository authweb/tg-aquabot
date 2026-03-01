import { pool } from "../pool.js";
import { TABLES, COLUMNS } from "../schema.js";

export async function isActionProcessed({ companyId, recordId, action }) {
  const { rows } = await pool.query(
    `
    SELECT 1
    FROM ${TABLES.PROCESSED_ACTIONS}
    WHERE ${COLUMNS.PROCESSED_ACTIONS.COMPANY_ID} = $1
      AND ${COLUMNS.PROCESSED_ACTIONS.RECORD_ID} = $2
      AND ${COLUMNS.PROCESSED_ACTIONS.ACTION} = $3
    LIMIT 1
    `,
    [Number(companyId), Number(recordId), String(action)]
  );

  return Boolean(rows[0]);
}

export async function markActionProcessed({ companyId, recordId, action }) {
  await pool.query(
    `
    INSERT INTO ${TABLES.PROCESSED_ACTIONS}
      (${COLUMNS.PROCESSED_ACTIONS.COMPANY_ID},
       ${COLUMNS.PROCESSED_ACTIONS.RECORD_ID},
       ${COLUMNS.PROCESSED_ACTIONS.ACTION})
    VALUES ($1, $2, $3)
    ON CONFLICT (${COLUMNS.PROCESSED_ACTIONS.COMPANY_ID}, ${COLUMNS.PROCESSED_ACTIONS.RECORD_ID}, ${COLUMNS.PROCESSED_ACTIONS.ACTION}) DO NOTHING
    `,
    [Number(companyId), Number(recordId), String(action)]
  );
}
