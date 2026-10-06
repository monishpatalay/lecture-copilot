# Eval fixture

`lectures_and_segments.sql` is a snapshot of the three processed lectures (147 segments with their
embeddings), so CI can run the retrieval eval without processing any video.

The transcripts are of MIT 6.006 Introduction to Algorithms, Spring 2020, lectures 3, 4 and 5,
from MIT OpenCourseWare (https://ocw.mit.edu), licensed CC BY-NC-SA 4.0. They were produced by
automatic speech recognition and are not official transcripts.

Regenerate after re-processing lectures:

    docker exec supabase_db_lecture-copilot pg_dump -U postgres --data-only --column-inserts \
      --table=public.lectures --table=public.segments postgres | grep -v '^\\' | grep -v "set_config('search_path'" > evals/fixtures/lectures_and_segments.sql
