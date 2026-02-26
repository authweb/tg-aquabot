import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";

const login = process.argv[2];
const password = process.argv[3];

if (!login || !password) {
    console.log("Usage: node scripts/createAdmin.js <login> <password>");
    process.exit(1);
}

const hash = await bcrypt.hash(password, 12);

await pool.query(
    `insert into public.admin_users (login, password_hash, role, is_active)
   values ($1, $2, 'admin', true)
   on conflict (login) do update
     set password_hash = excluded.password_hash,
         is_active = true`,
    [login, hash]
);

console.log("OK: admin upserted:", login);
process.exit(0);
