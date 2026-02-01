// src/app.js
import fs from "fs";
import path from "path";
import express from "express";
import { Bot, Keyboard, InlineKeyboard } from "grammy";

import { env } from "./config/env.js";
import { normalizePhone } from "./utils/phone.js";

import {
  upsertClientLink,
  markClientLinked,
  getLinkByTelegramUserId,
} from "./db/clientsLinkRepo.js";

import { findClientByPhone } from "./yclients/clients.service.js";
import {
  confirmRecordInYclients,
  getRecordFromYclients,
  listRecordsFromYclients,
} from "./yclients/records.service.js";

import { startPendingLinksRecheck } from "./jobs/recheckPendingLinks.js";
import { handleYclientsWebhook } from "./webhooks/yclientsWebhook.js";

// ✅ Тексты/форматтеры (ты создал botMessages.js здесь)
import {
  BOT_TEXT,
  buildRecordCard,
  buildAdminClientNotFound,
  buildAdminContactFlowError,
} from "./webhooks/formatters/botMessages.js";

console.log("[ENV CHECK] TELEGRAM_BOT_TOKEN:", Boolean(process.env.TELEGRAM_BOT_TOKEN));
console.log("[ENV CHECK] env.telegramBotToken:", Boolean(env.telegramBotToken));

const bot = new Bot(env.telegramBotToken);

// -------------------- HTTP для YCLIENTS webhook --------------------
const httpApp = express();

httpApp.use(express.json({ limit: "2mb" }));
httpApp.use(express.urlencoded({ extended: true }));

function dumpWebhook(body) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = "/opt/tg-aquabot/webhook-dumps";
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${ts}.json`);
  fs.writeFileSync(file, JSON.stringify(body, null, 2), "utf-8");
  console.log("[WEBHOOK] saved:", file);
}

httpApp.post("/yclients/webhook", async (req, res) => {
  console.log("[WEBHOOK IN]", {
    ts: new Date().toISOString(),
    resource: req.body?.resource,
    status: req.body?.status,
    company_id: req.body?.company_id,
    resource_id: req.body?.resource_id,
    phone: req.body?.data?.client?.phone,
  });

  dumpWebhook(req.body);
  res.sendStatus(200); // сразу подтверждаем

  try {
    await handleYclientsWebhook({
      body: req.body,
      bot,
    });
  } catch (e) {
    console.error("[WEBHOOK] error", e);
  }
});

// health-check
httpApp.get("/health", (req, res) => res.status(200).send("ok"));

const port = Number(process.env.WEBHOOK_PORT || 3000);

// слушаем только localhost (безопасно)
httpApp.listen(port, "127.0.0.1", () => {
  console.log(`[HTTP] Webhook server listening on 127.0.0.1:${port}`);
});

// -------------------- helpers --------------------
function toNumberOrString(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : String(v);
}

async function notifyAdmin(text) {
  const adminChatId = env.telegramAdminChatId
    ? toNumberOrString(env.telegramAdminChatId)
    : null;
  if (!adminChatId) return;

  try {
    await bot.api.sendMessage(adminChatId, text);
  } catch (e) {
    console.warn("[ADMIN NOTIFY ERROR]", e?.message || e);
  }
}

function contactKeyboard() {
  return new Keyboard().requestContact("📱 Отправить номер телефона").resized();
}

function todayYmd() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatRecordDateTime(rec) {
  const s = String(rec?.datetime || rec?.date || "");
  let date = "—";
  let time = "—";

  if (s.includes("T")) {
    const [dPart, rest] = s.split("T");
    date = dPart || "—";
    const t = (rest || "").split("+")[0].split("Z")[0];
    time = (t || "—").slice(0, 5);
  } else if (s.includes(" ")) {
    const [dPart, tPart] = s.split(" ");
    date = dPart || "—";
    time = (tPart || "—").slice(0, 5);
  }
  return { date, time };
}

// -------------------- bot commands --------------------
bot.command("start", async (ctx) => {
  // можно оставить oneTime(), но remove_keyboard мы делаем после получения контакта
  const keyboard = new Keyboard()
    .requestContact("Отправить номер телефона")
    .resized()
    .oneTime();

  await ctx.reply(BOT_TEXT.start, { reply_markup: keyboard });
});

bot.command("help", async (ctx) => {
  await ctx.reply(BOT_TEXT.help);
});

bot.command(["phone", "number"], async (ctx) => {
  await ctx.reply(BOT_TEXT.phonePrompt, { reply_markup: contactKeyboard() });
});

bot.command("record", async (ctx) => {
  const companyId = Number(env.yclientsCompanyId);

  const link = await getLinkByTelegramUserId({
    companyId,
    telegramUserId: ctx.from.id,
  });

  if (!link?.phone) {
    await ctx.reply(BOT_TEXT.needPhoneForRecord, {
      reply_markup: contactKeyboard(),
    });
    return;
  }

  const clientId = Number(link.yclients_client_id || 0);
  if (!clientId) {
    await ctx.reply(BOT_TEXT.profileNotLinked);
    return;
  }

  await ctx.reply(BOT_TEXT.searchingRecord);

  const list = await listRecordsFromYclients({
    companyId,
    clientId,
    startDate: todayYmd(),
    count: 10,
    page: 1,
  });

  if (!list.ok || !Array.isArray(list.data)) {
    await ctx.reply(BOT_TEXT.listRecordsFail);
    return;
  }

  const next = list.data.find((r) => r && r.deleted !== true) || null;

  if (!next) {
    await ctx.reply(BOT_TEXT.noActiveRecords);
    return;
  }

  // ✅ подтверждение клиента = attendance===2
  const isConfirmed = Number(next?.attendance) === 2;

  const { date, time } = formatRecordDateTime(next);
  const services = Array.isArray(next.services)
    ? next.services.map((s) => s?.title).filter(Boolean)
    : [];
  const linkUrl =
    next.short_link ||
    next.link ||
    (next.id ? `https://yclients.com/record/${companyId}/${next.id}` : null);

  let text = buildRecordCard({
    companyId,
    record: next,
    date,
    time,
    services,
    linkUrl,
  });

  let reply_markup = undefined;

  if (!isConfirmed) {
    text += "\n\n" + BOT_TEXT.recordNeedConfirmHint;
    reply_markup = new InlineKeyboard().text(
      "✅ Подтвердить запись",
      `rec_confirm:${companyId}:${next.id}`
    );
  }

  await ctx.reply(text, {
    disable_web_page_preview: true,
    ...(reply_markup ? { reply_markup } : {}),
  });
});

