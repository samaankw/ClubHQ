"""Tests for the development-plan approval journal added in 0046.

The point of the journal is that approval history accumulates instead of being
overwritten, so these tests care most about the sequence of events surviving a
publish -> unpublish -> republish cycle, and about the journal outliving both
the plan and the staff account that acted on it.
"""
import uuid

import psycopg2
import psycopg2.extras

psycopg2.extras.register_uuid()

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"\n         {detail}" if detail and not cond else ""))


def run():
    conn = psycopg2.connect(
        host="/tmp",
        port=5439,
        user="postgres",
        dbname="postgres",
        options="-c client_encoding=UTF8 -c search_path=public,extensions",
    )
    conn.autocommit = True
    cur = conn.cursor()

    director_id, coach_id, other_director_id = (uuid.uuid4() for _ in range(3))
    club_id, other_club_id, player_id = (uuid.uuid4() for _ in range(3))
    evaluation_id, plan_id = (uuid.uuid4() for _ in range(2))

    def as_user(uid):
        cur.execute("select set_config('test.uid', %s, false)", (str(uid),))

    def as_superuser():
        cur.execute("select set_config('test.uid', '', false)")

    try:
        cur.execute(
            "insert into auth.users (id, email) values (%s,%s),(%s,%s),(%s,%s)",
            (
                director_id,
                f"dir-{director_id}@example.test",
                coach_id,
                f"coach-{coach_id}@example.test",
                other_director_id,
                f"other-{other_director_id}@example.test",
            ),
        )
        cur.execute("insert into clubs (id, name) values (%s,'Journal Club'),(%s,'Other Club')", (club_id, other_club_id))
        cur.execute("update profiles set role='director', club_id=%s, full_name='Journal Director' where id=%s", (club_id, director_id))
        cur.execute("update profiles set role='coach', club_id=%s, full_name='Journal Coach' where id=%s", (club_id, coach_id))
        cur.execute(
            "update profiles set role='director', club_id=%s, full_name='Other Director' where id=%s",
            (other_club_id, other_director_id),
        )
        cur.execute("insert into players (id, club_id, full_name) values (%s,%s,'Journal Player')", (player_id, club_id))
        cur.execute(
            "insert into evaluations (id, player_id, coach_id, passing) values (%s,%s,%s,5)",
            (evaluation_id, player_id, coach_id),
        )
        cur.execute(
            "insert into development_plans (id, player_id, evaluation_id, summary, priorities) "
            "values (%s,%s,%s,'Journal plan','[{\"skill\":\"passing\",\"note\":\"n\"}]'::jsonb)",
            (plan_id, player_id, evaluation_id),
        )

        cur.execute("select status from development_plans where id=%s", (plan_id,))
        check("a new plan starts as a draft", cur.fetchone()[0] == "draft")

        # --- publish -> unpublish -> republish, by two different people ---
        as_user(coach_id)
        cur.execute("select review_development_plan(%s, true)", (plan_id,))
        as_user(director_id)
        cur.execute("select review_development_plan(%s, false)", (plan_id,))
        as_user(coach_id)
        cur.execute("select review_development_plan(%s, true)", (plan_id,))
        as_superuser()

        cur.execute(
            "select action, old_status, new_status, actor_id from plan_review_log where plan_id=%s order by created_at, id",
            (plan_id,),
        )
        rows = cur.fetchall()
        check("every approval event is journaled, not overwritten", len(rows) == 3, f"got {len(rows)} row(s)")

        if len(rows) == 3:
            check("actions recorded in order", [r[0] for r in rows] == ["published", "unpublished", "published"], f"got {[r[0] for r in rows]}")
            check("the first event records the draft it came from", rows[0][1] == "draft", f"got {rows[0][1]}")
            check("an unpublish records what it moved away from", rows[1][1] == "published", f"got {rows[1][1]}")
            check("a republish records the intermediate state", rows[2][1] == "coach_reviewed", f"got {rows[2][1]}")
            check("each event attributes the person who acted", [r[3] for r in rows] == [coach_id, director_id, coach_id])

        # The plan itself still only knows the latest action -- which is the
        # whole reason the journal has to exist separately.
        cur.execute("select status, reviewed_by from development_plans where id=%s", (plan_id,))
        status, reviewed_by = cur.fetchone()
        check("the plan row still reflects only the most recent action", status == "published" and reviewed_by == coach_id)

        # --- RLS ---
        # `set role`, not `set local role`: this connection is in autocommit
        # mode, so a LOCAL setting would be discarded immediately and every
        # query below would still run as superuser -- silently bypassing RLS
        # and passing no matter what the policy says.
        cur.execute("set role authenticated")
        as_user(director_id)
        cur.execute("select count(*) from plan_review_log")
        check("a director sees their own club's approval history", cur.fetchone()[0] == 3)

        as_user(other_director_id)
        cur.execute("select count(*) from plan_review_log")
        check("a director from another club sees none of it", cur.fetchone()[0] == 0)

        as_user(coach_id)
        cur.execute("select count(*) from plan_review_log")
        check("a coach cannot read the journal", cur.fetchone()[0] == 0)

        # Journal rows must not be forgeable or editable through the API --
        # only review_development_plan() may write them.
        forged = False
        try:
            cur.execute(
                "insert into plan_review_log (club_id, actor_id, action, new_status) values (%s,%s,'published','published')",
                (club_id, director_id),
            )
            forged = True
        except psycopg2.Error:
            pass
        check("a client cannot forge a journal row", not forged)

        as_superuser()
        cur.execute("reset role")

        # --- the journal outlives what it describes ---
        # Mirror what delete-account actually does: clear the older foreign
        # keys that have no ON DELETE behavior of their own, then delete the
        # auth user. plan_review_log.actor_id is deliberately not in that list
        # -- it is ON DELETE SET NULL precisely so it never has to be.
        cur.execute("update evaluations set coach_id = null where coach_id = %s", (coach_id,))
        cur.execute("delete from auth.users where id=%s", (coach_id,))
        cur.execute("select count(*), count(actor_id) from plan_review_log where plan_id=%s", (plan_id,))
        total, with_actor = cur.fetchone()
        check("journal survives the acting staff member deleting their account", total == 3)
        check("that person's rows are anonymized rather than removed", with_actor == 1, f"{with_actor} row(s) still attributed")

        cur.execute("delete from development_plans where id=%s", (plan_id,))
        cur.execute("select count(*) from plan_review_log where club_id=%s", (club_id,))
        check("journal survives deletion of the plan itself", cur.fetchone()[0] == 3)
        cur.execute("select count(*) from plan_review_log where club_id=%s and plan_id is null", (club_id,))
        check("and stops pointing at the deleted plan", cur.fetchone()[0] == 3)
    finally:
        as_superuser()
        cur.execute("reset role")
        cur.execute("delete from players where club_id in (%s,%s)", (club_id, other_club_id))
        cur.execute("delete from clubs where id in (%s,%s)", (club_id, other_club_id))
        cur.execute("delete from auth.users where id in (%s,%s,%s)", (director_id, coach_id, other_director_id))
        cur.close()
        conn.close()

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} assertions passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(run())
