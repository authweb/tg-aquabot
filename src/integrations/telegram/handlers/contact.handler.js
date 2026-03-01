// src/integrations/telegram/handlers/contact.handler.js
import { env } from "../../../config/env.js";
import { normalizePhone } from "../../../utils/phone.js";

import {
    upsertClientLink,
    markClientLinked,
} from "../../../db/repos/clientsLinkRepo.js";

import { findOrCreateClientByPhone } from "../../../domain/clients.service.js";

import {
    BOT_TEXT,
    buildAdminClientNotFound,
    buildAdminContactFlowError,
} from "../messages/botMessages.js";

import { notifyAdmin } from "../adminNotify.js";
import { logUserAction } from "../../../db/repos/userActionsLogRepo.js";

function replyMd(ctx, text, extra = {}) {
    return ctx.reply(text, { parse_mode: "Markdown", ...extra });
}

export function registerContactFlow(bot) {
    bot.on("message:contact", async (ctx) => {
        try {
            const contact = ctx.message.contact;
            const phone = normalizePhone(contact?.phone_number);

            if (!phone) {
                await replyMd(ctx, BOT_TEXT.cantParsePhone);
                return;
            }

            const companyId = Number(env.yclientsCompanyId);
            await logUserAction({ telegramUserId: ctx.from.id, companyId, action: "contact_shared", payload: { phone } });

            // 1) Telegram -> phone (pending)
            const linkRow = await upsertClientLink({
                companyId,
                phone,
                telegramUserId: ctx.from.id,
                telegramChatId: ctx.chat.id,
            });

            console.log("[LINK SAVED]", linkRow);

            // 2) find client in Yclients
            const found = await findOrCreateClientByPhone({ companyId, phone });

            if (found?.id) {
                const linked = await markClientLinked({
                    companyId,
                    telegramUserId: ctx.from.id,
                    yclientsClientId: Number(found.id),
                });

                console.log("[LINKED]", linked);

                await replyMd(ctx, BOT_TEXT.phoneLinkedOk(phone), {
                    reply_markup: { remove_keyboard: true },
                });
                await logUserAction({ telegramUserId: ctx.from.id, companyId, action: "link_client", payload: { phone, yclientsClientId: Number(found.id) } });
                return;
            }

            // 3) not found -> pending + admin notify
            await replyMd(ctx, BOT_TEXT.phonePending(phone), {
                reply_markup: { remove_keyboard: true },
            });

            await notifyAdmin(
                bot,
                buildAdminClientNotFound({
                    phone,
                    tgUserId: ctx.from.id,
                    tgChatId: ctx.chat.id,
                    companyId: env.yclientsCompanyId,
                })
            );
        } catch (e) {
            console.error("[CONTACT FLOW ERROR]", e?.response?.data || e);

            await replyMd(ctx, BOT_TEXT.contactFlowError);

            await notifyAdmin(
                bot,
                buildAdminContactFlowError({
                    tgUserId: ctx.from?.id,
                    errorMessage: e?.message || String(e),
                    details: e?.response?.data ? JSON.stringify(e.response.data).slice(0, 1000) : "",
                })
            );
        }
    });
}
