// src/telegram/messages/recordMessages.js

const STATIC = {
    entry: "справа от главных ворот",
    yandex: "https://yandex.ru/maps/-/CDXGBROx",
    gis: "https://go.2gis.com/wgazr",
    staffReview: null,
};

function isEmpty(value) {
    if (value === null || value === undefined) return true;
    const s = String(value).trim();
    return s.length === 0;
}

function safe(value, fallback = "—") {
    return isEmpty(value) ? fallback : String(value);
}

function formatServices(data) {
    const services = Array.isArray(data?.services)
        ? data.services.map((s) => s?.title).filter(Boolean)
        : [];

    return services.length ? services.join(", ") : "—";
}

/**
 * Возвращаем дату/время без "+07:00" и без плясок таймзон.
 * Приоритет:
 * 1) data.date -> "YYYY-MM-DD HH:mm:ss" (самый стабильный)
 * 2) data.datetime -> "YYYY-MM-DDTHH:mm:ss+07:00"
 */
function formatDateTime(data) {
    if (!data) return { date: "—", time: "—" };

    if (typeof data?.date === "string" && data.date.includes(" ")) {
        const [d, t] = data.date.split(" ");
        return { date: safe(d), time: safe(t).slice(0, 5) };
    }

    if (typeof data?.datetime === "string" && data.datetime.includes("T")) {
        const [d, rest] = data.datetime.split("T");
        const t = (rest || "").split("+")[0].split("Z")[0];
        return { date: safe(d), time: safe(t).slice(0, 5) };
    }

    return { date: "—", time: "—" };
}

function buildFooter({ recordLink, reviewLink } = {}) {
    const lines = [];

    if (recordLink) lines.push(`🤓 Запись можно посмотреть здесь: ${recordLink}`);
    lines.push(`🚪 Вход: ${STATIC.entry}`);

    lines.push("");
    lines.push("😊 Если вам понравилось, пожалуйста оставьте отзыв");
    if (reviewLink) lines.push(`⭐ Отзыв: ${reviewLink}`);
    lines.push(`Яндекс.Карты: ${STATIC.yandex}`);
    lines.push(`2Гис: ${STATIC.gis}`);

    return lines.join("\n");
}


const STATUS_TITLE = {
    confirmed: "✅ Запись подтверждена",
    cancelled: "❌ Запись отменена",
    pending: "⏳ Запись ожидает подтверждения",
};

export function buildRecordCard({ status, date, service, branch }) {
    return [
        STATUS_TITLE[status] || STATUS_TITLE.pending,
        "",
        `📅 ${safe(date)}`,
        `💼 ${safe(service)}`,
        `📍 ${safe(branch, "Основной филиал")}`,
    ].join("\n");
}

function buildBaseInfo(data) {
    const services = formatServices(data);
    const { date, time } = formatDateTime(data);

    return { services, date, time };
}

/**
 * Backward compatible export (как у тебя было)
 * options:
 *  - recordLink
 *  - staffReviewLink (можно передавать review_link сюда, как мы сделали)
 */
export function formatRecordCreateMessage(data, options = {}) {
    const { services, date, time } = buildBaseInfo(data);

    const recordLink = options.recordLink || data?.short_link || null;
    const reviewLink = options.staffReviewLink || STATIC.staffReview || null;

    return (
        `Здравствуйте, вы были записаны через администратора на услугу *${services}* ` +
        `на *${date}* в *${time}*.\n` +
        `Все верно?\n\n` +
        buildFooter({ recordLink, reviewLink })
    );
}

/**
 * ✅ Запись подтверждена
 * options:
 *  - recordLink
 */
export function formatRecordConfirmedMessage(data, options = {}) {
    const { services, date, time } = buildBaseInfo(data);

    const recordLink = options.recordLink || data?.short_link || null;

    return [
        "✅ Подтвержденная запись:",
        `🧼 Услуга: *${services}*`,
        `📅 Дата: *${date}*`,
        `🕒 Время: *${time}*`,
        "",
        recordLink ? `🔗 Детали: ${recordLink}` : null,
    ]
        .filter(Boolean)
        .join("\n");
}

/**
 * ✏️ Запись изменена
 * options:
 *  - recordLink
 */
export function formatRecordChangedMessage(data, options = {}) {
    const { services, date, time } = buildBaseInfo(data);

    const recordLink = options.recordLink || data?.short_link || null;

    return [
        "✏️ Ваша запись изменена",
        `🧼 Услуга: *${services}*`,
        `📅 Дата: *${date}*`,
        `🕒 Время: *${time}*`,
        "",
        recordLink ? `🔗 Детали: ${recordLink}` : null,
    ]
        .filter(Boolean)
        .join("\n");
}

/**
 * ❌ Запись отменена
 * options:
 *  - recordLink
 */
export function formatRecordCanceledMessage(data, options = {}) {
    const { services, date, time } = buildBaseInfo(data);

    const recordLink = options.recordLink || data?.short_link || null;

    return [
        "❌ Ваша запись отменена",
        `🧼 Услуга: *${services}*`,
        `📅 Дата: *${date}*`,
        `🕒 Время: *${time}*`,
        "",
        recordLink ? `🔗 Детали: ${recordLink}` : null,
    ]
        .filter(Boolean)
        .join("\n");
}
