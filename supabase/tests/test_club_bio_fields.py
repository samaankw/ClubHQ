"""
Phase 6c: 0041_club_bio_fields.sql widens clubs' UPDATE policy from
owner-only to any director of the club, and locks the grant down to
name/crest_url/bio specifically. This proves both halves for real: a
promoted (non-owner) director can now edit the bio, a non-director cannot,
a different club's director cannot, and nobody can slip org_type/owner_id
through the same update.
"""
import uuid
import psycopg2
import psycopg2.extras

psycopg2.extras.register_uuid()

CONN = dict(host="/tmp", port=5439, user="postgres", dbname="postgres",
            options="-c client_encoding=UTF8 -c search_path=public,extensions")

results = []


def check(name, cond, detail=""):
    results.append((name, cond, detail))
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"\n         {detail}" if detail and not cond else ""))
    return bool(cond)


def as_user(cur, uid):
    cur.execute("set local role authenticated")
    cur.execute("select set_config('test.uid', %s, true)", (str(uid),))


def expect_denied(cur, sql, params=None):
    # An UPDATE a policy's USING clause filters out isn't an exception -- it's
    # a successful statement that silently matches zero rows. A grant-level
    # refusal (a column nobody has UPDATE on) IS an exception. Both count as
    # "denied" here; only "the row actually changed" doesn't.
    cur.execute("savepoint sp")
    try:
        cur.execute(sql, params)
        affected = cur.rowcount
        cur.execute("rollback to savepoint sp")
        return affected == 0
    except psycopg2.errors.InsufficientPrivilege:
        cur.execute("rollback to savepoint sp")
        return True
    except psycopg2.Error as e:
        cur.execute("rollback to savepoint sp")
        return "permission denied" in str(e).lower()


def expect_allowed(cur, sql, params=None):
    cur.execute("savepoint sp")
    try:
        cur.execute(sql, params)
        cur.execute("release savepoint sp")
        return True
    except psycopg2.Error as e:
        cur.execute("rollback to savepoint sp")
        print(f"    (unexpected error: {e})")
        return False


def run():
    conn = psycopg2.connect(**CONN)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        club_a, club_b = uuid.uuid4(), uuid.uuid4()
        owner_a, second_director_a, coach_a, director_b = (uuid.uuid4() for _ in range(4))

        for uid in (owner_a, second_director_a, coach_a, director_b):
            cur.execute("insert into auth.users (id) values (%s)", (uid,))

        cur.execute("insert into clubs (id, name, owner_id) values (%s,'Club A',%s)", (club_a, owner_a))
        cur.execute("insert into clubs (id, name, owner_id) values (%s,'Club B',%s)", (club_b, director_b))

        cur.execute("update profiles set full_name='Owner A', role='director', club_id=%s where id=%s", (club_a, owner_a))
        cur.execute("update profiles set full_name='Second Director', role='director', club_id=%s where id=%s", (club_a, second_director_a))
        cur.execute("update profiles set full_name='Coach A', role='coach', club_id=%s where id=%s", (club_a, coach_a))
        cur.execute("update profiles set full_name='Director B', role='director', club_id=%s where id=%s", (club_b, director_b))

        as_user(cur, owner_a)
        check(
            "the owner can update their club's bio",
            expect_allowed(cur, "update clubs set bio = 'Owner-written story.' where id = %s", (club_a,)),
        )

        as_user(cur, second_director_a)
        check(
            "a promoted, non-owner director can ALSO update the bio -- the actual gap this migration closes",
            expect_allowed(cur, "update clubs set bio = 'Written by the second director.' where id = %s", (club_a,)),
        )
        check(
            "a promoted director can update the crest too",
            expect_allowed(cur, "update clubs set crest_url = 'https://example.com/crest.png' where id = %s", (club_a,)),
        )

        as_user(cur, coach_a)
        check(
            "a coach (not a director) cannot update the club's bio",
            expect_denied(cur, "update clubs set bio = 'A coach should not be able to write this.' where id = %s", (club_a,)),
        )

        as_user(cur, director_b)
        check(
            "a different club's director cannot update club A's bio",
            expect_denied(cur, "update clubs set bio = 'Should not work.' where id = %s", (club_a,)),
        )

        as_user(cur, owner_a)
        check(
            "even the owner cannot slip org_type through the same update (column grant)",
            expect_denied(cur, "update clubs set org_type = 'large_club' where id = %s", (club_a,)),
        )
        check(
            "even the owner cannot reassign owner_id through the same update",
            expect_denied(cur, "update clubs set owner_id = %s where id = %s", (second_director_a, club_a)),
        )
        check(
            "even the owner cannot rewrite the join_code through the same update",
            expect_denied(cur, "update clubs set join_code = 'HACKED01' where id = %s", (club_a,)),
        )

    finally:
        conn.rollback()
        cur.close()
        conn.close()

    passed = sum(1 for _, c, _ in results if c)
    print(f"\n{passed}/{len(results)} assertions passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(run())
