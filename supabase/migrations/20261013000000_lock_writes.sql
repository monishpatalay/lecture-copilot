-- Professors could write their own courses, lectures, slides and segments straight through the database
-- API, skipping every check the site makes (file type, size, the rights tick-box) and setting columns
-- the worker trusts (raw_key, status). The site writes with the service role after its own checks and
-- the worker connects directly, so nothing uses these policies. Reading is unchanged.
drop policy "instructor writes own" on courses;
drop policy "owner writes" on lectures;
drop policy "owner writes" on slides;
drop policy "owner writes" on segments;

-- When someone last started writing this lecture's practice questions, so the model is called at most
-- once per lecture every few minutes (CLAIM_MS in web/app/exam-prep/actions.ts).
alter table lectures add column practice_claimed_at timestamptz;

-- One row per sign-in link asked for, so one visitor can't use up the email allowance
-- (PER_PERSON_PER_HOUR in web/app/login/actions.ts). No email address is stored. Service role only.
create table sign_in_requests (
  id bigint generated always as identity primary key,
  user_hash text not null,
  created_at timestamptz not null default now()
);
create index sign_in_requests_recent_idx on sign_in_requests (user_hash, created_at);
alter table sign_in_requests enable row level security;
