// src/integrations/telegram/handlers/callbacks.handler.js
import { BOT_TEXT } from "../messages/botMessages.js";

import {
    confirmRecordInYclients,
    getRecordFromYclients,
} from "../../yclients/records.service.js";

function replyMd(ctx, text, extra = {}) {
    return ctx.reply(text, { parse_mode: "Markdown", ...extra });
}

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${ms}ms`)), ms)),
    ]);
}

export function registerCallbacks(bot) {
    bot.on("callback_query:data", async (ctx) => {
        const data = ctx.callbackQuery?.data || "";

        console.log("[TG callback] IN", {
            from: ctx.from?.id,
            chat: ctx.chat?.id,
            data,
        });

        await ctx.answerCallbackQuery().catch((e) => {
            console.log("[TG callback] answerCallbackQuery failed", e?.message || e);
        });

        if (!data.startsWith("rec_confirm:")) return;

        const [, companyIdRaw, recordIdRaw] = data.split(":");
        const companyId = Number(companyIdRaw);
        const recordId = Number(recordIdRaw);

        const clearMarkup = async () => {
            try {
                await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
                console.log("[TG callback] markup cleared");
            } catch (e) {
                console.log("[TG callback] editMessageReplyMarkup failed", e?.message || e);
            }
        };

        const safeReply = async (text) => replyMd(ctx, text).catch(() => { });
        const safeAlert = async (text) =>
            ctx.answerCallbackQuery({ text, show_alert: true }).catch(() => { });

        try {
            await safeReply(BOT_TEXT.cbChecking);

            const check = await withTimeout(getRecordFromYclients({ companyId, recordId }), 8000);
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

            // подтверждение клиента = attendance===2
            if (Number(rec?.attendance) === 2) {
                await clearMarkup();
                await safeReply(BOT_TEXT.cbAlreadyConfirmed);
                return;
            }

            await safeReply(BOT_TEXT.cbConfirming);

            const upd = await withTimeout(confirmRecordInYclients({ companyId, recordId }), 8000);

            console.log("[TG callback] update meta:", JSON.stringify(upd?.raw?.meta, null, 2));
            console.log("[TG callback] update errors:", JSON.stringify(upd?.raw?.meta?.errors, null, 2));
            if (upd?.builtPayload) {
                console.log("[TG callback] confirm builtPayload:", JSON.stringify(upd.builtPayload, null, 2));
            }

            if (!upd?.ok) {
                await clearMarkup();
                await safeAlert(BOT_TEXT.cbUpdateFailAlert);
                await safeReply(BOT_TEXT.cbUpdateFailMsg);
                return;
            }

            await clearMarkup();
            await ctx.answerCallbackQuery({ text: "✅ Подтверждено" }).catch(() => { });
            console.log("[TG callback] done OK");
        } catch (e) {
            console.log("[TG callback] ERROR", e?.message || e);

            const msg = String(e?.message || e).includes("Timeout")
                ? BOT_TEXT.cbTimeout
                : `🚨 Ошибка подтверждения: ${e?.message || e}`;

            await safeReply(msg);
        }
    });
}
