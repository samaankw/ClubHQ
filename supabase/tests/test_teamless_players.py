"""
Phase 6a: proves a player with NO team (the private-trainer/academy case
0040_player_club_ownership.sql exists for) actually works end-to-end --
not just that the migration applies, but that every policy and RPC a
teamless player touches behaves the same as it would for a player who has
a team, for every role that's supposed to reach it, and is denied for every
role that isn't.

Everything runs in one transaction, rolled back at the end regardless of
outcome -- nothing here persists.
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


class Fixture:
    """Club A: a director, a coach (assigned to a team), a parent, one
    teamless private-trainer client, and one ordinary teamed player (as a
    regression control). Club B: a director, for cross-club denial checks.
    """

    def __init__(self, cur):
        self.cur = cur
        self.club_a = uuid.uuid4()
        self.club_b = uuid.uuid4()
        self.director_a = uuid.uuid4()
        self.coach_a = uuid.uuid4()
        self.parent_a = uuid.uuid4()
        self.director_b = uuid.uuid4()
        self.team_a = uuid.uuid4()
        self.teamless_player = uuid.uuid4()
        self.teamed_player = uuid.uuid4()

        for uid in (self.director_a, self.coach_a, self.parent_a, self.director_b):
            cur.execute("insert into auth.users (id) values (%s)", (uid,))

        cur.execute("insert into clubs (id, name) values (%s,'Club A'), (%s,'Club B')", (self.club_a, self.club_b))

        cur.execute("insert into profiles (id, club_id, role, full_name) values (%s,%s,'director','Director A')"
                    " on conflict (id) do update set club_id=excluded.club_id, role='director'", (self.director_a, self.club_a))
        cur.execute("insert into profiles (id, club_id, role, full_name) values (%s,%s,'coach','Coach A')"
                    " on conflict (id) do update set club_id=excluded.club_id, role='coach'", (self.coach_a, self.club_a))
        cur.execute("insert into profiles (id, club_id, role, full_name) values (%s,%s,'parent','Parent A')"
                    " on conflict (id) do update set club_id=excluded.club_id, role='parent'", (self.parent_a, self.club_a))
        cur.execute("insert into profiles (id, club_id, role, full_name) values (%s,%s,'director','Director B')"
                    " on conflict (id) do update set club_id=excluded.club_id, role='director'", (self.director_b, self.club_b))

        cur.execute("insert into teams (id, club_id, name) values (%s,%s,'Team A')", (self.team_a, self.club_a))
        cur.execute("insert into team_coaches (team_id, coach_id) values (%s,%s)", (self.team_a, self.coach_a))

        # The private-trainer client: no team_id at all.
        cur.execute("insert into players (id, club_id, parent_id, full_name) values (%s,%s,%s,'Teamless Client')",
                    (self.teamless_player, self.club_a, self.parent_a))
        # Regression control: an ordinary teamed player, same club.
        cur.execute("insert into players (id, club_id, team_id, full_name) values (%s,%s,%s,'Teamed Player')",
                    (self.teamed_player, self.club_a, self.team_a))

    def as_user(self, uid):
        self.cur.execute("set local role authenticated")
        self.cur.execute("select set_config('test.uid', %s, true)", (str(uid),))

    def as_superuser(self):
        self.cur.execute("reset role")
        self.cur.execute("select set_config('test.uid', '', true)")


def expect_denied(cur, sql, params=None):
    cur.execute("savepoint sp")
    try:
        cur.execute(sql, params)
        cur.execute("rollback to savepoint sp")
        return False
    except psycopg2.errors.InsufficientPrivilege:
        cur.execute("rollback to savepoint sp")
        return True
    except psycopg2.Error as e:
        cur.execute("rollback to savepoint sp")
        return "not authorized" in str(e).lower() or "authoriz" in str(e).lower()


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
        fx = Fixture(cur)

        # ---- players_read ----
        fx.as_user(fx.parent_a)
        cur.execute("select count(*)::int from players where id = %s", (fx.teamless_player,))
        check("parent sees their own teamless client", cur.fetchone()[0] == 1)

        fx.as_user(fx.coach_a)
        cur.execute("select count(*)::int from players where id = %s", (fx.teamless_player,))
        check("club staff (coach) sees the teamless client", cur.fetchone()[0] == 1)

        fx.as_user(fx.director_b)
        cur.execute("select count(*)::int from players where id = %s", (fx.teamless_player,))
        check("a different club's director cannot see the teamless client", cur.fetchone()[0] == 0)

        # ---- players_insert_staff / players_update_staff / players_delete_director ----
        fx.as_user(fx.director_a)
        new_player = uuid.uuid4()
        check(
            "director can create a NEW teamless player (the hard gate)",
            expect_allowed(cur, "insert into players (id, club_id, full_name) values (%s,%s,'New Client')", (new_player, fx.club_a)),
        )

        fx.as_user(fx.coach_a)
        check(
            "a coach (non-director) cannot insert a player -- unchanged from before this migration",
            expect_denied(cur, "insert into players (id, club_id, full_name) values (%s,%s,'Nope')", (uuid.uuid4(), fx.club_a)),
        )

        fx.as_user(fx.director_a)
        check(
            "director can update the teamless client",
            expect_allowed(cur, "update players set full_name = 'Renamed Client' where id = %s", (fx.teamless_player,)),
        )
        check(
            "director can delete the teamless client",
            expect_allowed(cur, "delete from players where id = %s", (new_player,)),
        )

        # ---- evaluations_read / evaluations_write ----
        fx.as_user(fx.coach_a)
        eval_id = uuid.uuid4()
        check(
            "coach can write an evaluation for the teamless client",
            expect_allowed(cur, "insert into evaluations (id, player_id, coach_id, first_touch) values (%s,%s,%s,5)",
                           (eval_id, fx.teamless_player, fx.coach_a)),
        )
        cur.execute("select count(*)::int from evaluations where player_id = %s", (fx.teamless_player,))
        check("coach can read the evaluation back", cur.fetchone()[0] == 1)

        fx.as_user(fx.director_b)
        check(
            "a different club's staff cannot evaluate the teamless client",
            expect_denied(cur, "insert into evaluations (player_id, coach_id, first_touch) values (%s,%s,5)",
                         (fx.teamless_player, fx.director_b)),
        )

        # ---- development_plans (dev_plans_read) ----
        fx.as_superuser()
        draft_plan, published_plan = uuid.uuid4(), uuid.uuid4()
        cur.execute("insert into development_plans (id, player_id, evaluation_id, priorities, status) values (%s,%s,%s,'[]','draft')",
                    (draft_plan, fx.teamless_player, eval_id))
        cur.execute("insert into development_plans (id, player_id, evaluation_id, priorities, status) values (%s,%s,%s,'[]','published')",
                    (published_plan, fx.teamless_player, eval_id))

        fx.as_user(fx.parent_a)
        cur.execute("select count(*)::int from development_plans where player_id = %s", (fx.teamless_player,))
        check("parent sees exactly the one published plan for their teamless child", cur.fetchone()[0] == 1)

        fx.as_user(fx.director_a)
        cur.execute("select count(*)::int from development_plans where player_id = %s", (fx.teamless_player,))
        check("staff sees both plans regardless of status", cur.fetchone()[0] == 2)

        # ---- parent_link_codes_director_read + create/claim RPCs ----
        fx.as_user(fx.director_a)
        cur.execute("select create_parent_link_code(%s)", (fx.teamless_player,))
        code = cur.fetchone()[0]
        check("director can create a parent link code for the teamless client", bool(code))

        cur.execute("select count(*)::int from parent_link_codes where player_id = %s", (fx.teamless_player,))
        check("director can read the link code back", cur.fetchone()[0] == 1)

        fx.as_user(fx.director_b)
        cur.execute("select count(*)::int from parent_link_codes where player_id = %s", (fx.teamless_player,))
        check("a different club's director cannot read the link code", cur.fetchone()[0] == 0)

        # New parent claims the teamless client via the code, in-club.
        fx.as_superuser()
        new_parent = uuid.uuid4()
        cur.execute("insert into auth.users (id) values (%s)", (new_parent,))
        cur.execute("insert into profiles (id, club_id, role, full_name) values (%s,%s,'parent','New Parent')"
                    " on conflict (id) do update set club_id=excluded.club_id, role='parent'", (new_parent, fx.club_a))

        fx.as_user(new_parent)
        cur.execute("select claim_parent_link_code(%s, true)", (code,))
        claimed = cur.fetchone()[0]
        check("a parent can claim the teamless client via the link code", claimed == fx.teamless_player)

        # ---- create_targeted_event / update_targeted_event: coach targeting a teamless player ----
        fx.as_user(fx.coach_a)
        check(
            "a coach (no team_coaches row for a teamless player) CAN target them via club-staff fallback",
            expect_allowed(
                cur,
                "select create_targeted_event(%s,'practice','Private Session','Court 1', now() + interval '1 day', null, null, %s)",
                (fx.club_a, [fx.teamless_player]),
            ),
        )

        fx.as_user(fx.director_b)
        check(
            "a different club's staff cannot target the teamless client via create_targeted_event",
            expect_denied(
                cur,
                "select create_targeted_event(%s,'practice','Should Fail','Court 1', now() + interval '1 day', null, null, %s)",
                (fx.club_a, [fx.teamless_player]),
            ),
        )

        # ---- homework_items (homework_read) ----
        fx.as_superuser()
        homework_id = uuid.uuid4()
        cur.execute("insert into homework_items (id, player_id, development_plan_id, title) values (%s,%s,%s,'Ball mastery')",
                    (homework_id, fx.teamless_player, published_plan))

        # teamless_player's parent_id was reassigned to new_parent by the
        # claim_parent_link_code call above -- check against the CURRENT
        # parent, not fx.parent_a.
        fx.as_user(new_parent)
        cur.execute("select count(*)::int from homework_items where player_id = %s", (fx.teamless_player,))
        check("parent sees homework tied to the published plan", cur.fetchone()[0] == 1)

        fx.as_user(fx.director_b)
        cur.execute("select count(*)::int from homework_items where player_id = %s", (fx.teamless_player,))
        check("a different club's staff cannot see the teamless client's homework", cur.fetchone()[0] == 0)

        # ---- report_views (report_views_insert) ----
        fx.as_user(fx.coach_a)
        check(
            "club staff can log a report view for the teamless client",
            expect_allowed(cur, "insert into report_views (player_id, viewer_id) values (%s,%s)", (fx.teamless_player, fx.coach_a)),
        )

        fx.as_user(fx.director_b)
        check(
            "a different club's staff cannot log a report view for the teamless client",
            expect_denied(cur, "insert into report_views (player_id, viewer_id) values (%s,%s)", (fx.teamless_player, fx.director_b)),
        )

        # ---- update_targeted_event: same coach-fallback widening as create ----
        # update_targeted_event's own top-level "can you touch this event at
        # all" gate only has a fallback for team-based events (checks
        # team_coaches), not player-targeted ones -- so a coach must be the
        # event's own creator to edit it here, same as for any other
        # player-targeted event today. That's a separate, pre-existing gap,
        # not something Phase 6a's teamless-player fix touches. Make coach_a
        # the creator so this isolates the fallback this migration actually
        # changed (the player-targeting sub-check further down).
        fx.as_user(fx.coach_a)
        cur.execute(
            "select create_targeted_event(%s,'practice','To Edit','Court 1', now() + interval '1 day', null, null, %s)",
            (fx.club_a, [fx.teamless_player]),
        )
        editable_event = cur.fetchone()[0]

        check(
            "a coach can edit an event targeting the teamless client via the same club-staff fallback",
            expect_allowed(
                cur,
                "select update_targeted_event(%s,'practice','Edited Title','Court 2', now() + interval '2 days', null, null, %s, false)",
                (editable_event, [fx.teamless_player]),
            ),
        )

        fx.as_user(fx.director_b)
        check(
            "a different club's staff cannot edit that event",
            expect_denied(
                cur,
                "select update_targeted_event(%s,'practice','Should Fail','Court 2', now() + interval '2 days', null, null, %s, false)",
                (editable_event, [fx.teamless_player]),
            ),
        )

        # ---- review_development_plan ----
        fx.as_user(fx.coach_a)
        check(
            "the evaluating coach can review the teamless client's dev plan",
            expect_allowed(cur, "select review_development_plan(%s, false)", (draft_plan,)),
        )

        # ---- delete_player_data ----
        fx.as_superuser()
        deletable = uuid.uuid4()
        cur.execute("insert into players (id, club_id, parent_id, full_name) values (%s,%s,%s,'Deletable Client')",
                    (deletable, fx.club_a, fx.parent_a))

        fx.as_user(fx.parent_a)
        check(
            "the linked parent can delete their teamless client's data",
            expect_allowed(cur, "select delete_player_data(%s)", (deletable,)),
        )

        # ---- regression: teamed player's existing behavior is untouched ----
        fx.as_user(fx.director_b)
        check(
            "unrelated: a different club's staff still cannot target an ordinary teamed player either",
            expect_denied(
                cur,
                "select create_targeted_event(%s,'practice','Should Fail','Court 1', now() + interval '1 day', null, %s, null)",
                (fx.club_a, fx.team_a),
            ),
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
