import { pool } from "../pool.js";

const TABLE = "public.admin_users";

export async function findActiveAdminByLogin(login) {
    const { rows } = await pool.query(
        `select id, login, password_hash, role, is_active
     from ${TABLE}
     where login = $1 and is_active = true
     limit 1`,
        [login]
    );
    return rows[0] || null;
}

export async function touchLastLogin(id) {
    await pool.query(`update ${TABLE} set last_login_at = now() where id = $1`, [id]);
}
