// src/integrations/telegram/handlers/callbacks.handler.js
import { BOT_TEXT } from "../messages/botMessages.js";
import { buildRecordCard } from "../messages/recordMessages.js";
import { confirmRecord, cancelRecord } from "../../../domain/records.service.js";

const actionTTL = new Map();
const ACTION_TTL_MS = 4000;

function throttleKey({ userId, companyId, recordId, action }) {
  return `${userId}:${companyId}:${recordId}:${action}`;
}

function isThrottled(key) {
  const now = Date.now();
  const prev = actionTTL.get(key);
  if (prev && now - prev < ACTION_TTL_MS) return true;

  actionTTL.set(key, now);

  if (actionTTL.size > 5000) {
    for (const [k, ts] of actionTTL.entries()) {
      if (now - ts > ACTION_TTL_MS) actionTTL.delete(k);
    }
  }

  return false;
}

function parseDateTime(dateTime) {
  const raw = String(dateTime || "");
  if (!raw) return "—";

  if (raw.includes("T")) {
    const [d, rest] = raw.split("T");
    const t = (rest || "").split("+")[0].split("Z")[0].slice(0, 5);
    return `${d} ${t}`.trim();
  }

  if (raw.includes(" ")) {
    const [d, t] = raw.split(" ");
    return `${d} ${(t || "").slice(0, 5)}`.trim();
  }

  return raw;
}

async function safeEditMessage(ctx, text) {
  try {
    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [] },
    });
    return true;
  } catch (e) {
    console.log("[TG callback] editMessageText failed", e?.message || e);
    return false;
  }
}

function parseActionData(data) {
  if (data.startsWith("rec_confirm:")) {
    const [, companyIdRaw, recordIdRaw] = data.split(":");
    return { action: "confirm", companyId: Number(companyIdRaw), recordId: Number(recordIdRaw) };
  }

  if (data.startsWith("rec_cancel:")) {
    const [, companyIdRaw, recordIdRaw] = data.split(":");
    return { action: "cancel", companyId: Number(companyIdRaw), recordId: Number(recordIdRaw) };
  }

  return null;
}

export function registerCallbacks(bot) {
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery?.data || "";
    const parsed = parseActionData(data);
    if (!parsed) return;

    if (!Number.isFinite(parsed.companyId) || !Number.isFinite(parsed.recordId)) {
      await ctx.answerCallbackQuery({ text: "⚠️ Некорректные данные записи", show_alert: true }).catch(() => { });
      return;
    }

    const tgUserId = ctx.from?.id;
    if (!tgUserId) return;

    const lockKey = throttleKey({
      userId: tgUserId,
      companyId: parsed.companyId,
      recordId: parsed.recordId,
      action: parsed.action,
    });

    if (isThrottled(lockKey)) {
      await ctx.answerCallbackQuery({ text: "⏳ Подождите пару секунд" }).catch(() => { });
      return;
    }

    await ctx.answerCallbackQuery().catch(() => { });

    try {
      let result;
      if (parsed.action === "confirm") {
        result = await confirmRecord({
          companyId: parsed.companyId,
          recordId: parsed.recordId,
          telegramUserId: tgUserId,
        });
      } else {
        result = await cancelRecord({
          companyId: parsed.companyId,
          recordId: parsed.recordId,
          telegramUserId: tgUserId,
        });
      }

      if (!result?.ok) {
        const msg =
          result?.reason === "not_linked"
            ? BOT_TEXT.needPhoneForRecord
            : result?.reason === "forbidden"
              ? "⚠️ Эта запись принадлежит другому клиенту."
              : "⚠️ Не удалось обновить запись. Попробуйте позже.";

        await safeEditMessage(ctx, msg);
        return;
      }

      const rec = result?.record;
      const text = buildRecordCard({
        status: parsed.action === "confirm" ? "confirmed" : "cancelled",
        date: parseDateTime(rec?.dateTime),
        service: rec?.service,
        branch: rec?.branch,
      });

      await safeEditMessage(ctx, text);

      await ctx.answerCallbackQuery({
        text: parsed.action === "confirm" ? "✅ Запись подтверждена" : "❌ Запись отменена",
      }).catch(() => { });
    } catch (e) {
      console.log("[TG callback] ERROR", e?.message || e);
      await safeEditMessage(ctx, BOT_TEXT.cbTimeout);
    }
  });
}
