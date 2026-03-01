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
    ID: "id",
    COMPANY_ID: "company_id",
    RECORD_ID: "record_id",
    PAYLOAD_HASH: "payload_hash",
    PAYLOAD: "payload",
    YCLIENTS_CLIENT_ID: "yclients_client_id",
    SERVICE_AT: "service_at",
    ATTENDANCE: "attendance",
    INTERNAL_STATUS: "internal_status",
    DELETED: "deleted",
    RECORD_CREATED_AT: "record_created_at",
    CREATED_AT: "created_at",
    UPDATED_AT: "updated_at",
  }),

  NOTIFICATION_JOBS: Object.freeze({
    ID: "id",
    COMPANY_ID: "company_id",
    TELEGRAM_CHAT_ID: "telegram_chat_id",
    TYPE: "type",
    PAYLOAD: "payload",
    STATUS: "status",
    RUN_AT: "run_at",
    DEDUPE_KEY: "dedupe_key",
    ATTEMPTS: "attempts",
    LAST_ERROR: "last_error",
    CREATED_AT: "created_at",
    UPDATED_AT: "updated_at",
  }),

  USER_ACTIONS_LOG: Object.freeze({
    ID: "id",
    TELEGRAM_USER_ID: "telegram_user_id",
    COMPANY_ID: "company_id",
    ACTION: "action",
    PAYLOAD: "payload",
    CREATED_AT: "created_at",
  }),

  PROCESSED_ACTIONS: Object.freeze({
    ID: "id",
    COMPANY_ID: "company_id",
    RECORD_ID: "record_id",
    ACTION: "action",
    CREATED_AT: "created_at",
  }),
});
