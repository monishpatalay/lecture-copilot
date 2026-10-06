-- Exam prep: practice questions for a lecture, written once by the web app on first request.
-- [{"question": "…", "answer": "…", "t_s": 754}, …]
alter table lectures add column practice jsonb not null default '[]';
