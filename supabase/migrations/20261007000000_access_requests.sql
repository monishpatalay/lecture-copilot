-- Professor access requests: a signed-in student asks on /professor-access, the admin approves or
-- declines on /requests. All writes go through the service role; profiles stays select-own for users.
alter table profiles
  add column is_admin boolean not null default false,
  add column request_status text check (request_status in ('pending', 'declined')),
  add column request_affiliation text,
  add column request_note text,
  add column requested_at timestamptz;

-- The admin is appointed in SQL, once, after they have signed in:
--   update profiles set is_admin = true where id = (select id from auth.users where email = 'person@example.com');
