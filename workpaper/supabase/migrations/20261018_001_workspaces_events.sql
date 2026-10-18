-- MiraFlores workpaper: visitor sandboxes + append-only events
-- Apply with: supabase db push / SQL editor / psql against the project.

create extension if not exists pgcrypto;

create table if not exists workspaces (
  id text primary key,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  firm_label text not null default 'Miraflores demo',
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists branches (
  id text not null,
  workspace_id text not null references workspaces(id) on delete cascade,
  parent_branch_id text,
  label text not null default 'main',
  created_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table if not exists events (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  branch_id text not null,
  sequence bigint not null,
  actor_id text not null,
  recorded_at timestamptz not null default now(),
  effective_at timestamptz not null,
  type text not null,
  target_refs jsonb not null default '[]'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  reason text,
  payload jsonb not null,
  idempotency_key text not null,
  batch_id text,
  reverses_event_id text,
  unique (workspace_id, branch_id, sequence),
  unique (workspace_id, idempotency_key),
  foreign key (workspace_id, branch_id) references branches(workspace_id, id)
);

create index if not exists events_workspace_branch_seq
  on events (workspace_id, branch_id, sequence);

create index if not exists events_workspace_batch
  on events (workspace_id, batch_id)
  where batch_id is not null;

-- Service role only from the Next.js server. No anon policies for raw packet/events.
alter table workspaces enable row level security;
alter table branches enable row level security;
alter table events enable row level security;

comment on table events is 'Append-only business history. Never update or delete rows.';
