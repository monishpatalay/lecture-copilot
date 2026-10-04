-- Phase 3: sign-in, roles, course membership, chapters, demo rate limit.

-- Members of a private course can read it. (Public courses stay readable by anyone.)
create table course_members (
  course_id uuid not null references courses on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  primary key (course_id, user_id)
);
alter table course_members enable row level security;
create policy "own memberships" on course_members for select using (user_id = auth.uid());

-- security definer: the courses policy below must not recurse through course_members' own policy.
create function is_course_member(p_course_id uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from course_members where course_id = p_course_id and user_id = auth.uid()) $$;

drop policy "read public or own" on courses;
create policy "read public, own or joined" on courses for select
  using (is_public or instructor_id = auth.uid() or is_course_member(id));

-- Everyone who signs in gets a profile, as a student.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into profiles (id, display_name) values (new.id, split_part(new.email, '@', 1));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Uploading is invite-only: the project owner runs  select make_instructor('person@example.com');
-- once that person has signed in. Courses nobody owns yet (the seeded demo course) become theirs.
create function make_instructor(p_email text) returns text
language plpgsql security definer set search_path = public
as $$
declare v_user uuid;
begin
  select id into v_user from auth.users where email = lower(p_email);
  if v_user is null then
    raise exception 'No user with email %; they need to sign in once first', p_email;
  end if;
  update profiles set role = 'instructor' where id = v_user;
  update courses set instructor_id = v_user where instructor_id is null;
  return p_email || ' is now an instructor';
end $$;
revoke execute on function make_instructor(text) from public, anon, authenticated;

-- Chapter pills on the lecture page: [{"t_s": 0, "title": "…"}, …], written by the worker.
alter table lectures add column chapters jsonb not null default '[]';

-- The demo allows 20 questions per visitor per day; this is the lookup behind that count.
create index questions_visitor_idx on questions (course_id, user_hash, created_at);
