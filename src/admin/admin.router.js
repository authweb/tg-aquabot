import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";

import { findActiveAdminByLogin, touchLastLogin } from "../db/repos/adminUsersRepo.js";
import { listClientsLinks, listDistinctStatuses } from "../db/repos/clientsLinkAdminRepo.js";
import { getBotUsersStats } from "../db/repos/adminStatsRepo.js";

export const adminRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
});

function requireAdmin(req, res, next) {
  if (req.session?.adminUserId) return next();
  return res.redirect("/admin/login");
}

function renderPage(title, body) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;max-width:760px;margin:40px auto;padding:0 16px}
    .card{border:1px solid #e5e7eb;border-radius:16px;padding:16px;margin:12px 0}
    .row{display:flex;gap:12px;flex-wrap:wrap}
    .btn{display:inline-block;padding:10px 14px;border-radius:12px;border:1px solid #111;background:#111;color:#fff;text-decoration:none}
    .btn2{display:inline-block;padding:10px 14px;border-radius:12px;border:1px solid #111;background:#fff;color:#111;text-decoration:none}
    input{width:100%;padding:10px 12px;border-radius:12px;border:1px solid #e5e7eb}
    .muted{color:#6b7280}
  </style>
</head>
<body>
${body}
</body></html>`;
}

adminRouter.get("/login", (req, res) => {
  if (req.session?.adminUserId) return res.redirect("/admin");
  const err = req.query?.err ? `<div class="card" style="border-color:#fecaca;background:#fef2f2">Неверный логин/пароль</div>` : "";
  res.type("html").send(
    renderPage(
      "Admin Login",
      `
      <h1>Admin Panel</h1>
      <p class="muted">Вход</p>
      ${err}
      <form class="card" method="post" action="/admin/login">
        <label>Логин</label>
        <input name="login" autocomplete="username" />
        <div style="height:10px"></div>
        <label>Пароль</label>
        <input name="password" type="password" autocomplete="current-password" />
        <div style="height:14px"></div>
        <button class="btn" type="submit">Войти</button>
      </form>
      `
    )
  );
});

adminRouter.post("/login", loginLimiter, async (req, res) => {
  try {
    const login = String(req.body?.login ?? "").trim();
    const password = String(req.body?.password ?? "");

    if (!login || !password) return res.redirect("/admin/login?err=1");

    const admin = await findActiveAdminByLogin(login);
    if (!admin) return res.redirect("/admin/login?err=1");

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.redirect("/admin/login?err=1");

    req.session.adminUserId = admin.id;
    req.session.adminLogin = admin.login;

    await touchLastLogin(admin.id);

    return res.redirect("/admin");
  } catch (e) {
    return res.redirect("/admin/login?err=1");
  }
});

adminRouter.post("/logout", (req, res) => {
  req.session?.destroy?.(() => res.redirect("/admin/login"));
});

adminRouter.get("/clients", requireAdmin, async (req, res) => {
  try {
    const q = String(req.query?.q ?? "").trim();
    const status = String(req.query?.status ?? "").trim() || "";
    const pageNum = Math.max(1, Number(req.query?.page ?? 1) || 1);

    const limit = 50;
    const offset = (pageNum - 1) * limit;

    const [data, statuses] = await Promise.all([
      listClientsLinks({ q: q || null, status: status || null, limit, offset }),
      listDistinctStatuses(),
    ]);

    const totalPages = Math.max(1, Math.ceil(data.total / limit));

    const esc = (s) =>
      String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    // Не обязательно, но полезно: маска телефона (чтобы не светить полностью)
    const maskPhone = (p) => {
      const s = String(p ?? "");
      if (!s) return "";
      if (s.length <= 4) return "****";
      return s.slice(0, 2) + "****" + s.slice(-2);
    };

    const qsBase = new URLSearchParams();
    if (q) qsBase.set("q", q);
    if (status) qsBase.set("status", status);

    const pageLink = (p) => {
      const qs = new URLSearchParams(qsBase);
      qs.set("page", String(p));
      return `/admin/clients?${qs.toString()}`;
    };

    const statusOptions = [`<option value="">Все статусы</option>`].concat(
      statuses.map((s) => `<option value="${esc(s)}"${s === status ? " selected" : ""}>${esc(s)}</option>`)
    );

    const rowsHtml = data.rows
      .map(
        (r) => `
      <tr>
        <td>${esc(r.id)}</td>
        <td>${esc(r.company_id)}</td>
        <td title="${esc(r.phone)}">${esc(maskPhone(r.phone))}</td>
        <td>${esc(r.telegram_user_id)}</td>
        <td>${esc(r.telegram_chat_id)}</td>
        <td>${esc(r.status)}</td>
        <td>${esc(r.updated_at)}</td>
      </tr>`
      )
      .join("");

    res.type("html").send(
      renderPage(
        "Admin – Clients",
        `
      <h1>Admin Panel</h1>
      <p>Вы вошли как: <b>${esc(req.session.adminLogin)}</b></p>

      <nav style="display:flex;gap:12px;margin:10px 0 20px 0">
        <a href="/admin">Дашборд</a>
        <a href="/admin/clients"><b>Клиенты</b></a>
      </nav>

      <h2>Клиенты, попавшие в бота (clients_link)</h2>

      <form method="get" action="/admin/clients" style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0">
        <input name="q" value="${esc(q)}" placeholder="Поиск: телефон / tg user id / chat id" style="padding:8px 10px;min-width:320px"/>
        <select name="status" style="padding:8px 10px">
          ${statusOptions.join("")}
        </select>
        <button type="submit">Найти</button>
      </form>

      <div style="margin:10px 0;color:#6b7280">
        Всего: <b>${data.total}</b>, страница <b>${pageNum}</b> из <b>${totalPages}</b>
      </div>

      <div style="overflow:auto;border:1px solid #e5e7eb;border-radius:12px">
      <table style="border-collapse:collapse;width:100%;min-width:900px">
        <thead>
          <tr style="background:#f9fafb">
            <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb">ID</th>
            <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb">Company</th>
            <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb">Phone</th>
            <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb">TG User</th>
            <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb">TG Chat</th>
            <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb">Status</th>
            <th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb">Updated</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="7" style="padding:14px">Нет данных</td></tr>`}
        </tbody>
      </table>
      </div>

      <div style="display:flex;gap:10px;margin:14px 0;align-items:center">
        ${pageNum > 1 ? `<a href="${pageLink(pageNum - 1)}">← Назад</a>` : `<span style="color:#9ca3af">← Назад</span>`}
        ${pageNum < totalPages ? `<a href="${pageLink(pageNum + 1)}">Вперёд →</a>` : `<span style="color:#9ca3af">Вперёд →</span>`}
      </div>

      <form method="post" action="/admin/logout">
        <button type="submit">Выйти</button>
      </form>
      `
      )
    );
  } catch (e) {
    console.error("[ADMIN /clients] error:", e);
    res.status(500).type("html").send(renderPage("Admin Error", "<h1>500</h1><p>Ошибка на сервере</p>"));
  }
});

adminRouter.get("/", requireAdmin, async (req, res) => {
  const stats = await getBotUsersStats();

  res.type("html").send(
    renderPage(
      "Admin Panel",
      `
      <h1>Admin Panel</h1>
      <p class="muted">Вы вошли как: <b>${req.session.adminLogin}</b></p>

      <div class="card">
        <h2 style="margin:0 0 12px 0">Пользователи бота</h2>
        <div class="row">
          <div class="card" style="flex:1;min-width:220px">
            <div class="muted">Linked users</div>
            <div style="font-size:32px;font-weight:700">${stats.linked_users}</div>
          </div>
          <div class="card" style="flex:1;min-width:220px">
            <div class="muted">All seen users</div>
            <div style="font-size:32px;font-weight:700">${stats.all_seen_users}</div>
          </div>
        </div>
      </div>

      <form method="post" action="/admin/logout">
        <button class="btn2" type="submit">Выйти</button>
      </form>
      `
    )
  );
});



