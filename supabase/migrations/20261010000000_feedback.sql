-- Thumbs up / down on an answer, set by the person who asked it (matched by user_hash).
alter table questions add column feedback smallint check (feedback in (-1, 1));

-- "This practice question is wrong", from a student. One per person per question; the professor sees the count.
-- A question is identified by the moment it was written from, which is unique within a lecture's set.
create table practice_reports (
  lecture_id uuid not null references lectures on delete cascade,
  t_s int not null,
  user_hash text not null,
  created_at timestamptz not null default now(),
  primary key (lecture_id, t_s, user_hash)
);
-- No policies: read and written by the server only (service role).
alter table practice_reports enable row level security;
