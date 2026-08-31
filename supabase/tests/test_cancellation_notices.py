"""Behavioral tests for migration 0034's cancellation-notice trigger."""
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


class Fixture:
    """A club with a director, a training group, two players."""

    def __init__(self, cur):
        self.cur = cur
        self.club = uuid.uuid4()
        self.director = uuid.uuid4()
        self.team = uuid.uuid4()
        self.other_team = uuid.uuid4()
        self.p1, self.p2 = uuid.uuid4(), uuid.uuid4()

        cur.execute("insert into auth.users (id) values (%s)", (self.director,))
        cur.execute("insert into clubs (id, name) values (%s, 'Williams Soccer Clinic')", (self.club,))
        cur.execute("insert into profiles (id, club_id, role, full_name) values (%s,%s,'director','Coach')"
                    " on conflict (id) do update set club_id=excluded.club_id, role='director'",
                    (self.director, self.club))
        for tid, nm in ((self.team, "Thursday Group"), (self.other_team, "Monday Group")):
            cur.execute("insert into teams (id, club_id, name, age_group) values (%s,%s,%s,'U12')",
                        (tid, self.club, nm))
            cur.execute("insert into team_coaches (team_id, coach_id) values (%s,%s)", (tid, self.director))
        for pid, nm in ((self.p1, "Maya K."), (self.p2, "Jordan T.")):
            cur.execute("insert into players (id, team_id, full_name) values (%s,%s,%s)",
                        (pid, self.team, nm))

    def act_as(self, uid):
        self.cur.execute("select set_config('test.uid', %s, false)", (str(uid) if uid else "",))

    def make_event(self, starts_at, title="Thursday Small Group", team=True,
                   players=None, series_id=None, event_id=None):
        eid = event_id or uuid.uuid4()
        self.cur.execute(
            "insert into events (id, club_id, team_id, type, title, location, starts_at, created_by, series_id)"
            " values (%s,%s,%s,'practice',%s,'Dunwoody Field 3',%s,%s,%s)",
            (eid, self.club, self.team if team else None, title, starts_at, self.director, series_id))
        for pid in (players or []):
            self.cur.execute("insert into event_players (event_id, player_id, club_id) values (%s,%s,%s)",
                             (eid, pid, self.club))
        return eid

    def make_series(self, first, count, team=True, players=None):
        """Anchor event plus siblings, mirroring create_recurring_event (0023):
        series_id points at the anchor, and the anchor points at itself."""
        anchor = uuid.uuid4()
        self.make_event(first, team=team, players=players, series_id=None, event_id=anchor)
        self.cur.execute("update events set series_id = id where id = %s", (anchor,))
        ids = [anchor]
        for i in range(1, count):
            ids.append(self.make_event(first + timedelta(days=7 * i), team=team,
                                       players=players, series_id=anchor))
        return anchor, ids

    def cancellations(self):
        self.cur.execute(
            "select id, title, body, category, target_type, team_id, auto_generated,"
            " source_cancelled_event_ids, source_series_id, author_id, club_id"
            " from announcements where category = 'cancellation' order by created_at")
        return self.cur.fetchall()


