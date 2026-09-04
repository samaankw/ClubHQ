"""Regression tests for privacy rights, F8 consent history, and teamless deletion."""
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

    parent_id, director_id, club_id, team_id, player_id, teamless_player_id = (uuid.uuid4() for _ in range(6))

    try:
        cur.execute(
            "insert into auth.users (id, email) values (%s, %s), (%s, %s)",
            (
                parent_id,
                f"privacy-{parent_id}@example.test",
                director_id,
                f"director-{director_id}@example.test",
            ),
        )
        # ClubHQ's auth trigger creates profiles automatically for new auth
        # users. Configure those generated rows rather than inserting duplicate
        # profile primary keys in the test fixture.
        cur.execute("update profiles set full_name = 'Privacy Parent', role = 'parent' where id = %s", (parent_id,))
        cur.execute("update profiles set full_name = 'Privacy Director', role = 'director' where id = %s", (director_id,))
        cur.execute("insert into clubs (id, name) values (%s, 'Privacy Test Club')", (club_id,))
        cur.execute("update profiles set club_id = %s where id in (%s, %s)", (club_id, parent_id, director_id))
        cur.execute("insert into teams (id, club_id, name) values (%s, %s, 'Privacy Team')", (team_id, club_id))
        cur.execute(
            "insert into players (id, team_id, club_id, parent_id, full_name) values (%s, %s, %s, %s, 'Privacy Player')",
            (player_id, team_id, club_id, parent_id),
        )
        cur.execute(
            "insert into players (id, team_id, club_id, full_name) values (%s, null, %s, 'Teamless Privacy Player')",
            (teamless_player_id, club_id),
        )
        cur.execute(
            """
            insert into consent_records (user_id, player_id, consent_type, policy_version)
            values (%s, %s, 'parental_data_consent', 'v2')
            returning id, subject_user_id, subject_player_id
            """,
            (parent_id, player_id),
        )
        consent_id, subject_user_id, subject_player_id = cur.fetchone()
        check("insert trigger captures stable user subject", subject_user_id == parent_id)
        check("insert trigger captures stable player subject", subject_player_id == player_id)

        cur.execute("delete from profiles where id = %s", (parent_id,))
        cur.execute(
            "select user_id, player_id, subject_user_id, subject_player_id from consent_records where id = %s",
            (consent_id,),
        )
        row = cur.fetchone()
        check("consent row survives profile deletion", row is not None)
        if row:
            user_fk, player_fk, stable_user, stable_player = row
            check("live user FK is nulled", user_fk is None, f"got {user_fk}")
            check("stable user subject survives", stable_user == parent_id, f"got {stable_user}")
            check("player FK still live before player deletion", player_fk == player_id, f"got {player_fk}")
            check("stable player subject survives profile deletion", stable_player == player_id, f"got {stable_player}")

        cur.execute("delete from players where id = %s", (player_id,))
        cur.execute(
            "select player_id, subject_player_id from consent_records where id = %s",
            (consent_id,),
        )
        row = cur.fetchone()
        check("consent row survives player deletion", row is not None)
        if row:
            player_fk, stable_player = row
            check("live player FK is nulled", player_fk is None, f"got {player_fk}")
            check("stable player subject survives deletion", stable_player == player_id, f"got {stable_player}")

        cur.execute(
            """
            select rc.delete_rule
            from information_schema.referential_constraints rc
            where rc.constraint_name = 'consent_records_user_id_fkey'
            """
        )
        check("user consent FK uses SET NULL", cur.fetchone()[0] == "SET NULL")

        cur.execute(
            """
            select rc.delete_rule
            from information_schema.referential_constraints rc
            where rc.constraint_name = 'consent_records_player_id_fkey'
            """
        )
        check("player consent FK uses SET NULL", cur.fetchone()[0] == "SET NULL")

        # 0040 intentionally permits teamless players for private trainers and
        # academies. The privacy replacement must not regress a director's
        # ability to delete one of those club-owned records.
        cur.execute("select set_config('test.uid', %s, false)", (str(director_id),))
        cur.execute("select delete_player_data(%s)", (teamless_player_id,))
        cur.execute("select exists(select 1 from players where id = %s)", (teamless_player_id,))
        check("director can delete a teamless player after privacy hardening", cur.fetchone()[0] is False)
        cur.execute("select set_config('test.uid', '', false)")

        # F10: player_payments.marked_by has no ON DELETE behavior of its own,
        # and was missing from delete-account's cleanup list -- a director who
        # had ever marked a fee paid (an ordinary, expected action) could never
        # delete their own account at all. Reproduce the edge function's exact
        # steps -- clear the same nullableRefs, including the now-added
        # player_payments entry, then delete the auth user -- to prove this
        # self-service deletion right now actually works for that director.
        payment_player_id = uuid.uuid4()
        cur.execute(
            "insert into players (id, team_id, club_id, full_name) values (%s, null, %s, 'Payment Test Player')",
            (payment_player_id, club_id),
        )
        cur.execute(
            "insert into player_payments (player_id, club_id, period, status, marked_by) "
            "values (%s, %s, '2026-09', 'paid', %s)",
            (payment_player_id, club_id, director_id),
        )
        for table, column in [
            ("announcements", "author_id"),
            ("events", "created_by"),
            ("messages", "sender_id"),
            ("evaluations", "coach_id"),
            ("drills", "added_by"),
            ("report_views", "viewer_id"),
            ("player_payments", "marked_by"),
        ]:
            cur.execute(f"update {table} set {column} = null where {column} = %s", (director_id,))
        try:
            cur.execute("delete from auth.users where id = %s", (director_id,))
            director_deleted = True
        except Exception as exc:  # noqa: BLE001
            director_deleted = False
            check("director with a marked payment can delete their account", False, f"{type(exc).__name__}: {exc}")
        if director_deleted:
            check("director with a marked payment can delete their account", True)
        cur.execute("delete from players where id = %s", (payment_player_id,))
    finally:
        cur.execute("select set_config('test.uid', '', false)")
        cur.execute("delete from clubs where id = %s", (club_id,))
        cur.execute("delete from auth.users where id in (%s, %s)", (parent_id, director_id))
        cur.close()
        conn.close()

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} assertions passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(run())
