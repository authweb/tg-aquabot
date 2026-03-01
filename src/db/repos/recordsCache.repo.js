import { pool } from "../pool.js";
import { TABLES, COLUMNS } from "../schema.js";

export async function getRecordCacheById({ companyId, recordId }) {
    const { rows } = await pool.query(
        `
    SELECT *
    FROM ${TABLES.RECORDS_CACHE}
    WHERE ${COLUMNS.RECORDS_CACHE.COMPANY_ID} = $1
      AND ${COLUMNS.RECORDS_CACHE.RECORD_ID} = $2
    LIMIT 1
    `,
        [Number(companyId), Number(recordId)]
    );

    return rows[0] || null;
}
