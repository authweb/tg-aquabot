/**
 * DB SCHEMA
 * Единый источник истины по структуре БД
 * Основано на information_schema
 */

export const TABLES = Object.freeze({
    CLIENTS_LINK: "public.clients_link",
    RECORDS_CACHE: "public.records_cache",
    NOTIFICATION_JOBS: "public.notification_jobs",
});

export const VIEWS = Object.freeze({
    CLIENTS_LINKS: "public.clients_links", // optional, если решишь оставить view
});

/**
 * Колонки таблиц (строго по БД)
 */
export const COLUMNS = Object.freeze({
    CLIENTS_LINK: Object.freeze({
        ID: "id", // bigint, PK
        COMPANY_ID: "company_id", // bigint, not null
        YCLIENTS_CLIENT_ID: "yclients_client_id", // bigint, nullable
        PHONE: "phone", // text, not null
        TELEGRAM_USER_ID: "telegram_user_id", // bigint, not null
        TELEGRAM_CHAT_ID: "telegram_chat_id", // bigint, not null
        STATUS: "status", // text
        CREATED_AT: "created_at", // timestamp
        UPDATED_AT: "updated_at", // timestamp
        LINKED_AT: "linked_at", // timestamp, nullable
    }),

    RECORDS_CACHE: Object.freeze({
        ID: "id", // bigint
        COMPANY_ID: "company_id", // bigint
        RECORD_ID: "record_id", // bigint
        PAYLOAD_HASH: "payload_hash", // text
        CREATED_AT: "created_at", // timestamp
    }),

    NOTIFICATION_JOBS: Object.freeze({
        ID: "id", // bigint
        COMPANY_ID: "company_id", // bigint
        TELEGRAM_CHAT_ID: "telegram_chat_id", // bigint
        TYPE: "type", // text
        PAYLOAD: "payload", // json / text (по факту в БД)
        STATUS: "status", // text
        RUN_AT: "run_at", // timestamp
        CREATED_AT: "created_at", // timestamp
        UPDATED_AT: "updated_at", // timestamp
    }),
});
