"""
Proves 0040_player_club_ownership.sql's backfill actually works on a
pre-existing row, not just on a database that never had any -- the shared
harness (run_migrations.py) applies every migration in one pass, which
means a player row inserted after 0040 already has the club_id column and
never exercises the backfill UPDATE at all.

This test creates its own throwaway database inside the already-running
cluster, applies every migration up to (but not including) 0040 -- so
players.club_id genuinely doesn't exist yet -- inserts a "legacy" player row
the old way (team_id only), then applies 0040 by itself and checks the
backfill actually derived club_id from the team, the column is now NOT NULL,
and the team/club consistency trigger rejects a mismatched pair afterward.
"""
import glob
import os
import uuid

import psycopg2
import psycopg2.extras

from run_migrations import BOOTSTRAP, MIG

psycopg2.extras.register_uuid()

ADMIN_CONN = dict(host="/tmp", port=5439, user="postgres", dbname="postgres",
                   options="-c client_encoding=UTF8")
DB_NAME = "clubhq_backfill_test"

results = []


def check(name, cond, detail=""):
    results.append((name, cond, detail))
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"\n         {detail}" if detail and not cond else ""))
    return bool(cond)


def run():
    admin = psycopg2.connect(**ADMIN_CONN)
    admin.autocommit = True
    admin_cur = admin.cursor()
    admin_cur.execute(f'drop database if exists "{DB_NAME}"')
    admin_cur.execute(f'create database "{DB_NAME}"')
    admin_cur.close()
    admin.close()

    conn = psycopg2.connect(host="/tmp", port=5439, user="postgres", dbname=DB_NAME,
                             options="-c client_encoding=UTF8 -c search_path=public,extensions")
    conn.autocommit = True
    cur = conn.cursor()
    try:
        cur.execute(BOOTSTRAP)

        pre_0040 = sorted(
            p for p in glob.glob(os.path.join(MIG, "*.sql"))
            if os.path.basename(p) < "0040"
        )
        for path in pre_0040:
            name = os.path.basename(path)
            sql = open(path).read()
            try:
                cur.execute(sql)
            except Exception as e:
                if name == "0029_club_media_per_club_scope.sql":
                    continue
                raise RuntimeError(f"unexpected failure applying {name}: {e}") from e

        cur.execute("select column_name from information_schema.columns where table_name='players' and column_name='club_id'")
        check("club_id does not exist yet, pre-0040", cur.fetchone() is None)

        club, team, other_club, other_team, player = (uuid.uuid4() for _ in range(5))
        cur.execute("insert into clubs (id, name) values (%s, 'Legacy Club'), (%s, 'Other Club')", (club, other_club))
        cur.execute("insert into teams (id, club_id, name) values (%s,%s,'Legacy Team'), (%s,%s,'Other Team')",
                    (team, club, other_team, other_club))
        cur.execute("insert into players (id, team_id, full_name) values (%s,%s,'Legacy Player')", (player, team))

        migration_0040 = os.path.join(MIG, "0040_player_club_ownership.sql")
        cur.execute(open(migration_0040).read())

        cur.execute("select club_id from players where id = %s", (player,))
        got = cur.fetchone()[0]
        check("backfill derived club_id from the player's existing team", got == club, f"got {got}, expected {club}")

        cur.execute("""
            select is_nullable from information_schema.columns
            where table_name = 'players' and column_name = 'club_id'
        """)
        check("club_id is NOT NULL after the migration", cur.fetchone()[0] == "NO")

        try:
            cur.execute("insert into players (id, team_id, club_id, full_name) values (%s,%s,%s,'Bad Row')",
                        (uuid.uuid4(), team, other_club))
            check("consistency trigger rejects a team from a different club", False, "insert succeeded, should have raised")
        except psycopg2.Error as e:
            check("consistency trigger rejects a team from a different club", "does not belong to" in str(e), str(e)[:200])

    finally:
        cur.close()
        conn.close()
        admin = psycopg2.connect(**ADMIN_CONN)
        admin.autocommit = True
        admin_cur = admin.cursor()
        admin_cur.execute(f'drop database if exists "{DB_NAME}"')
        admin_cur.close()
        admin.close()

    passed = sum(1 for _, c, _ in results if c)
    print(f"\n{passed}/{len(results)} assertions passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(run())
