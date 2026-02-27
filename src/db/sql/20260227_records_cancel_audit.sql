-- records_cache internal status for domain-driven state
ALTER TABLE public.records_cache
ADD COLUMN IF NOT EXISTS internal_status text NOT NULL DEFAULT 'pending';

-- audit log for user actions
CREATE TABLE IF NOT EXISTS public.user_actions_log (
  id bigserial PRIMARY KEY,
  telegram_user_id bigint NOT NULL,
  company_id bigint,
  action text NOT NULL,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

-- processed callbacks/webhooks dedupe
CREATE TABLE IF NOT EXISTS public.processed_actions (
  id bigserial PRIMARY KEY,
  company_id bigint,
  record_id bigint,
  action text,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS processed_actions_uniq
ON public.processed_actions (company_id, record_id, action);

-- ensure records_cache has stable upsert key
CREATE UNIQUE INDEX IF NOT EXISTS records_cache_company_record_uniq
ON public.records_cache (company_id, record_id);
