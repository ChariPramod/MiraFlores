-- Views are separate from material business events.
create table if not exists sensitive_access_log (
  id uuid primary key,
  workspace_id text not null references workspaces(id),
  actor_id text not null,
  resource text not null,
  recorded_at timestamptz not null default now()
);
alter table sensitive_access_log enable row level security;
-- No browser/anon policies. Server service role only.

create or replace function reject_history_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'History is append-only; append a compensating event';
end;
$$;
create trigger events_immutable before update or delete on events
for each row execute function reject_history_mutation();
create trigger access_log_immutable before update or delete on sensitive_access_log
for each row execute function reject_history_mutation();
