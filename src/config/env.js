import dotenv from "dotenv";

// Жёстко читаем .env из корня проекта (не зависим от cwd/pm2)
dotenv.config({ path: "/opt/tg-aquabot/.env" });

function required(name) {
    const v = process.env[name];
    if (!v || !String(v).trim()) {
        throw new Error(`[ENV] Missing required variable: ${name}`);
    }
    return String(v).trim();
}

export const env = {
    nodeEnv: process.env.NODE_ENV || "production",

    telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
    telegramAdminChatId: required("TELEGRAM_ADMIN_CHAT_ID"),

    // Yclients (пара токенов)
    yclientsPartnerToken: required("YCLIENTS_PARTNER_TOKEN"),
    yclientsUserToken: required("YCLIENTS_USER_TOKEN"),
    yclientsCompanyId: required("YCLIENTS_COMPANY_ID"),

    // Виджет для отзывов (нужен для ссылки на сотрудника)
    yclientsWidgetId: required("YCLIENTS_WIDGET_ID"),

    pg: {
        host: required("POSTGRESQL_HOST"),
        port: Number(process.env.POSTGRESQL_PORT || 5432),
        user: required("POSTGRESQL_USER"),
        password: required("POSTGRESQL_PASSWORD"),
        database: required("POSTGRESQL_DBNAME"),
    },
};
