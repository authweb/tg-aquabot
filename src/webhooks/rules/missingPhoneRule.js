function isEmpty(value) {
    if (value === null || value === undefined) return true;
    const s = String(value).trim();
    return s.length === 0;
}

function safe(value, fallback = "—") {
    return isEmpty(value) ? fallback : String(value);
}

function extractServicesTitles(data) {
    const services = Array.isArray(data?.services) ? data.services : [];
    return services.map(s => s?.title).filter(Boolean);
}

function extractStaffName(data) {
    return data?.staff?.name || data?.composite?.staff?.[0]?.name || null;
}

function formatDateTime(body) {
    const d = body?.data;
    if (!d) return { date: "—", time: "—" };

    // предпочтение: "YYYY-MM-DD HH:mm:ss"
    if (typeof d.date === "string" && d.date.includes(" ")) {
        const [datePart, timePart] = d.date.split(" ");
        return {
            date: datePart || "—",
            time: (timePart || "—").slice(0, 5),
        };
    }

    // fallback: "YYYY-MM-DDTHH:mm:ss+07:00"
    if (typeof d.datetime === "string" && d.datetime.includes("T")) {
        const [datePart, rest] = d.datetime.split("T");
        const timePart = (rest || "").split("+")[0].split("Z")[0];
        return {
            date: datePart || "—",
            time: (timePart || "—").slice(0, 5),
        };
    }

    return { date: "—", time: "—" };
}

/**
 * pending: debounce на "нет телефона" (чтобы не спамило на черновиках)
 * openIssues: записи, по которым мы уже отправили "нет телефона"
 * resolvedSent: антиспам на "исправлено"
 */
const pending = new Map();        // key -> { timer, lastBody }
const openIssues = new Map();     // key -> { openedAt, recordId }
const resolvedSent = new Map();   // key -> timestamp

function wasSentRecently(map, key, ttlMs) {
    const now = Date.now();
    const prev = map.get(key);
    if (prev && now - prev < ttlMs) return true;
    map.set(key, now);

    if (map.size > 5000) {
        for (const [k, t] of map) if (now - t > ttlMs) map.delete(k);
    }
    return false;
}

export async function missingPhoneRule({ body, bot, logger = console }) {
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!adminChatId) {
        logger.warn("[RULE missingPhone] TELEGRAM_ADMIN_CHAT_ID not set");
        return;
    }

    if (body?.resource !== "record") return;
    if (!["create", "update"].includes(body?.status)) return;

    const recordId = body?.resource_id || body?.data?.id;
    const companyId = body?.company_id;

    // ВСЕГДА только recordId (api_id не используем)
    const key = `missing_phone:${companyId}:${recordId}`;

    const client = body?.data?.client; // может быть null
    const phone = client?.phone;

    // ============================
    // 1) ВЕТКА "ИСПРАВЛЕНО"
    // ============================
    // Если телефон появился, а issue был открыт — шлём "✅ добавлен телефон" (один раз)
    if (!isEmpty(phone)) {
        // сбрасываем debounce (если был)
        const pend = pending.get(key);
        if (pend?.timer) clearTimeout(pend.timer);
        pending.delete(key);

        if (openIssues.has(key)) {
            // антиспам на resolved (на всякий)
            if (wasSentRecently(resolvedSent, `resolved:${key}`, 30 * 60 * 1000)) {
                openIssues.delete(key);
                return;
            }

            const { date, time } = formatDateTime(body);
            const clientName =
                client?.display_name ||
                client?.name ||
                "не указан";

            const staffName = extractStaffName(body?.data);
            const services = extractServicesTitles(body?.data);
            const shortLink = body?.data?.short_link;
            const comment = body?.data?.comment;

            const text = [
                "✅ Телефон добавлен",
                " ",
                `🧾 Record ID: ${safe(recordId)}`,
                `👤 Клиент: ${safe(clientName)}`,
                `📞 Телефон: ${safe(phone)}`,
                `📅 Дата: ${date}`,
                `🕒 Время: ${time}`,
                " ",
                staffName ? `🧑‍💼 Мастер: ${staffName}` : null,
                services.length ? `🧼 Услуги: ${services.join(", ")}` : null,
                comment?.trim() ? `📝 Комментарий: ${comment.trim()}` : null,
                " ",
                shortLink ? `🔗 ${shortLink}` : null,
                " ",
                "🎯 Статус: инцидент закрыт.",
            ].filter(Boolean).join("\n");

            try {
                await bot.api.sendMessage(adminChatId, text, {
                    disable_web_page_preview: true,
                });
                logger.info("[RULE missingPhone] resolved notified", { recordId, phone });
            } catch (e) {
                logger.error("[RULE missingPhone] resolved send failed", e?.message || e);
            } finally {
                // закрываем issue
                openIssues.delete(key);
            }
        }

        return;
    }

    // ============================
    // 2) ВЕТКА "НЕТ ТЕЛЕФОНА"
    // ============================
    // Если телефона нет — подождать окно стабилизации и отправить один алерт
    const prev = pending.get(key);
    if (prev?.timer) clearTimeout(prev.timer);

    const timer = setTimeout(async () => {
        try {
            const entry = pending.get(key);
            pending.delete(key);
            if (!entry?.lastBody) return;

            const latest = entry.lastBody;
            const latestClient = latest?.data?.client;
            const latestPhone = latestClient?.phone;

            // повторная проверка — вдруг телефон уже появился
            if (!isEmpty(latestPhone)) return;

            // если уже есть открытый инцидент — не спамим повторно "нет телефона"
            if (openIssues.has(key)) return;

            const latestRecordId = latest?.resource_id || latest?.data?.id;

            const clientName =
                latestClient?.display_name ||
                latestClient?.name ||
                "не указан";

            const { date, time } = formatDateTime(latest);
            const staffName = extractStaffName(latest?.data);
            const services = extractServicesTitles(latest?.data);
            const shortLink = latest?.data?.short_link;
            const comment = latest?.data?.comment;

            const createdByAdmin = latest?.data?.created_user_id ? "да" : "нет";

            const text = [
                "⚠️ Запись без телефона",
                `🧾 Record ID: ${safe(latestRecordId)}`,
                `👤 Клиент: ${safe(clientName)}`,
                `📅 Дата: ${date}`,
                `🕒 Время: ${time}`,
                " ",
                staffName ? `🧑‍💼 Мастер: ${staffName}` : null,
                services.length ? `🧼 Услуги: ${services.join(", ")}` : null,
                comment?.trim() ? `📝 Комментарий: ${comment.trim()}` : null,
                " ",
                shortLink ? `🔗 ${shortLink}` : null,
                `👨‍💻 Создана администратором: ${createdByAdmin}`,
                " ",
                "👉 Нужно добавить клиента и заполнить номер телефона.",
            ].filter(Boolean).join("\n");

            await bot.api.sendMessage(adminChatId, text, {
                disable_web_page_preview: true,
            });

            // открываем issue
            openIssues.set(key, { openedAt: Date.now(), recordId: latestRecordId });

            logger.info("[RULE missingPhone] alert sent (debounced)", {
                recordId: latestRecordId,
            });
        } catch (e) {
            logger.error("[RULE missingPhone] send failed (debounced)", e?.message || e);
        }
    }, 8000); // окно стабилизации 8 секунд

    pending.set(key, { timer, lastBody: body });
}
