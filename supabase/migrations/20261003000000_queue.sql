-- Phase 2: the queue worker reports that it is alive here, so the web app can
-- say "Queued · processor offline" when nothing has checked in for a minute.
-- (Postgres is the queue itself: lectures.status / locked_at, claimed with SKIP LOCKED.)

create table worker_heartbeats (
  worker_id text primary key,
  last_seen_at timestamptz not null default now()
);

-- No policies: only the worker (direct connection) and server-side API routes (service role) use it.
alter table worker_heartbeats enable row level security;
