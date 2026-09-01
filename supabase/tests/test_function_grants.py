"""Tests for migration 0036's search_path pinning and EXECUTE grants.

The load-bearing test here is `trigger still fires after EXECUTE is revoked`.
0036 revokes EXECUTE on announce_event_change() and announce_event_cancellation()
from every role including `authenticated`. That is only safe if Postgres checks
EXECUTE on a trigger function at CREATE TRIGGER time rather than on each fire.
That is the documented behavior, but "the docs say so" is not a reason to ship a
change that would silently stop every cancellation notice in production if it
were wrong -- so it is asserted against a real cluster.
"""
import uuid, psycopg2
import psycopg2.extras
from datetime import datetime, timedelta, timezone

psycopg2.extras.register_uuid()

CONN = dict(host="/tmp", port=5439, user="postgres", dbname="postgres",
            options="-c client_encoding=UTF8 -c search_path=public,extensions")

results = []


def check(name, cond, detail=""):
    results.append((name, cond, detail))
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"\n         {detail}" if detail and not cond else ""))
    return bool(cond)


# Signatures as 0036 pins them.
PINNED = [
    ("build_event_change_notice", "uuid, timestamp with time zone, text, timestamp with time zone, text, text, text"),
    ("event_change_notice_window", ""),
    ("build_event_cancellation_notice", "text, timestamp with time zone[], text"),
    ("delete_event", "uuid, boolean"),
    ("cancel_event_series", "uuid, timestamp with time zone, boolean"),
]

CALLABLE_BY_AUTHENTICATED = [n for n, _ in PINNED] + ["update_targeted_event"]
TRIGGER_FUNCTIONS = ["announce_event_change", "announce_event_cancellation"]


def test_search_path_pinned(cur):
    print("\nsearch_path is pinned on every function 0034/0035 added")
    cur.execute("""
        select p.proname, p.proconfig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any(%s)
    """, ([n for n, _ in PINNED],))
    got = dict(cur.fetchall())
    for name, _ in PINNED:
        cfg = got.get(name)
        check(f"{name} pins search_path",
              cfg is not None and any(c.startswith("search_path=") for c in cfg),
              f"proconfig={cfg}")

    # The whole point of 0036's first half: no app function is left unpinned.
    #
    # uuid_generate_v4 is excluded because it isn't app code -- it's the
    # harness's own stand-in for uuid-ossp (run_migrations.py:57). On Supabase
    # that function lives in the `extensions` schema, which is exactly why the
    # production linter flagged five functions and not six.
    cur.execute("""
        select coalesce(string_agg(p.proname, ', '), '')
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'
          and p.proname <> 'uuid_generate_v4'
          and (p.proconfig is null or not exists (
                select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
    """)
    unpinned = cur.fetchone()[0]
    check("no unpinned app functions remain in public", unpinned == "",
          f"still unpinned: {unpinned}")


def test_anon_cannot_execute(cur):
    print("\nanon cannot reach any of the new entry points")
    for name in CALLABLE_BY_AUTHENTICATED + TRIGGER_FUNCTIONS:
        cur.execute("""
            select bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname='public' and p.proname = %s
        """, (name,))
        check(f"anon cannot execute {name}", cur.fetchone()[0] is False)


def test_authenticated_retains_access(cur):
    print("\nauthenticated keeps the entry points the app actually calls")
    for name in CALLABLE_BY_AUTHENTICATED:
        cur.execute("""
            select bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname='public' and p.proname = %s
        """, (name,))
        check(f"authenticated can execute {name}", cur.fetchone()[0] is True)

    print("\n  ...but not the trigger functions")
    for name in TRIGGER_FUNCTIONS:
        cur.execute("""
            select bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname='public' and p.proname = %s
        """, (name,))
        check(f"authenticated cannot execute {name}", cur.fetchone()[0] is False)


def test_anon_call_is_refused(cur):
    """has_function_privilege is the theory; this is the actual refusal."""
    print("\nan anon caller invoking delete_event is refused by name")
    cur.execute("savepoint probe")
    try:
        cur.execute("set local role anon")
        cur.execute("select delete_event(%s, true)", (uuid.uuid4(),))
        cur.execute("reset role")
        check("anon delete_event raises", False, "call succeeded")
    except psycopg2.Error as e:
        msg = str(e)
        cur.execute("rollback to savepoint probe")
        cur.execute("reset role")
        # Must be the ACL refusing it, not the function's own 'not found'
        # exception -- otherwise anon reached the body and the revoke did nothing.
        check("anon delete_event raises permission denied",
              "permission denied for function delete_event" in msg, msg[:200])


def test_trigger_still_fires_after_revoke(cur):
    """The assumption 0036 rests on, checked against a real delete."""
    print("\ncancellation trigger still fires for a role with no EXECUTE on it")
    club, director, team, player = (uuid.uuid4() for _ in range(4))
    cur.execute("insert into auth.users (id) values (%s)", (director,))
    cur.execute("insert into clubs (id, name) values (%s, 'Williams Soccer Clinic')", (club,))
    cur.execute("insert into profiles (id, club_id, role, full_name)"
                " values (%s,%s,'director','Coach') on conflict (id) do update"
                " set club_id=excluded.club_id, role='director'", (director, club))
    cur.execute("insert into teams (id, club_id, name, age_group) values (%s,%s,'Thursday Group','U12')",
                (team, club))
    cur.execute("insert into players (id, team_id, full_name) values (%s,%s,'Maya K.')", (player, team))

    eid = uuid.uuid4()
    starts = datetime.now(timezone.utc) + timedelta(days=3)
    cur.execute("insert into events (id, club_id, team_id, type, title, location, starts_at, created_by)"
                " values (%s,%s,%s,'practice','Thursday Small Group','Dunwoody Field 3',%s,%s)",
                (eid, club, team, starts, director))

    # Isolate the ACL question: give `authenticated` the table rights and take
    # RLS out of the picture, so the only thing that could stop the trigger is
    # the revoked EXECUTE on the trigger function itself.
    cur.execute("alter table events disable row level security")
    cur.execute("grant usage on schema public to authenticated")
    cur.execute("grant select, delete on events to authenticated")

    cur.execute("select set_config('test.uid', %s, false)", (str(director),))
    cur.execute("set local role authenticated")
    cur.execute("select has_function_privilege(current_user, 'announce_event_cancellation()', 'EXECUTE')")
    has_exec = cur.fetchone()[0]
    cur.execute("delete from events where id = %s", (eid,))
    cur.execute("reset role")

    check("the deleting role genuinely lacks EXECUTE on the trigger function",
          has_exec is False, f"has_function_privilege returned {has_exec}")

    cur.execute("select title, category, auto_generated from announcements"
                " where source_cancelled_event_ids @> array[%s]::uuid[]", (eid,))
    row = cur.fetchone()
    check("cancellation notice was still created", row is not None,
          "no announcement row -- revoking EXECUTE broke the trigger")
    if row:
        check("notice has the right category", row[1] == "cancellation", f"got {row[1]}")
        check("notice is marked auto-generated", row[2] is True)

    cur.execute("alter table events enable row level security")
    cur.execute("revoke select, delete on events from authenticated")


def main():
    conn = psycopg2.connect(**CONN)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        test_search_path_pinned(cur)
        test_anon_cannot_execute(cur)
        test_authenticated_retains_access(cur)
        test_anon_call_is_refused(cur)
        test_trigger_still_fires_after_revoke(cur)
    finally:
        conn.rollback()
        cur.close()
        conn.close()

    passed = sum(1 for _, c, _ in results if c)
    print(f"\n{passed}/{len(results)} assertions passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
