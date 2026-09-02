"""
0042_club_org_type_setting.sql: create_club can now take an org_type at
creation, and a director can change it afterward. Proves both work for
real, that an invalid org_type is rejected either way, that exactly one
create_club overload exists (the exact stale-overload bug 0024 already had
to clean up once for create_targeted_event), and that the pre-existing
audit-log insert (0005) still fires.
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


def run():
    conn = psycopg2.connect(**CONN)
    conn.autocommit = False
    cur = conn.cursor()
    try:
        cur.execute("select count(*) from pg_proc where proname = 'create_club'")
        check("exactly one create_club overload exists", cur.fetchone()[0] == 1)

        for org_type in ("private_trainer", "academy", "small_club", "large_club"):
            uid = uuid.uuid4()
            cur.execute("reset role")
            cur.execute("insert into auth.users (id) values (%s)", (uid,))
            as_user(cur, uid)
            # `select (create_club(...)).* ` can invoke a composite-returning
            # function twice under the planner -- the second call then sees
            # the caller already has a club_id from the first and raises.
            # `select r.* from create_club(...) as r` calls it exactly once.
            cur.execute("select r.* from create_club(%s, %s) as r", (f"Test {org_type}", org_type))
            row = cur.fetchone()
            check(f"create_club accepts org_type={org_type}", row is not None)

            cur.execute("select org_type from clubs where owner_id = %s", (uid,))
            check(f"the new club's org_type is actually {org_type}", cur.fetchone()[0] == org_type)

            cur.execute("select count(*) from role_change_log where actor_id = %s and action = 'club_created'", (uid,))
            check(f"the audit log entry (0005) still fires for org_type={org_type}", cur.fetchone()[0] == 1)

        owner = uuid.uuid4()
        cur.execute("reset role")
        cur.execute("insert into auth.users (id) values (%s)", (owner,))
        as_user(cur, owner)
        cur.execute("savepoint sp")
        try:
            cur.execute("select create_club('Bad Club', 'not_a_real_type')")
            cur.execute("rollback to savepoint sp")
            check("create_club rejects an invalid org_type", False, "call succeeded, should have raised")
        except psycopg2.Error as e:
            cur.execute("rollback to savepoint sp")
            check("create_club rejects an invalid org_type", "invalid org_type" in str(e).lower(), str(e)[:200])

        cur.execute("select create_club('Growth Club', 'private_trainer')")
        cur.execute("select id from clubs where owner_id = %s", (owner,))
        club_id = cur.fetchone()[0]

        as_user(cur, owner)
        cur.execute("update clubs set org_type = 'academy' where id = %s", (club_id,))
        cur.execute("select org_type from clubs where id = %s", (club_id,))
        check("a director can change org_type later (a private trainer growing into an academy)", cur.fetchone()[0] == "academy")

        cur.execute("savepoint sp2")
        try:
            cur.execute("update clubs set org_type = 'not_a_real_type' where id = %s", (club_id,))
            cur.execute("rollback to savepoint sp2")
            check("the check constraint still rejects an invalid org_type on direct update", False, "update succeeded, should have raised")
        except psycopg2.Error as e:
            cur.execute("rollback to savepoint sp2")
            check(
                "the check constraint still rejects an invalid org_type on direct update",
                "clubs_org_type_check" in str(e) or "check constraint" in str(e).lower(),
                str(e)[:200],
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
