export async function confirmedRule({ body, bot, logger = console }) {
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!adminChatId) return;

    if (body?.resource !== "record") return;
    if (body?.status !== "update") return;
    if (body?.data?.deleted === true) return;

    const a = Number(body?.data?.attendance);
    const va = Number(body?.data?.visit_attendance);
    const c = Number(body?.data?.confirmed);

    const isConfirmed = a === 2 || va === 2 || c === 1;
    if (!isConfirmed) return;

    // дальше — текст и антиспам (можно копипастнуть стиль из noShowRule)
}
