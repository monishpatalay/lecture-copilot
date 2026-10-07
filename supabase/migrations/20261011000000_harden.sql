-- handle_new_user only ever runs as the trigger on auth.users. As a function in the public schema it was
-- also exposed at /rest/v1/rpc/handle_new_user to anyone (Supabase's security advisor flags this).
-- A trigger fires without the inserting role needing EXECUTE, so nothing else changes.
revoke execute on function handle_new_user() from public, anon, authenticated;

-- is_instructor() and is_course_member() stay callable: row-level security policies call them as the
-- signed-in or anonymous role, and all either one reveals is a fact about the caller.
