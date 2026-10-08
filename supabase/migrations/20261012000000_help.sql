-- The help form emails the owner; nothing a visitor writes is stored. This table only counts sends, so the
-- form can be limited per person and per day: it uses the same daily email allowance as sign-in links, and an
-- open form must not be able to use that up.
create table help_messages (
  id bigint generated always as identity primary key,
  user_hash text not null,
  created_at timestamptz not null default now()
);
create index help_messages_created_idx on help_messages (created_at);
-- No policies: read and written by the server only (service role).
alter table help_messages enable row level security;
