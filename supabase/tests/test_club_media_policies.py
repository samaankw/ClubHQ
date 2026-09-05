"""Storage policy tests for the club-media bucket (0047).

These are the first tests of any storage policy in this repo. 0029 scoped the
bucket using storage.foldername(), which the harness cannot execute, so it sits
in EXPECTED_FAILURES and every policy on this bucket went unverified -- which is
exactly how the club-crests upload path shipped with no policy at all and failed
for every user from the day the feature landed. 0047 re-expresses the same
checks with a plain LIKE so they can finally be exercised here.
"""
import uuid

import psycopg2
import psycopg2.extras

psycopg2.extras.register_uuid()

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"\n         {detail}" if detail and not cond else ""))


def try_upload(cur, path, uid):
    """Attempt an insert as the given user. True if the policy allowed it."""
    cur.execute("savepoint sp")
    cur.execute("select set_config('test.uid', %s, false)", (str(uid),))
    try:
        cur.execute("insert into storage.objects (bucket_id, name) values ('club-media', %s)", (path,))
        cur.execute("release savepoint sp")
        return True
    except psycopg2.Error:
        cur.execute("rollback to savepoint sp")
        return False


def run():
    conn = psycopg2.connect(
        host="/tmp",
        port=5439,
        user="postgres",
        dbname="postgres",
        options="-c client_encoding=UTF8 -c search_path=public,extensions",
    )
    conn.autocommit = False
    cur = conn.cursor()

    director, coach, other_director = (uuid.uuid4() for _ in range(3))
    club, other_club = (uuid.uuid4() for _ in range(2))

    try:
        # The harness shim creates storage.objects and enables RLS but grants
        # no table privileges on it, while hosted Supabase does grant them to
        # authenticated. Without this, every insert is refused for lack of a
        # base privilege and the policies below are never actually consulted --
        # which reads as "the policy denied it" and would make a broken policy
        # look correct.
        cur.execute("grant select, insert, update, delete on storage.objects to authenticated")
        cur.execute("insert into storage.buckets (id, name, public) values ('club-media','club-media',true) on conflict (id) do nothing")
        cur.execute(
            "insert into auth.users (id, email) values (%s,%s),(%s,%s),(%s,%s)",
            (
                director,
                f"d-{director}@example.test",
                coach,
                f"c-{coach}@example.test",
                other_director,
                f"o-{other_director}@example.test",
            ),
        )
        cur.execute("insert into clubs (id, name) values (%s,'Crest Club'),(%s,'Other Club')", (club, other_club))
        cur.execute("update profiles set role='director', club_id=%s where id=%s", (club, director))
        cur.execute("update profiles set role='coach', club_id=%s where id=%s", (club, coach))
        cur.execute("update profiles set role='director', club_id=%s where id=%s", (other_club, other_director))

        cur.execute("set role authenticated")

        # The bug this migration fixes: this upload previously had no policy
        # permitting it, so it failed for every director in every club.
        check(
            "a director can upload their own club's crest",
            try_upload(cur, f"club-crests/{club}/logo.png", director),
        )

        check(
            "a director cannot upload a crest into another club's folder",
            not try_upload(cur, f"club-crests/{other_club}/logo.png", director),
        )

        # 0041 restricts editing a club's crest/bio to directors, so the
        # storage path that backs it is director-only too.
        check(
            "a coach cannot upload a club crest",
            not try_upload(cur, f"club-crests/{club}/logo.png", coach),
        )

        # Regression cover for the two paths 0029 already allowed, since 0047
        # rewrites those checks rather than only adding a third.
        check("a coach can still upload a drill video", try_upload(cur, f"drills/{club}/clip.mp4", coach))
        check(
            "a coach cannot upload a drill into another club's folder",
            not try_upload(cur, f"drills/{other_club}/clip.mp4", coach),
        )
        check("a user can still upload their own coach photo", try_upload(cur, f"coach-photos/{coach}/me.jpg", coach))
        check(
            "a user cannot upload a photo under someone else's profile",
            not try_upload(cur, f"coach-photos/{director}/me.jpg", coach),
        )

        # A near-miss id must not slip through the prefix match.
        check(
            "a lookalike club id is not accepted as a prefix",
            not try_upload(cur, f"club-crests/{club}extra/logo.png", director),
        )

        check("an unknown top-level folder is rejected", not try_upload(cur, f"random/{club}/x.png", director))
    finally:
        cur.execute("select set_config('test.uid', '', false)")
        cur.execute("reset role")
        conn.rollback()
        cur.close()
        conn.close()

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} assertions passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(run())
