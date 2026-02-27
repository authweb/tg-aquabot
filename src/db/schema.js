/**
 * DB SCHEMA
 * Единый источник истины по структуре БД
 */

export const TABLES = Object.freeze({
  CLIENTS_LINK: "public.clients_link",
  RECORDS_CACHE: "public.records_cache",
  NOTIFICATION_JOBS: "public.notification_jobs",
  USER_ACTIONS_LOG: "public.user_actions_log",
  PROCESSED_ACTIONS: "public.processed_actions",
});

export const VIEWS = Object.freeze({
  CLIENTS_LINKS: "public.clients_links",
});

export const COLUMNS = Object.freeze({
  CLIENTS_LINK: Object.freeze({
    ID: "id",
    COMPANY_ID: "company_id",
    YCLIENTS_CLIENT_ID: "yclients_client_id",
    PHONE: "phone",
    TELEGRAM_USER_ID: "telegram_user_id",
    TELEGRAM_CHAT_ID: "telegram_chat_id",
    STATUS: "status",
    CREATED_AT: "created_at",
    UPDATED_AT: "updated_at",
    LINKED_AT: "linked_at",
  }),

    RECORDS_CACHE: Object.freeze({
        ID: "id", // bigint, PK
        COMPANY_ID: "company_id", // bigint, not null
        RECORD_ID: "record_id", // bigint, not null
        PAYLOAD_HASH: "payload_hash", // text, not null

        // добавили:
        PAYLOAD: "payload", // jsonb/json, nullable
        YCLIENTS_CLIENT_ID: "yclients_client_id", // bigint, nullable (client может быть null)
        SERVICE_AT: "service_at", // timestamptz, nullable
        ATTENDANCE: "attendance", // int, nullable
        DELETED: "deleted", // boolean, nullable
        RECORD_CREATED_AT: "record_created_at", // timestamptz, nullable

        CREATED_AT: "created_at", // timestamptz/timestamp
        UPDATED_AT: "updated_at", // timestamptz/timestamp
    }),

    NOTIFICATION_JOBS: Object.freeze({
        ID: "id", // bigint, PK
        COMPANY_ID: "company_id", // bigint, not null

        TELEGRAM_CHAT_ID: "telegram_chat_id", // bigint (nullable или not null — как в БД)
        TYPE: "type", // text
        PAYLOAD: "payload", // jsonb/json, nullable
        STATUS: "status", // text: pending | running | done | failed | canceled ...
        RUN_AT: "run_at", // timestamptz

        // добавили:
        DEDUPE_KEY: "dedupe_key", // text, nullable
        ATTEMPTS: "attempts", // int, not null default 0
        LAST_ERROR: "last_error", // text, nullable

        CREATED_AT: "created_at", // timestamptz/timestamp
        UPDATED_AT: "updated_at", // timestamptz/timestamp
    }),
});
