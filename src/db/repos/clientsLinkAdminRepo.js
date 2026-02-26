import { pool } from "../pool.js";

export async function listClientsLinks({ q, status, limit = 50, offset = 0 }) {
    const where = [];
    const params = [];
    let i = 1;

    if (status) {
        where.push(`status = $${i++}`);
        params.push(status);
    }

    if (q) {
        // q может быть телефоном или tg id
        // телефон ищем по подстроке (нормализацию лучше делать на входе, но минимально так)
        where.push(`(
      phone ilike $${i} OR
      cast(telegram_user_id as text) = $${i} OR
      cast(telegram_chat_id as text) = $${i}
    )`);
        params.push(`%${q}%`);
        i++;
    }

    const whereSql = where.length ? `where ${where.join(" and ")}` : "";

    const totalRes = await pool.query(
        `select count(*)::int as c
     from public.clients_link
     ${whereSql}`,
        params
    );

    const rowsRes = await pool.query(
        `select
        id,
        company_id,
        phone,
        telegram_user_id,
        telegram_chat_id,
        status,
        updated_at,
        created_at
     from public.clients_link
     ${whereSql}
     order by updated_at desc nulls last, id desc
     limit $${i++} offset $${i++}`,
        [...params, limit, offset]
    );

    return { total: totalRes.rows[0]?.c ?? 0, rows: rowsRes.rows };
}

export async function listDistinctStatuses() {
    const { rows } = await pool.query(
        `select distinct status from public.clients_link where status is not null order by status asc`
    );
    return rows.map((r) => r.status);
}
