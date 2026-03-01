// src/integrations/telegram/handlers/commands.handler.js
import { InlineKeyboard, Keyboard } from "grammy";

import { env } from "../../../config/env.js";
import { contactKeyboard } from "../keyboards.js";

import { getLinkByTelegramUserId } from "../../../db/repos/clientsLinkRepo.js";
import { listRecordsFromYclients } from "../../yclients/records.service.js";

import { BOT_TEXT, buildRecordCard } from "../messages/botMessages.js";

function replyMd(ctx, text, extra = {}) {
    return ctx.reply(text, { parse_mode: "Markdown", ...extra });
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

export function registerCommands(bot) {
    bot.command("start", async (ctx) => {
        const keyboard = new Keyboard()
            .requestContact("📱 Отправить номер телефона")
            .resized()
            .oneTime();

        await replyMd(ctx, BOT_TEXT.start, { reply_markup: keyboard });
    });

    bot.command("help", async (ctx) => {
        await replyMd(ctx, BOT_TEXT.help);
    });

    bot.command(["phone", "number"], async (ctx) => {
        await replyMd(ctx, BOT_TEXT.phonePrompt, { reply_markup: contactKeyboard() });
    });

    bot.command("record", async (ctx) => {
        const companyId = Number(env.yclientsCompanyId);

        const link = await getLinkByTelegramUserId({
            companyId,
            telegramUserId: ctx.from.id,
        });

        if (!link?.phone) {
            await replyMd(ctx, BOT_TEXT.needPhoneForRecord, {
                reply_markup: contactKeyboard(),
            });
            return;
        }

        const clientId = Number(link.yclients_client_id || 0);
        if (!clientId) {
            await replyMd(ctx, BOT_TEXT.profileNotLinked);
            return;
        }

        await replyMd(ctx, BOT_TEXT.searchingRecord);

        const list = await listRecordsFromYclients({
            companyId,
            clientId,
            startDate: todayYmd(),
            count: 10,
            page: 1,
        });

        if (!list.ok || !Array.isArray(list.data)) {
            await replyMd(ctx, BOT_TEXT.listRecordsFail);
            return;
        }

        const next = list.data.find((r) => r && r.deleted !== true) || null;

        if (!next) {
            await replyMd(ctx, BOT_TEXT.noActiveRecords);
            return;
        }

        // подтверждение клиента = attendance===2
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

        let reply_markup;

        if (!isConfirmed) {
            text += "\n\n" + BOT_TEXT.recordNeedConfirmHint;
            reply_markup = new InlineKeyboard().text(
                "✅ Подтвердить запись",
                `rec_confirm:${companyId}:${next.id}`
            );
        }

        await replyMd(ctx, text, {
            disable_web_page_preview: true,
            ...(reply_markup ? { reply_markup } : {}),
        });
    });
}
