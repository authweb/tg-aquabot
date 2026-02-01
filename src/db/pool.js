// src/db/pool.js
import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

export const pool = new Pool({
  host: env.pg.host,
  port: env.pg.port,
  user: env.pg.user,
  password: env.pg.password,
  database: env.pg.database,
});

// (опционально) быстрый smoke-test
pool.query("select current_user, current_database()")
  .then((r) => console.log("[DB OK]", r.rows[0]))
  .catch((e) => console.error("[DB FAIL]", e.message));
