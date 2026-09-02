-- Keep the API-key schema aligned with the Gaming API backend.
alter table public.api_keys
  add column if not exists plan text not null default 'free';

alter table public.api_keys
  drop constraint if exists api_keys_plan_check;

alter table public.api_keys
  add constraint api_keys_plan_check
  check (plan in ('free', 'standard', 'premium'));

create index if not exists api_keys_customer_status_idx
  on public.api_keys (customer_id, status);
