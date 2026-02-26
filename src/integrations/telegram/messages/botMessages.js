// src/telegram/messages/botMessages.js

export const BOT_TEXT = {
    start:
        "Привет! Я AQUABOT для уведомлений по записям AQUALORD-Detailing.\n\n" +
        "Чтобы получать уведомления, отправь свой номер телефона 👇",

    help:
        "🤖 AQUABOT — помощник по записям\n\n" +
        "Доступные команды:\n" +
        "/record — посмотреть текущую запись\n" +
        "/phone — подтвердить номер телефона\n\n" +
        "Если есть запись — бот сам пришлёт уведомления 👍",

    phonePrompt: "Отправь номер телефона, чтобы подключить уведомления 👇",

    needPhoneForRecord: "Чтобы показать запись, сначала подтверди номер телефона 👇",

    profileNotLinked:
        "Номер есть, но профиль в Yclients ещё не привязан.\n" +
        "Отправь номер через /phone ещё раз или подожди — админ подключит вручную.",

    searchingRecord: "🔎 Ищу твою ближайшую запись…",

    listRecordsFail:
        "❌ Не удалось получить записи из Yclients. Если повторится — напиши администратору.",

    noActiveRecords:
        "Активных записей сейчас нет. Как только появится — я пришлю уведомление 👍",

    recordNeedConfirmHint:
        "ℹ️ Запись ещё не подтверждена. Нажми кнопку ниже, чтобы подтвердить.",

    cantParsePhone: "Не смог распознать номер. Попробуй ещё раз.",

    phoneLinkedOk: (phone) =>
        `✅ Номер подтверждён: ${phone}\n` + `Уведомления подключены.`,

    phonePending: (phone) =>
        `✅ Номер получен: ${phone}\n\n` +
        `Пока не нашли тебя в базе Yclients. Администратор проверит и подключит уведомления.`,

    contactFlowError: "⚠️ Ошибка на стороне сервиса. Мы уже смотрим. Попробуй позже.",

    cbChecking: "⏳ Проверяю запись…",
    cbConfirming: "⏳ Подтверждаю запись…",

    cbGetRecordFail:
        "❌ Не удалось получить запись из YCLIENTS.\n" +
        "Возможно, у токена нет прав или запись недоступна.",

    cbAlreadyConfirmed: "✅ Запись уже подтверждена. Спасибо! 👌",
    cbOk: "✅ Запись подтверждена. Спасибо! 👌",

    cbUpdateFailAlert: "Не удалось обновить статус в YCLIENTS. Админ уже в курсе.",
    cbUpdateFailMsg:
        "⚠️ Принято. Если статус не обновится — администратор подтвердит вручную.",

    cbTimeout: "⏳ YCLIENTS не ответил вовремя. Попробуй ещё раз через минуту.",
};

export function buildRecordCard({ companyId, record, date, time, services, linkUrl }) {
    return [
        "📌 Твоя ближайшая запись",
        `🧾 Record ID: ${record?.id ?? "—"}`,
        `📅 Дата: ${date}`,
        `🕒 Время: ${time}`,
        services?.length ? `🧼 Услуги: ${services.join(", ")}` : null,
        linkUrl ? `🔗 ${linkUrl}` : null,
    ]
        .filter(Boolean)
        .join("\n");
}

export function buildAdminClientNotFound({ phone, tgUserId, tgChatId, companyId }) {
    return (
        "⚠️ AQUABOT: клиент не найден в Yclients по телефону.\n\n" +
        `Телефон: ${phone}\n` +
        `Telegram user_id: ${tgUserId}\n` +
        `Telegram chat_id: ${tgChatId}\n` +
        `Компания: ${companyId}\n\n` +
        "Нужно проверить профиль клиента в Yclients и — добавить или обновить номер телефона."
    );
}

export function buildAdminContactFlowError({ tgUserId, errorMessage, details }) {
    return (
        "🚨 AQUABOT: ошибка при обработке контакта.\n\n" +
        `Telegram user_id: ${tgUserId}\n` +
        `Ошибка: ${errorMessage}\n` +
        (details ? `Детали: ${details}` : "")
    );
}
