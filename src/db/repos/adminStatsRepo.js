import { pool } from "../pool.js";

export async function getBotUsersStats() {
    // linked_users = реально "привязанные" (подстрой под ваш реальный статус)
    const linked = await pool.query(
        `select count(distinct telegram_user_id)::int as c
     from public.clients_link
     where telegram_user_id is not null
       and status = 'linked'`
    );

    // all_seen_users = все, кто хоть раз появлялся в таблице связок
    const allSeen = await pool.query(
        `select count(distinct telegram_user_id)::int as c
     from public.clients_link
     where telegram_user_id is not null`
    );

    return {
        linked_users: linked.rows[0]?.c ?? 0,
        all_seen_users: allSeen.rows[0]?.c ?? 0,
    };
}
