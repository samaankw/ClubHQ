"""Behavioral tests for migration 0034's auto change-notice trigger."""
import uuid, psycopg2
import psycopg2.extras

psycopg2.extras.register_uuid()
from datetime import datetime, timedelta, timezone

CONN = dict(host="/tmp", port=5439, user="postgres", dbname="postgres",
            options="-c client_encoding=UTF8 -c search_path=public,extensions")

results = []


def check(name, cond, detail=""):
    results.append((name, cond, detail))
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f"\n         {detail}" if detail and not cond else ""))
    # Returned so callers can gate follow-up assertions on it. Without this
    # `if check(...)` is always falsy and the nested checks never run.
    return bool(cond)


class Fixture:
    """A club with a director, a training group, two players, and one event."""

    def __init__(self, cur):
        self.cur = cur
        self.club = uuid.uuid4()
        self.director = uuid.uuid4()
        self.team = uuid.uuid4()
        self.p1, self.p2 = uuid.uuid4(), uuid.uuid4()
        self.parent1, self.parent2 = uuid.uuid4(), uuid.uuid4()

        for uid in (self.director, self.parent1, self.parent2):
            cur.execute("insert into auth.users (id) values (%s)", (str(uid),))
        cur.execute("insert into clubs (id, name) values (%s, 'Williams Soccer Clinic')", (str(self.club),))
        # A trigger on auth.users already creates a bare profile row, so
        # these upsert onto it rather than inserting fresh.
        cur.execute("insert into profiles (id, club_id, role, full_name) values (%s,%s,'director','Coach')"
                    " on conflict (id) do update set club_id=excluded.club_id, role='director', full_name='Coach'",
                    (str(self.director), str(self.club)))
        for pid, nm in ((self.parent1, "Parent One"), (self.parent2, "Parent Two")):
            cur.execute("insert into profiles (id, club_id, role, full_name) values (%s,%s,'parent',%s)"
                        " on conflict (id) do update set club_id=excluded.club_id, role='parent',"
                        " full_name=excluded.full_name",
                        (str(pid), str(self.club), nm))
        cur.execute("insert into teams (id, club_id, name, age_group) values (%s,%s,'Williams Soccer Clinic','U12')",
                    (str(self.team), str(self.club)))
        cur.execute("insert into team_coaches (team_id, coach_id) values (%s,%s)",
                    (str(self.team), str(self.director)))
        for pid, parent, nm in ((self.p1, self.parent1, "Maya K."), (self.p2, self.parent2, "Jordan T.")):
            cur.execute(
                "insert into players (id, team_id, club_id, full_name, parent_id) values (%s,%s,%s,%s,%s)",
                (str(pid), str(self.team), str(self.club), nm, str(parent)))

    def act_as(self, uid):
        self.cur.execute("select set_config('test.uid', %s, false)", (str(uid),))

    def make_event(self, starts_at, location="Dunwoody Field 3", team=True, players=None):
        eid = uuid.uuid4()
        self.cur.execute(
            "insert into events (id, club_id, team_id, type, title, location, starts_at, created_by)"
            " values (%s,%s,%s,'practice','Thursday Small Group',%s,%s,%s)",
            (str(eid), str(self.club), str(self.team) if team else None, location,
             starts_at, str(self.director)))
        for pid in (players or []):
            self.cur.execute("insert into event_players (event_id, player_id, club_id) values (%s,%s,%s)",
                             (str(eid), str(pid), str(self.club)))
        return eid

    def edit(self, eid, starts_at, location, notify=True, team=True, player_ids=None, notes=None):
        self.cur.execute(
            "select update_targeted_event(%s::uuid,'practice','Thursday Small Group',%s,%s,%s,%s::uuid,%s::uuid[],%s)",
            (str(eid), location, starts_at, notes,
             str(self.team) if team else None,
             [str(p) for p in player_ids] if player_ids else None,
             notify))

    def notices(self, eid):
        self.cur.execute(
            "select id, title, body, category, target_type, team_id, auto_generated, source_prev_starts_at"
            " from announcements where source_event_id = %s order by created_at",
            (str(eid),))
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

    # --- 1. Time change on a future team session ---
    e = fx.make_event(future)
    fx.edit(e, future + timedelta(hours=1), "Dunwoody Field 3")
    rows = fx.notices(e)
    check("time change creates exactly one notice", len(rows) == 1, f"got {len(rows)}")
    if rows:
        _, title, body, cat, tt, team_id, auto, _ = rows[0]
        check("category is 'schedule'", cat == "schedule", cat)
        check("title reads 'New time: …'", title.startswith("New time:"), title)
        check("body shows a When arrow", "When:" in body and "→" in body, repr(body))
        check("body omits Where when location unchanged", "Where:" not in body, repr(body))
        check("targets the team", tt == "team" and team_id == fx.team, f"{tt} {team_id}")
        check("flagged auto_generated", auto is True)

    # --- 2. Location only ---
    e = fx.make_event(future)
    fx.edit(e, future, "Stone Mountain Park")
    rows = fx.notices(e)
    check("location change creates one notice", len(rows) == 1, f"got {len(rows)}")
    if rows:
        _, title, body, cat, *_ = rows[0]
        check("category is 'location'", cat == "location", cat)
        check("title reads 'New location: …'", title.startswith("New location:"), title)
        check("body shows old → new location",
              "Dunwoody Field 3" in body and "Stone Mountain Park" in body, repr(body))

    # --- 3. Both at once ---
    e = fx.make_event(future)
    fx.edit(e, future + timedelta(days=1), "Snellville Turf")
    rows = fx.notices(e)
    if check("both-change creates one notice", len(rows) == 1, f"got {len(rows)}") or rows:
        _, title, body, cat, *_ = rows[0]
        check("time outranks location for category", cat == "schedule", cat)
        check("title mentions both", title.startswith("Time and location changed:"), title)
        check("body has both lines", "When:" in body and "Where:" in body, repr(body))

    # --- 4. Past session is bookkeeping, not news ---
    past = now - timedelta(days=2)
    e = fx.make_event(past)
    fx.edit(e, past + timedelta(hours=1), "Dunwoody Field 3")
    check("past session produces no notice", len(fx.notices(e)) == 0)

    # --- 5. Notes-only edit ---
    e = fx.make_event(future)
    fx.edit(e, future, "Dunwoody Field 3", notes="bring pinnies")
    check("notes-only edit produces no notice", len(fx.notices(e)) == 0)

    # --- 6. Coach opts out ---
    e = fx.make_event(future)
    fx.edit(e, future + timedelta(hours=2), "Dunwoody Field 3", notify=False)
    check("notify=false suppresses the notice", len(fx.notices(e)) == 0)
    cur.execute("select starts_at from events where id = %s", (str(e),))
    check("…but the edit itself still saved",
          cur.fetchone()[0].astimezone(timezone.utc).hour == (future + timedelta(hours=2)).hour)

    # --- 7. Two edits in the window fold into one, measured from the original ---
    e = fx.make_event(future, location="Dunwoody Field 3")
    fx.edit(e, future + timedelta(hours=1), "Dunwoody Field 3")
    fx.edit(e, future + timedelta(hours=1), "Stone Mountain Park")
    rows = fx.notices(e)
    check("second edit folds into the same notice", len(rows) == 1, f"got {len(rows)}")
    if rows:
        _, title, body, cat, _, _, _, prev = rows[0]
        check("folded notice covers both changes", "When:" in body and "Where:" in body, repr(body))
        check("folded 'was' is the ORIGINAL time, not the intermediate",
              abs((prev.astimezone(timezone.utc) - future).total_seconds()) < 1,
              f"prev={prev} original={future}")
        check("folded body shows the original location as the 'from'",
              "Dunwoody Field 3" in body and "Stone Mountain Park" in body, repr(body))

    # --- 8. Revert within the window retracts the notice ---
    e = fx.make_event(future)
    fx.edit(e, future + timedelta(hours=1), "Dunwoody Field 3")
    check("notice exists after first move", len(fx.notices(e)) == 1)
    fx.edit(e, future, "Dunwoody Field 3")
    check("moving it back retracts the notice", len(fx.notices(e)) == 0)

    # --- 9. Player-targeted session ---
    e = fx.make_event(future, team=True, players=[fx.p1])
    fx.edit(e, future + timedelta(hours=1), "Dunwoody Field 3", team=False, player_ids=[fx.p1])
    rows = fx.notices(e)
    check("player-targeted session produces a notice", len(rows) == 1, f"got {len(rows)}")
    if rows:
        aid, _, _, _, tt, team_id, _, _ = rows[0]
        check("target_type is 'players'", tt == "players", tt)
        check("team_id is null (satisfies the 0013 check constraint)", team_id is None, str(team_id))
        cur.execute("select player_id from announcement_player_targets where announcement_id=%s", (str(aid),))
        got = {r[0] for r in cur.fetchall()}
        check("targets exactly the event's players", got == {fx.p1}, str(got))

    # --- 10. The reason the trigger is DEFERRED: targeting changes in the
    #        same call that changes the time. A non-deferred AFTER trigger
    #        would read event_players before update_targeted_event rewrites it
    #        and address the notice to the wrong family.
    e = fx.make_event(future, team=True, players=[fx.p1])
    fx.edit(e, future + timedelta(hours=3), "Dunwoody Field 3", team=False, player_ids=[fx.p2])
    rows = fx.notices(e)
    if check("retarget+retime produces a notice", len(rows) == 1, f"got {len(rows)}"):
        aid = rows[0][0]
        cur.execute("select player_id from announcement_player_targets where announcement_id=%s", (str(aid),))
        got = {r[0] for r in cur.fetchall()}
        check("notice goes to the NEW player, not the old one (deferred trigger)",
              got == {fx.p2}, f"got {got}, expected {{{fx.p2}}}")

    # --- 11. Club-wide session ---
    e = fx.make_event(future, team=False)
    fx.edit(e, future + timedelta(hours=1), "Dunwoody Field 3", team=False, player_ids=None)
    rows = fx.notices(e)
    if check("club-wide session produces a notice", len(rows) == 1, f"got {len(rows)}"):
        check("target_type is 'everyone'", rows[0][4] == "everyone", rows[0][4])

    # --- 12. Deleting the event keeps the *historical* notice.
    #
    #   0035 narrowed this: a change notice still inside the fold window is
    #   retracted on delete, because "New time: Thursday" sitting next to
    #   "Cancelled: Thursday" tells a parent to show up. Anything older is
    #   history a parent may already have read, and survives with a null
    #   source_event_id. Backdated here to land on the surviving side; the
    #   retraction case is asserted in test_cancellation_notices.py.
    e = fx.make_event(future)
    fx.edit(e, future + timedelta(hours=1), "Dunwoody Field 3")
    cur.execute("select id from announcements where source_event_id = %s", (str(e),))
    row = cur.fetchone()
    if check("edit produced a notice to age out", row is not None):
        aid = row[0]
        cur.execute("update announcements set created_at = now() - interval '1 day' where id = %s", (aid,))
        cur.execute("delete from events where id = %s", (str(e),))
        cur.execute("select source_event_id from announcements where id = %s", (aid,))
        survived = cur.fetchone()
        check("an aged notice survives event deletion (ON DELETE SET NULL)",
              survived is not None and survived[0] is None,
              "row deleted" if survived is None else f"source_event_id={survived[0]}")

    print()
    failed = [n for n, ok, _ in results if not ok]
    print(f"{len(results) - len(failed)}/{len(results)} passed")
    if failed:
        print("Failed: " + ", ".join(failed))
    return len(failed)


if __name__ == "__main__":
    raise SystemExit(1 if run() else 0)
