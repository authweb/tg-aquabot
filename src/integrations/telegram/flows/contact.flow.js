import { normalizePhone } from "../../utils/phone.js";
import { env } from "../../config/env.js";

import { upsertClientLink, markClientLinked } from "../../db/repos/clientsLinkRepo.js";
import { findClientByPhone } from "../yclients/clients.service.js";

import { removeKeyboard } from "../keyboards.js";
import { BOT_TEXT } from "../messages.js"; // если у тебя есть; иначе замени на строки
import { reconcileAfterClientLinked } from "../../jobs/planners/confirm.planner.js"; // или куда ты положишь reconcile

import { notifyAdmin } from "../notifyAdmin.js"; // если есть; иначе убери

export function registerContactFlow(bot) {
    bot.on("message:contact", async (ctx) => {
        try {
            const contact = ctx.message.contact;
            const phone = normalizePhone(contact?.phone_number);

            if (!phone) {
                await ctx.reply("Не смог распознать номер телефона. Попробуйте ещё раз.");
                return;
            }

            // 1) сохраняем TG -> phone (pending)
            await upsertClientLink({
                companyId: Number(env.yclientsCompanyId),
                phone,
                telegramUserId: ctx.from.id,
                telegramChatId: ctx.chat.id,
            });

            // 2) ищем клиента в YCLIENTS
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

                // 3) reconciliation: догоняем будущие записи + ставим jobs
                await reconcileAfterClientLinked({
                    companyId: Number(env.yclientsCompanyId),
                    telegramChatId: ctx.chat.id,
                    yclientsClientId: Number(found.id),
                });

                await ctx.reply(`✅ Номер привязан: ${phone}`, {
                    reply_markup: removeKeyboard(),
                });
                return;
            }

            // 3) не нашли — остаёмся pending
            await ctx.reply(
                `Номер получен: ${phone}\nПока не нашли вас в базе. Администратор проверит и привяжет.`,
                { reply_markup: removeKeyboard() }
            );

            // опционально админу
            // await notifyAdmin(`⚠️ Не нашли клиента по телефону ${phone}. tgUser=${ctx.from.id}`);
        } catch (e) {
            console.error("[CONTACT FLOW ERROR]", e?.response?.data || e);
            await ctx.reply("Ошибка при привязке номера. Попробуйте позже.");
            // await notifyAdmin(...)
        }
    });
}
