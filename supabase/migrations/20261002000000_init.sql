create extension if not exists vector with schema extensions;

-- ── tables ──────────────────────────────────────────────────────────────

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'student' check (role in ('instructor', 'student')),
  display_name text
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  instructor_id uuid references auth.users on delete set null, -- nullable until auth (Phase 3)
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create table lectures (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses on delete cascade,
  number int not null,
  title text not null,
  status text not null default 'uploading'
    check (status in ('uploading', 'queued', 'processing', 'ready', 'failed')),
  stage text,
  progress int not null default 0 check (progress between 0 and 100),
  error text,
  raw_key text,
  video_key text,
  duration_s double precision,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (course_id, number)
);

create table slides (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references lectures on delete cascade,
  t_s double precision not null,
  image_key text not null,
  text text
);

create table segments (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references lectures on delete cascade,
  start_s double precision not null,
  end_s double precision not null,
  transcript text not null,
  slide_text text,
  embedding extensions.vector(384) not null,
  tsv tsvector generated always as
    (to_tsvector('english', coalesce(transcript, '') || ' ' || coalesce(slide_text, ''))) stored
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses on delete cascade,
  user_hash text,
  text text not null,
  answer text,
  cited_segment_ids uuid[] not null default '{}',
  covered boolean,
  latency_ms int,
  model text,
  created_at timestamptz not null default now()
);

-- ── indexes ─────────────────────────────────────────────────────────────

create index segments_embedding_idx on segments using hnsw (embedding extensions.vector_cosine_ops);
create index segments_tsv_idx on segments using gin (tsv);
create index segments_lecture_idx on segments (lecture_id);
create index slides_lecture_idx on slides (lecture_id);
create index lectures_queued_idx on lectures (created_at) where status = 'queued';

-- ── hybrid search ───────────────────────────────────────────────────────
-- Vector + full-text candidates merged with reciprocal rank fusion (k = 60).
-- `similarity` (cosine) is returned for every row so callers can gate on
-- relevance; RRF score is rank-only and can't say "nothing matched".
-- ponytail: exact scan over the course's segments (HNSW post-filters and can
-- drop rows for small courses). Fine to ~100k segments/course; past that,
-- partition or iterative-scan the index.

create function match_segments(
  query_embedding extensions.vector(384),
  query_text text,
  p_course_id uuid,
  p_lecture_id uuid default null,
  k int default 6
)
returns table (
  id uuid,
  lecture_number int,
  start_s double precision,
  end_s double precision,
  transcript text,
  slide_text text,
  score double precision,
  similarity double precision
)
language sql stable security invoker
set search_path = public, extensions
as $$
  with scoped as (
    select s.*, l.number as lecture_number,
           1 - (s.embedding <=> query_embedding) as similarity
    from segments s
    join lectures l on l.id = s.lecture_id
    where l.course_id = p_course_id
      and (p_lecture_id is null or s.lecture_id = p_lecture_id)
  ),
  vec as (
    select scoped.id, row_number() over (order by scoped.similarity desc) as rnk
    from scoped
    order by scoped.similarity desc
    limit k * 4
  ),
  fts as (
    select scoped.id, row_number() over (order by ts_rank_cd(scoped.tsv, q) desc) as rnk
    from scoped, websearch_to_tsquery('english', query_text) q
    where scoped.tsv @@ q
    order by ts_rank_cd(scoped.tsv, q) desc
    limit k * 4
  )
  select sc.id, sc.lecture_number, sc.start_s, sc.end_s, sc.transcript, sc.slide_text,
         coalesce(1.0 / (60 + vec.rnk), 0) + coalesce(1.0 / (60 + fts.rnk), 0) as score,
         sc.similarity
  from vec
  full outer join fts on fts.id = vec.id
  join scoped sc on sc.id = coalesce(vec.id, fts.id)
  order by score desc, sc.similarity desc
  limit k;
$$;

-- ── row-level security ──────────────────────────────────────────────────
-- Phase 1: public courses readable by anyone; owner instructor reads/writes.
-- Child tables lean on courses' RLS: the exists() subquery only sees
-- courses the caller can see. Members-only reads arrive with course_members (Phase 3).
-- The worker connects as postgres (bypasses RLS); /api/ask logs via service role.

alter table profiles  enable row level security;
alter table courses   enable row level security;
alter table lectures  enable row level security;
alter table slides    enable row level security;
alter table segments  enable row level security;
alter table questions enable row level security;

create function is_instructor() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from profiles where id = auth.uid() and role = 'instructor') $$;

create policy "own profile" on profiles for select using (id = auth.uid());

create policy "read public or own" on courses for select
  using (is_public or instructor_id = auth.uid());
create policy "instructor writes own" on courses for all
  using (instructor_id = auth.uid() and is_instructor())
  with check (instructor_id = auth.uid() and is_instructor());

create policy "read visible course" on lectures for select
  using (exists (select 1 from courses c where c.id = course_id));
create policy "owner writes" on lectures for all
  using (exists (select 1 from courses c where c.id = course_id and c.instructor_id = auth.uid()))
  with check (exists (select 1 from courses c where c.id = course_id and c.instructor_id = auth.uid()));

create policy "read visible lecture" on slides for select
  using (exists (select 1 from lectures l where l.id = lecture_id));
create policy "owner writes" on slides for all
  using (exists (select 1 from lectures l join courses c on c.id = l.course_id
                 where l.id = lecture_id and c.instructor_id = auth.uid()))
  with check (exists (select 1 from lectures l join courses c on c.id = l.course_id
                      where l.id = lecture_id and c.instructor_id = auth.uid()));

create policy "read visible lecture" on segments for select
  using (exists (select 1 from lectures l where l.id = lecture_id));
create policy "owner writes" on segments for all
  using (exists (select 1 from lectures l join courses c on c.id = l.course_id
                 where l.id = lecture_id and c.instructor_id = auth.uid()))
  with check (exists (select 1 from lectures l join courses c on c.id = l.course_id
                      where l.id = lecture_id and c.instructor_id = auth.uid()));

create policy "owner reads" on questions for select
  using (exists (select 1 from courses c where c.id = course_id and c.instructor_id = auth.uid()));
