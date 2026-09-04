"""Regression tests for 0043 privacy-rights and F8 consent-history behavior."""
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

    parent_id, club_id, team_id, player_id = (uuid.uuid4() for _ in range(4))

    try:
        cur.execute("insert into auth.users (id, email) values (%s, %s)", (parent_id, f"privacy-{parent_id}@example.test"))
        cur.execute("insert into profiles (id, full_name, role) values (%s, 'Privacy Parent', 'parent')", (parent_id,))
        cur.execute("insert into clubs (id, name) values (%s, 'Privacy Test Club')", (club_id,))
        cur.execute("update profiles set club_id = %s where id = %s", (club_id, parent_id))
        cur.execute("insert into teams (id, club_id, name) values (%s, %s, 'Privacy Team')", (team_id, club_id))
        cur.execute(
            "insert into players (id, team_id, club_id, parent_id, full_name) values (%s, %s, %s, %s, 'Privacy Player')",
            (player_id, team_id, club_id, parent_id),
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
    finally:
        cur.execute("delete from clubs where id = %s", (club_id,))
        cur.execute("delete from auth.users where id = %s", (parent_id,))
        cur.close()
        conn.close()

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n{passed}/{len(results)} assertions passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(run())
