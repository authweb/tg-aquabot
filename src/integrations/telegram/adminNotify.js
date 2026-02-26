// src/integrations/telegram/adminNotify.js
import { env } from "../../config/env.js";

function toNumberOrString(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : String(v);
}

export async function notifyAdmin(bot, text) {
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
