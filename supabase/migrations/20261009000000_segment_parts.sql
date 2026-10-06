-- Small-to-big retrieval. A question usually matches about 20 seconds of a lecture, and the vector of a whole
-- 60–90 s segment blurs that. So each segment's sub-chunks are embedded too; search matches on them and
-- returns their parent segment, which is still what the answer model reads and what citations point into.
-- On the 120 covered eval questions this put the right segment first 70% of the time, up from 62.5%.

create table segment_parts (
  id bigint generated always as identity primary key,
  segment_id uuid not null references segments on delete cascade,
  lecture_id uuid not null references lectures on delete cascade, -- copied down so search can filter without a join
  embedding extensions.vector(384) not null
);
create index segment_parts_embedding_idx on segment_parts using hnsw (embedding extensions.vector_cosine_ops);
create index segment_parts_segment_idx on segment_parts (segment_id);

alter table segment_parts enable row level security;
create policy "read visible lecture" on segment_parts for select
  using (exists (select 1 from lectures l where l.id = lecture_id));

-- Same signature and columns as before, with a third ranked list (`part`) in the fusion.
-- A lecture processed before this migration has no parts and is simply ranked by the other two lists.
create or replace function match_segments(
  query_embedding extensions.vector(384),
  query_text text,
  p_course_id uuid,
  p_lecture_id uuid default null,
  k int default 6
)
returns table (
  id uuid,
  lecture_id uuid,
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
  with lecs as (
    select l.id, l.number
    from lectures l
    where l.course_id = p_course_id
      and (p_lecture_id is null or l.id = p_lecture_id)
  ),
  -- A segment rarely contains every word of a question, so OR the terms.
  -- ts_rank still puts segments that match more of them first.
  q as (
    select replace(plainto_tsquery('english', query_text)::text, '&', '|')::tsquery as tsq
  ),
  vec as (
    select s.id, row_number() over (order by s.embedding <=> query_embedding) as rnk
    from segments s
    where s.lecture_id in (select lecs.id from lecs)
    order by s.embedding <=> query_embedding
    limit k * 4
  ),
  -- Nearest sub-chunks, then each segment ranked by its best one.
  near as (
    select p.segment_id, p.embedding <=> query_embedding as distance
    from segment_parts p
    where p.lecture_id in (select lecs.id from lecs)
    order by p.embedding <=> query_embedding
    limit k * 16
  ),
  part as (
    select near.segment_id as id, row_number() over (order by min(near.distance)) as rnk
    from near
    group by near.segment_id
    order by min(near.distance)
    limit k * 4
  ),
  fts as (
    select s.id, row_number() over (order by ts_rank(s.tsv, q.tsq) desc) as rnk
    from segments s, q
    where s.lecture_id in (select lecs.id from lecs)
      and s.tsv @@ q.tsq
    order by ts_rank(s.tsv, q.tsq) desc
    limit k * 4
  ),
  found as (select vec.id from vec union select part.id from part union select fts.id from fts)
  select s.id, s.lecture_id, lecs.number, s.start_s, s.end_s, s.transcript, s.slide_text,
         coalesce(1.0 / (60 + vec.rnk), 0) + coalesce(1.0 / (60 + part.rnk), 0) + coalesce(1.0 / (60 + fts.rnk), 0) as score,
         1 - (s.embedding <=> query_embedding) as similarity
  from found
  left join vec on vec.id = found.id
  left join part on part.id = found.id
  left join fts on fts.id = found.id
  join segments s on s.id = found.id
  join lecs on lecs.id = s.lecture_id
  order by score desc, similarity desc
  limit k;
$$;