def run():
    conn = psycopg2.connect(**CONN)
    conn.set_client_encoding("UTF8")
    conn.autocommit = True
    cur = conn.cursor()

    fx = Fixture(cur)
    fx.act_as(fx.director)
    now = datetime.now(timezone.utc)
    future = now + timedelta(days=3)

    def clear():
        cur.execute("delete from announcements")

    # --- 1. Deleting one upcoming session ---
    clear()
    e = fx.make_event(future)
    cur.execute("select delete_event(%s, true)", (e,))
    returned = cur.fetchone()[0]
    rows = fx.cancellations()
    if check("deleting an upcoming session writes one notice", len(rows) == 1, f"got {len(rows)}"):
        aid, title, body, cat, tt, team_id, auto, evt_ids, series = rows[0][:9]
        check("title reads 'Cancelled: …'", title == "Cancelled: Thursday Small Group", title)
        check("body says when it was", body.startswith("Was: "), repr(body))
        check("targets the team", tt == "team" and team_id == fx.team, f"{tt} {team_id}")
        check("flagged auto_generated", auto is True)
        check("records the deleted event id", evt_ids == [e], str(evt_ids))
        check("RPC returns the notice id so the client can push it",
              returned == [aid], f"{returned} vs {[aid]}")
    cur.execute("select count(*) from events where id=%s", (e,))
    check("the event really is gone", cur.fetchone()[0] == 0)

    # --- 2. Past sessions are cleanup, not news ---
    clear()
    e = fx.make_event(now - timedelta(days=2))
    cur.execute("select delete_event(%s, true)", (e,))
    check("deleting a past session writes nothing", len(fx.cancellations()) == 0)

    # --- 3. Opting out ---
    clear()
    e = fx.make_event(future)
    cur.execute("select delete_event(%s, false)", (e,))
    check("p_notify=false writes nothing", len(fx.cancellations()) == 0)
    cur.execute("select count(*) from events where id=%s", (e,))
    check("…but the session is still deleted", cur.fetchone()[0] == 0)

    # --- 4. Player-targeted session ---
    clear()
    e = fx.make_event(future, players=[fx.p1])
    cur.execute("select delete_event(%s, true)", (e,))
    rows = fx.cancellations()
    if check("player-targeted session writes a notice", len(rows) == 1, f"got {len(rows)}"):
        aid, _, _, _, tt, team_id, _, _, _ = rows[0][:9]
        check("target_type is 'players'", tt == "players", tt)
        check("team_id is null (target_type check constraint)", team_id is None, str(team_id))
        cur.execute("select player_id from announcement_player_targets where announcement_id=%s", (aid,))
        got = {r[0] for r in cur.fetchall()}
        check("addressed to that player only", got == {fx.p1}, str(got))

    # --- 5. Club-wide session ---
    clear()
    e = fx.make_event(future, team=False)
    cur.execute("select delete_event(%s, true)", (e,))
    rows = fx.cancellations()
    if check("club-wide session writes a notice", len(rows) == 1, f"got {len(rows)}"):
        check("target_type is 'everyone'", rows[0][4] == "everyone", rows[0][4])

    # --- 6. Cancelling a whole block is ONE card, not twelve ---
    clear()
    anchor, ids = fx.make_series(future, 4)
    cur.execute("select cancel_event_series(%s, %s, true)", (anchor, future))
    returned = cur.fetchone()[0]
    rows = fx.cancellations()
    if check("cancelling 4 sessions writes ONE notice", len(rows) == 1, f"got {len(rows)}"):
        aid, title, body, _, _, _, _, evt_ids, series = rows[0][:9]
        check("title counts them", title == "4 sessions cancelled: Thursday Small Group", title)
        check("body lists 4 dates", len(body.strip().splitlines()) == 4, repr(body))
        # Sessions are weekly from `future`, so the day-of-month in each line
        # must climb (modulo a month boundary, which 4 weeks can cross once).
        days = [int(line.split()[2]) for line in body.strip().splitlines()]
        ascending = all(b > a or b < a - 20 for a, b in zip(days, days[1:]))
        check("dates are listed oldest first", ascending, str(days))
        check("records all 4 event ids", sorted(map(str, evt_ids)) == sorted(map(str, ids)),
              f"{len(evt_ids)} ids")
        check("keeps the series link", series == anchor, str(series))
        check("RPC returns the single notice", returned == [aid], str(returned))
    cur.execute("select count(*) from events where series_id = %s", (anchor,))
    check("every session in the block is gone", cur.fetchone()[0] == 0)

    # --- 7. Long block collapses instead of listing 20 lines ---
    clear()
    anchor, ids = fx.make_series(future, 12)
    cur.execute("select cancel_event_series(%s, %s, true)", (anchor, future))
    rows = fx.cancellations()
    if check("cancelling 12 sessions still writes ONE notice", len(rows) == 1, f"got {len(rows)}"):
        title, body = rows[0][1], rows[0][2]
        lines = body.strip().splitlines()
        check("title counts all 12", title.startswith("12 sessions cancelled:"), title)
        check("body lists 8 then collapses", len(lines) == 9, f"{len(lines)} lines")
        check("last line is an overflow count", lines[-1] == "…and 4 more", lines[-1])

    # --- 8. Past sessions in a series are untouched and unannounced ---
    clear()
    anchor = uuid.uuid4()
    fx.make_event(now - timedelta(days=7), series_id=None, event_id=anchor)
    cur.execute("update events set series_id = id where id = %s", (anchor,))
    later = [fx.make_event(future + timedelta(days=7 * i), series_id=anchor) for i in range(2)]
    cur.execute("select cancel_event_series(%s, %s, true)", (anchor, future))
    rows = fx.cancellations()
    if check("cancelling from a future date writes one notice", len(rows) == 1, f"got {len(rows)}"):
        check("only the 2 future sessions are named",
              rows[0][1].startswith("2 sessions cancelled:"), rows[0][1])
    cur.execute("select count(*) from events where id = %s", (anchor,))
    check("the past session survives", cur.fetchone()[0] == 1)

    # --- 9. A pending change notice is retracted, not left contradicting ---
    clear()
    e = fx.make_event(future)
    cur.execute("select update_targeted_event(%s::uuid,'practice','Thursday Small Group',"
                "'Dunwoody Field 3',%s,null,%s::uuid,null::uuid[],true)",
                (e, future + timedelta(hours=1), fx.team))
    cur.execute("select count(*) from announcements where category='schedule' and auto_generated")
    check("moving it first writes a change notice", cur.fetchone()[0] == 1)
    cur.execute("select delete_event(%s, true)", (e,))
    cur.execute("select count(*) from announcements where category='schedule' and auto_generated")
    check("cancelling retracts the stale 'New time' notice", cur.fetchone()[0] == 0)
    check("and leaves the cancellation standing", len(fx.cancellations()) == 1)

    # --- 10. Service-role deletion stays silent ---
    clear()
    e = fx.make_event(future)
    fx.act_as(None)
    cur.execute("delete from events where id = %s", (e,))
    fx.act_as(fx.director)
    check("a deletion with no signed-in user writes nothing", len(fx.cancellations()) == 0)

    # --- 11. Tearing down a team must not spam, or fail ---
    clear()
    cur.execute("insert into teams (id, club_id, name, age_group) values (%s,%s,'Doomed','U9')",
                (doomed := uuid.uuid4(), fx.club))
    cur.execute("insert into team_coaches (team_id, coach_id) values (%s,%s)", (doomed, fx.director))
    cur.execute("insert into events (id, club_id, team_id, type, title, location, starts_at, created_by)"
                " values (%s,%s,%s,'practice','Doomed Session','X',%s,%s)",
                (uuid.uuid4(), fx.club, doomed, future, fx.director))
    try:
        cur.execute("delete from teams where id = %s", (doomed,))
        deleted_ok = True
        err = ""
    except Exception as exc:
        deleted_ok = False
        err = str(exc).splitlines()[0]
    check("deleting a team still works (cascade guard)", deleted_ok, err)
    check("…and writes no cancellation notices", len(fx.cancellations()) == 0)

    # --- 12. Different targeting in one series does not merge audiences ---
    clear()
    anchor = uuid.uuid4()
    fx.make_event(future, series_id=None, event_id=anchor)
    cur.execute("update events set series_id = id where id = %s", (anchor,))
    cur.execute("update events set team_id = %s where id = %s", (fx.other_team, anchor))
    fx.make_event(future + timedelta(days=7), series_id=anchor)  # fx.team
    cur.execute("select cancel_event_series(%s, %s, true)", (anchor, future))
    rows = fx.cancellations()
    if check("mismatched targeting produces two notices, not one", len(rows) == 2, f"got {len(rows)}"):
        teams = {r[5] for r in rows}
        check("one per audience", teams == {fx.team, fx.other_team}, str(teams))

    # --- Contract with send-announcement-push -------------------------------
    #
    # The client fires send-announcement-push for each id these RPCs return.
    # That function refuses to fan out unless announcement.author_id equals the
    # caller and club_id equals the caller's club (index.ts:55-60). If the
    # trigger ever attributed a notice to events.created_by instead of
    # auth.uid() -- which is what the *change* trigger in 0033 falls back to --
    # every cancellation posted by a coach who didn't create the session would
    # be written correctly and then silently 403 at the push step. The notice
    # would sit in the feed and no phone would ring, which is the exact failure
    # the feature exists to prevent.
    #
    # Recipient selection lives on the other side of that boundary and is
    # covered in supabase/functions/tests/announcement_push_test.ts.
    clear()
    second = uuid.uuid4()
    cur.execute("insert into auth.users (id) values (%s)", (second,))
    cur.execute("insert into profiles (id, club_id, role, full_name)"
                " values (%s,%s,'coach','Coach Two')"
                " on conflict (id) do update set club_id=excluded.club_id, role='coach'",
                (second, fx.club))
    cur.execute("insert into team_coaches (team_id, coach_id) values (%s,%s)", (fx.team, second))

    e = fx.make_event(future)          # created_by = fx.director
    fx.act_as(second)                  # a different coach does the cancelling
    cur.execute("select delete_event(%s, true)", (e,))
    returned = cur.fetchone()[0] or []
    rows = fx.cancellations()

    if check("a coach can cancel a session someone else created", len(rows) == 1, f"got {len(rows)}"):
        check("author_id is the cancelling coach, not the event's creator",
              rows[0][9] == second,
              f"author_id={rows[0][9]}, cancelled by {second}, created by {fx.director}")
        check("club_id matches, so the push clears its club check",
              rows[0][10] == fx.club, str(rows[0][10]))
        check("the RPC returns exactly the notice ids to push",
              [r[0] for r in rows] == list(returned),
              f"returned {list(returned)}, created {[r[0] for r in rows]}")
    fx.act_as(fx.director)

    print()
    failed = [n for n, ok, _ in results if not ok]
    print(f"{len(results) - len(failed)}/{len(results)} passed")
    if failed:
        print("Failed: " + "; ".join(failed))
    return len(failed)


if __name__ == "__main__":
    raise SystemExit(1 if run() else 0)