// -------------------- contact flow --------------------
bot.on("message:contact", async (ctx) => {
  try {
    const contact = ctx.message.contact;
    const phone = normalizePhone(contact?.phone_number);

    if (!phone) {
      await ctx.reply(BOT_TEXT.cantParsePhone);
      return;
    }

    // 1) Сохраняем связь Telegram -> phone (pending)
    const linkRow = await upsertClientLink({
      companyId: Number(env.yclientsCompanyId),
      phone,
      telegramUserId: ctx.from.id,
      telegramChatId: ctx.chat.id,
    });

    console.log("[LINK SAVED]", linkRow);

    // 2) Пытаемся найти клиента в Yclients
    const found = await findClientByPhone({
      companyId: Number(env.yclientsCompanyId),
      phone,
    });

    if (found?.id) {
      const linked = await markClientLinked({
        companyId: Number(env.yclientsCompanyId),
        telegramUserId: ctx.from.id,
        yclientsClientId: Number(found.id),
      });

      console.log("[LINKED]", linked);

      await ctx.reply(BOT_TEXT.phoneLinkedOk(phone), {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    // 3) Не нашли — остаёмся pending + информируем админа
    await ctx.reply(BOT_TEXT.phonePending(phone), {
      reply_markup: { remove_keyboard: true },
    });

    await notifyAdmin(
      buildAdminClientNotFound({
        phone,
        tgUserId: ctx.from.id,
        tgChatId: ctx.chat.id,
        companyId: env.yclientsCompanyId,
      })
    );
  } catch (e) {
    console.error("[CONTACT FLOW ERROR]", e?.response?.data || e);

    await ctx.reply(BOT_TEXT.contactFlowError);

    await notifyAdmin(
      buildAdminContactFlowError({
        tgUserId: ctx.from?.id,
        errorMessage: e?.message || String(e),
        details: e?.response?.data
          ? JSON.stringify(e.response.data).slice(0, 1000)
          : "",
      })
    );
  }
});

// -------------------- callback confirm record --------------------
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery?.data || "";

  console.log("[TG callback] IN", {
    from: ctx.from?.id,
    chat: ctx.chat?.id,
    data,
  });

  // закрываем "часики" в телеге
  await ctx.answerCallbackQuery().catch((e) => {
    console.log("[TG callback] answerCallbackQuery failed", e?.message || e);
  });

  if (!data.startsWith("rec_confirm:")) {
    console.log("[TG callback] not rec_confirm, exit");
    return;
  }

  const [, companyIdRaw, recordIdRaw] = data.split(":");
  const companyId = Number(companyIdRaw);
  const recordId = Number(recordIdRaw);

  console.log("[TG callback] parsed", { companyId, recordId });

  const withTimeout = (p, ms) =>
    Promise.race([
      p,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout ${ms}ms`)), ms)
      ),
    ]);

  const clearMarkup = async () => {
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
      console.log("[TG callback] markup cleared");
    } catch (e) {
      console.log("[TG callback] editMessageReplyMarkup failed", e?.message || e);
    }
  };

  const safeReply = async (text) => ctx.reply(text).catch(() => { });
  const safeAlert = async (text) =>
    ctx.answerCallbackQuery({ text, show_alert: true }).catch(() => { });

  try {
    await safeReply(BOT_TEXT.cbChecking);

    // 1) читаем запись
    const check = await withTimeout(
      getRecordFromYclients({ companyId, recordId }),
      8000
    );

    if (!check.ok) {
      await safeReply(BOT_TEXT.cbGetRecordFail);
      return;
    }

    const rec = check.raw?.data || check.data;

    console.log("[TG callback] record status before", {
      record_id: rec?.id ?? recordId,
      confirmed: rec?.confirmed,
      attendance: rec?.attendance,
      visit_attendance: rec?.visit_attendance,
      datetime: rec?.datetime,
      date: rec?.date,
      staff_id: rec?.staff_id,
      services_count: Array.isArray(rec?.services) ? rec.services.length : rec?.services_count,
      client_id: rec?.client?.id,
    });

    // ✅ подтверждение клиента = attendance===2
    if (Number(rec?.attendance) === 2) {
      await clearMarkup();
      await safeReply(BOT_TEXT.cbAlreadyConfirmed);
      console.log("[TG callback] attendance=2 already, skipped update");
      return;
    }

    await safeReply(BOT_TEXT.cbConfirming);

    const upd = await withTimeout(
      confirmRecordInYclients({ companyId, recordId }),
      8000
    );

    console.log("[TG callback] update meta:", JSON.stringify(upd?.raw?.meta, null, 2));
    console.log("[TG callback] update errors:", JSON.stringify(upd?.raw?.meta?.errors, null, 2));
    if (upd?.builtPayload) {
      console.log("[TG callback] confirm builtPayload:", JSON.stringify(upd.builtPayload, null, 2));
    }

    if (!upd?.ok) {
      await clearMarkup();
      await safeAlert(BOT_TEXT.cbUpdateFailAlert);
      await safeReply(BOT_TEXT.cbUpdateFailMsg);
      console.log("[TG callback] confirm failed", upd);
      return;
    }

    // 3) перечитываем “после” (для дебага)
    const after = await withTimeout(
      getRecordFromYclients({ companyId, recordId }),
      8000
    );

    if (after.ok) {
      const rec2 = after.raw?.data || after.data;
      console.log("[TG callback] record status after", {
        attendance: rec2?.attendance,
        visit_attendance: rec2?.visit_attendance,
        confirmed: rec2?.confirmed,
      });
    }

    await clearMarkup();
    await safeReply(BOT_TEXT.cbOk);
    console.log("[TG callback] done OK");
  } catch (e) {
    console.log("[TG callback] ERROR", e?.message || e);

    const msg = String(e?.message || e).includes("Timeout")
      ? BOT_TEXT.cbTimeout
      : `🚨 Ошибка подтверждения: ${e?.message || e}`;

    await safeReply(msg);
  }
});

bot.catch((err) => {
  console.error("[BOT ERROR]", err);
});

console.log("[APP] Starting Aquabot...");
await bot.start();
startPendingLinksRecheck(bot);
console.log("[APP] Aquabot started.");
