// src/webhooks/clientNotifications/recordClientNotify.js

import {
    formatRecordCreateMessage,
    formatRecordConfirmedMessage,
    formatRecordChangedMessage,
    formatRecordCanceledMessage,
} from "../formatters/recordMessages.js";

function servicesTitles(data) {
    const s = Array.isArray(data?.services) ? data.services : [];
    return s.map((x) => x?.title).filter(Boolean);
}

function staffName(data) {
    return data?.staff?.name || data?.composite?.staff?.[0]?.name || "—";
}

function formatDateTimeForSnap(data) {
    if (!data) return { date: "—", time: "—" };

    if (typeof data?.date === "string" && data.date.includes(" ")) {
        const [d, t] = data.date.split(" ");
        return { date: d || "—", time: (t || "—").slice(0, 5) };
    }

    if (typeof data?.datetime === "string" && data.datetime.includes("T")) {
        const [d, rest] = data.datetime.split("T");
        const t = (rest || "").split("+")[0].split("Z")[0];
        return { date: d || "—", time: (t || "—").slice(0, 5) };
    }

    return { date: "—", time: "—" };
}

function isCanceled(body) {
    const st = String(body?.status || "").toLowerCase();
    if (["delete", "deleted", "cancel", "canceled", "cancelled", "remove", "removed"].includes(st)) return true;
    if (st === "update" && body?.data?.deleted === true) return true;
    return false;
}

function isNewRecordEvent(body) {
    if (body?.resource !== "record") return false;
    if (body?.status === "create") return true;

    // Yclients иногда шлёт создание как update
    if (body?.status === "update") {
        const created = body?.data?.create_date;
        if (!created) return false;

        const createdAt = new Date(created).getTime();
        const diffMs = Math.abs(Date.now() - createdAt);

        return diffMs <= 2 * 60 * 1000; // 2 минуты
    }

    return false;
}

function snapshot(data) {
    const { date, time } = formatDateTimeForSnap(data);
    return {
        date,
        time,
        staff: staffName(data),
        services: servicesTitles(data),
        confirmed: data?.confirmed ?? null,
        deleted: data?.deleted ?? false,
    };
}

function hashSnap(s) {
    return JSON.stringify(s);
}

// in-memory state
const lastByRecord = new Map(); // key -> { snapHash, confirmed, deleted }
const sentDedup = new Map();    // key -> timestamp
// debounce для "изменения записи"
const pendingChanged = new Map(); // key -> { timer, lastSnap, lastData }

function dedup(key, ttlMs = 10 * 60 * 1000) {
    const now = Date.now();
    const prev = sentDedup.get(key);
    if (prev && now - prev < ttlMs) return true;
    sentDedup.set(key, now);

    if (sentDedup.size > 10000) {
        for (const [k, t] of sentDedup) if (now - t > ttlMs) sentDedup.delete(k);
    }
    return false;
}

function isConfirmedTrue(value) {
    return value === 1 || value === "1" || value === true;
}

function isConfirmedFalse(value) {
    return value === 0 || value === "0" || value === false || value === null || value === undefined;
}

/**
 * Единый клиентский контур уведомлений по record:
 * - create
 * - confirmed (0 -> 1)
 * - changed (ключевые поля)
 * - canceled
 */
export async function handleRecordClientNotifications({
    body,
    bot,
    chatId,
    recordLink,
    reviewLink,
}) {
    const companyId = body?.company_id;
    const recordId = body?.resource_id || body?.data?.id;
    const data = body?.data;

    const key = `rec:${companyId}:${recordId}`;
    const prev = lastByRecord.get(key);

    const curSnap = snapshot(data);
    const curHash = hashSnap(curSnap);

    // 1) CANCEL
    if (isCanceled(body)) {
        if (!dedup(`client:cancel:${key}`)) {
            const text = formatRecordCanceledMessage(data, { recordLink });

            await bot.api.sendMessage(chatId, text, {
                parse_mode: "Markdown",
                disable_web_page_preview: true,
            });
        }

        lastByRecord.set(key, { snapHash: curHash, confirmed: curSnap.confirmed, deleted: true });
        return;
    }

    // 2) CREATE
    if (isNewRecordEvent(body)) {
        // внутри блока CREATE
        if (!dedup(`client:create:${key}`)) {
            const text = formatRecordCreateMessage(data, {
                recordLink,
                staffReviewLink: reviewLink,
            });

            await bot.api.sendMessage(chatId, text, {
                parse_mode: "Markdown",
                disable_web_page_preview: true,
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "✅ Подтвердить запись",
                                callback_data: `rec_confirm:${companyId}:${recordId}`,
                            },
                        ],
                    ],
                },
            });
        }

        lastByRecord.set(key, { snapHash: curHash, confirmed: curSnap.confirmed, deleted: false });
        return;
    }

    // 3) CONFIRMED (0 -> 1)
    const prevConfirmed = prev?.confirmed;
    const curConfirmed = curSnap.confirmed;

    const confirmedBecameTrue = isConfirmedFalse(prevConfirmed) && isConfirmedTrue(curConfirmed);

    if (confirmedBecameTrue) {
        if (!dedup(`client:confirmed:${key}`)) {
            const text = formatRecordConfirmedMessage(data, { recordLink });

            await bot.api.sendMessage(chatId, text, {
                parse_mode: "Markdown",
                disable_web_page_preview: true,
            });
        }
    }

    // 4) CHANGED (если реально изменились ключевые поля)
    const changed = Boolean(prev?.snapHash) && prev.snapHash !== curHash;

    if (changed) {
        const prevPending = pendingChanged.get(key);
        if (prevPending?.timer) {
            clearTimeout(prevPending.timer);
        }

        const timer = setTimeout(async () => {
            try {
                const entry = pendingChanged.get(key);
                pendingChanged.delete(key);
                if (!entry) return;

                // финальный антидубль
                if (dedup(`client:changed:${key}`, 5 * 60 * 1000)) return;

                const text = formatRecordChangedMessage(entry.lastData, {
                    recordLink,
                });

                await bot.api.sendMessage(chatId, text, {
                    parse_mode: "Markdown",
                    disable_web_page_preview: true,
                });
            } catch (e) {
                console.error("[clientNotify changed] send failed", e);
            }
        }, 10_000); // ⏱ 10 секунд debounce

        pendingChanged.set(key, {
            timer,
            lastSnap: curHash,
            lastData: data,
        });
    }

    lastByRecord.set(key, {
        snapHash: curHash,
        confirmed: curConfirmed,
        deleted: false,
    });
}
