"""Apply ClubHQ's migrations to a throwaway Postgres to prove 0034 actually runs."""
import glob, os, sys, psycopg2

MIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "migrations")

# Minimal Supabase shims. Real Supabase provides these; we only need enough
# shape for the migrations to apply and for the trigger to be exercised.
BOOTSTRAP = """
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists storage;
create extension if not exists "uuid-ossp" schema extensions;
create extension if not exists pgcrypto schema extensions;

do $$ begin
  create role authenticated;
exception when duplicate_object then null; end $$;
do $$ begin
  create role anon;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role;
exception when duplicate_object then null; end $$;


create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Test harness stand-in for Supabase's auth.uid(): reads a GUC we set per
-- statement so we can act as different users.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$ select 'authenticated'::text $$;
create or replace function auth.jwt() returns jsonb
language sql stable as $$ select '{}'::jsonb $$;

create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default extensions.uuid_generate_v4(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb, created_at timestamptz default now()
);
alter table storage.objects enable row level security;

create or replace function extensions.uuid_generate_v4() returns uuid
language sql volatile as $$ select gen_random_uuid() $$;
create or replace function public.uuid_generate_v4() returns uuid
language sql volatile as $$ select gen_random_uuid() $$;
grant usage on schema extensions, auth, storage to public;
"""


def main():
    conn = psycopg2.connect(host="/tmp", port=5439, user="postgres", dbname="postgres",
                            options="-c client_encoding=UTF8 -c search_path=public,extensions")
    conn.set_client_encoding("UTF8")
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(BOOTSTRAP)

    failures = []
    for path in sorted(glob.glob(os.path.join(MIG, "*.sql"))):
        name = os.path.basename(path)
        sql = open(path).read()
        try:
            cur.execute(sql)
            print(f"  ok   {name}")
        except Exception as e:
            msg = str(e).strip().splitlines()[0]
            failures.append((name, msg))
            print(f"  FAIL {name}: {msg}")
            conn.rollback()
    print()
    if failures:
        print(f"{len(failures)} migration(s) failed to apply.")
    else:
        print("All migrations applied.")
    return failures


# 0029 needs storage.foldername(), which ships with Supabase's storage
# extension and isn't worth reimplementing in the shim -- it's a storage RLS
# policy, nothing the notice triggers touch. Anything else failing is real.
EXPECTED_FAILURES = {"0029_club_media_per_club_scope.sql"}


if __name__ == "__main__":
    f = main()
    unexpected = [n for n, _ in f if n not in EXPECTED_FAILURES]
    if unexpected:
        # Previously this only checked the one migration under development,
        # so a failure in any later one exited 0 and the suite looked green.
        print("Unexpected failures: " + ", ".join(unexpected))
    missing = EXPECTED_FAILURES - {n for n, _ in f}
    if missing:
        # If the shim grows enough to apply 0029, this list is stale and the
        # next person shouldn't inherit a lie about what's covered.
        print("No longer failing, remove from EXPECTED_FAILURES: " + ", ".join(sorted(missing)))
    sys.exit(1 if unexpected else 0)
