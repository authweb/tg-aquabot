// src/webhooks/recordHandlers.js
import { getLinkedChatByPhone } from "../../db/repos/clientsLinkRepo.js";
import { missingPhoneRule } from "../../webhooks/rules/missingPhoneRule.js";
import { notLinkedRule } from "../../webhooks/rules/notLinkedRule.js";
import { notConfirmedRule } from "../../webhooks/rules/notConfirmedRule.js";
import { recordCanceledRule } from "../../webhooks/rules/recordCanceledRule.js";
import { noShowRule } from "../../webhooks/rules/noShowRule.js";
import { handleRecordClientNotifications } from "../../webhooks/clientNotifications/recordClientNotify.js";

function buildRecordLink(body) {
    return (
        body?.data?.short_link ||
        body?.data?.link ||
        (body?.company_id && body?.resource_id
            ? `https://yclients.com/record/${body.company_id}/${body.resource_id}`
            : null)
    );
}

function buildStaffReviewLink({ widgetId, companyId, staffId }) {
    if (!widgetId || !companyId || !staffId) return null;
    return `https://n${widgetId}.yclients.com/company/${companyId}/select-master/master-info/${companyId}/${staffId}`;
}

// Достаём staffId максимально надёжно под твой payload
function extractStaffId(data) {
    return data?.staff?.id || data?.composite?.staff?.[0]?.id || null;
}

// Приоритет: то, что отдаёт Yclients в webhook → затем fallback-генерация
function pickReviewLink({ body, fallbackStaffReviewLink }) {
    return body?.data?.review_link || fallbackStaffReviewLink || null;
}

export async function handleRecordEvent({ body, bot }) {
    // ✅ safety: работаем только с record
    if (body?.resource !== "record") return;

    // ✅ 1) RULES / алерты — должны отрабатывать на ЛЮБЫЕ record события
    await missingPhoneRule({ body, bot });
    await notConfirmedRule({ body, bot });
    await recordCanceledRule({ body, bot });
    await noShowRule({ body, bot });

    // ✅ 2) Клиентские уведомления — тоже на ЛЮБЫЕ record события,
    // но только если есть телефон и есть привязка к Telegram
    const company_id = body?.company_id;
    const resource_id = body?.resource_id;
    const data = body?.data;

    if (!company_id || !resource_id || !data) {
        console.warn("[record] bad payload", {
            company_id,
            resource_id,
            hasData: Boolean(data),
        });
        return;
    }

    const phone = data?.client?.phone;
    if (!phone) {
        // клиенту писать некуда — и это уже покрыто missingPhoneRule
        return;
    }

    const chatId = await getLinkedChatByPhone({
        companyId: Number(company_id),
        phone,
    });

    if (!chatId) {
        // админский сигнал — клиент не привязан
        await notLinkedRule({ body, bot, phone });
        return;
    }

    const staffId = extractStaffId(data);

    const staffReviewLinkFallback = buildStaffReviewLink({
        widgetId: process.env.YCLIENTS_WIDGET_ID,
        companyId: Number(company_id),
        staffId: staffId ? Number(staffId) : null,
    });

    const reviewLink = pickReviewLink({
        body,
        fallbackStaffReviewLink: staffReviewLinkFallback,
    });

    const recordLink = buildRecordLink(body);

    // ✅ Единый клиентский контур: create / confirmed / changed / canceled
    await handleRecordClientNotifications({
        body,
        bot,
        chatId,
        recordLink,
        reviewLink,
    });

    console.log("[record] client notifications processed", {
        phone,
        chatId,
        recordId: resource_id,
        companyId: company_id,
        status: body.status,
    });
}
