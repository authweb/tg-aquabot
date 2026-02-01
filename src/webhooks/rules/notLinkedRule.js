function isEmpty(value) {
    if (value === null || value === undefined) return true;
    const s = String(value).trim();
    return s.length === 0;
}

function safe(value, fallback = "—") {
    return isEmpty(value) ? fallback : String(value);
}

function maskPhone(phone) {
    const s = String(phone || "").trim();
    if (!s) return "—";
    if (s.length <= 7) return s;
    return `${s.slice(0, 5)}****${s.slice(-3)}`;
}

function extractServicesTitles(data) {
    const services = Array.isArray(data?.services) ? data.services : [];
    return services.map(s => s?.title).filter(Boolean);
}

function formatDateTime(body) {
    const d = body?.data;
    if (!d) return { date: "—", time: "—" };

    // предпочитаем "YYYY-MM-DD HH:mm:ss"
    if (typeof d.date === "string" && d.date.includes(" ")) {
        const [datePart, timePart] = d.date.split(" ");
        return { date: datePart || "—", time: (timePart || "—").slice(0, 5) };
    }

    // fallback на ISO "YYYY-MM-DDTHH:mm:ss+07:00"
    if (typeof d.datetime === "string" && d.datetime.includes("T")) {
        const [datePart, rest] = d.datetime.split("T");
        const timePart = (rest || "").split("+")[0].split("Z")[0];
        return { date: datePart || "—", time: (timePart || "—").slice(0, 5) };
    }

    return { date: "—", time: "—" };
}

/**
 * pending: ключ -> { timer, lastBody, lastPhone, lastCompanyId }
 * sent: ключ -> timestamp (антиспам после отправки)
 */
const pending = new Map();
const sent = new Map();

function wasSentRecently(key, ttlMs = 30 * 60 * 1000) {
    const now = Date.now();
    const prev = sent.get(key);
    if (prev && now - prev < ttlMs) return true;
    sent.set(key, now);

    if (sent.size > 5000) {
        for (const [k, t] of sent) if (now - t > ttlMs) sent.delete(k);
    }
    return false;
}

/**
 * notLinkedRule: вызываем ТОЛЬКО в ветке (!chatId)
 * а отправку делаем через debounce (по финальному событию)
 */
export async function notLinkedRule({ body, bot, phone, logger = console }) {
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!adminChatId) {
        logger.warn("[RULE notLinked] TELEGRAM_ADMIN_CHAT_ID not set");
        return;
    }

    const companyId = body?.company_id;
    const recordId = body?.resource_id || body?.data?.id;
    const apiId = body?.data?.api_id;

    // ключ лучше делать стабильным: api_id > recordId
    const baseKey = apiId ? `not_linked:${companyId}:${apiId}` : `not_linked:${companyId}:${recordId}`;
    const sentKey = `${baseKey}:${phone}`;

    // если уже отправляли недавно — не шумим
    if (wasSentRecently(sentKey)) return;

    // debounce: перезапускаем таймер
    const prev = pending.get(sentKey);
    if (prev?.timer) clearTimeout(prev.timer);

    const timer = setTimeout(async () => {
        try {
            const entry = pending.get(sentKey);
            pending.delete(sentKey);

            if (!entry?.lastBody) return;

            const latest = entry.lastBody;
            const latestPhone = entry.lastPhone;
            const latestCompanyId = entry.lastCompanyId;

            // Финальные поля для алерта
            const clientName =
                latest?.data?.client?.display_name ||
                latest?.data?.client?.name ||
                "не указан";

            const { date, time } = formatDateTime(latest);
            const services = extractServicesTitles(latest?.data);
            const shortLink = latest?.data?.short_link;

            const text = [
                "🔔 Клиент не привязан к Telegram",
                `🏢 Компания: ${safe(latestCompanyId)}`,
                `📞 Телефон: ${safe(maskPhone(latestPhone))}`,
                `👤 Клиент: ${safe(clientName)}`,
                `📅 Дата: ${date}`,
                `🕒 Время: ${time}`,
                services.length ? `🧼 Услуги: ${services.join(", ")}` : null,
                shortLink ? `🔗 ${shortLink}` : null,
                "",
                "👉 Действие: попросить клиента написать боту /start и пройти привязку.",
            ].filter(Boolean).join("\n");

            await bot.api.sendMessage(adminChatId, text, {
                disable_web_page_preview: true,
            });

            logger.info("[RULE notLinked] admin notified (debounced)", {
                companyId: latestCompanyId,
                recordId,
                phone: latestPhone,
            });
        } catch (e) {
            logger.error("[RULE notLinked] send failed (debounced)", e?.message || e);
        }
    }, 8000); // 👈 окно стабилизации 8 секунд

    pending.set(sentKey, {
        timer,
        lastBody: body,
        lastPhone: phone,
        lastCompanyId: companyId,
    });
}