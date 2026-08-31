import { buildStartsAt, matchTimePreset, weeklyOccurrences, TIME_PRESETS } from "../../lib/eventSchedule";

describe("buildStartsAt", () => {
  // Midnight and noon are exactly where naive 12-hour conversions get the
  // hour24 math backwards.
  it("converts 12 AM to hour 0 (midnight)", () => {
    const d = buildStartsAt("2026-03-01", 12, 0, "AM");
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("converts 12 PM to hour 12 (noon)", () => {
    const d = buildStartsAt("2026-03-01", 12, 0, "PM");
    expect(d.getHours()).toBe(12);
  });

  it("converts 1 PM to hour 13", () => {
    const d = buildStartsAt("2026-03-01", 1, 0, "PM");
    expect(d.getHours()).toBe(13);
  });

  it("converts 11 PM to hour 23", () => {
    const d = buildStartsAt("2026-03-01", 11, 0, "PM");
    expect(d.getHours()).toBe(23);
  });

  it("leaves AM hours 1-11 unchanged", () => {
    const d = buildStartsAt("2026-03-01", 9, 15, "AM");
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(15);
  });

  it("lands on the given calendar date", () => {
    const d = buildStartsAt("2026-07-04", 6, 30, "PM");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // July is month index 6
    expect(d.getDate()).toBe(4);
  });
});

describe("matchTimePreset", () => {
  it("matches an on-chip time", () => {
    expect(matchTimePreset("5", "00", "PM")).toEqual(
      expect.objectContaining({ label: "5:00 PM" })
    );
  });

  it("matches every preset chip exactly", () => {
    for (const p of TIME_PRESETS) {
      expect(matchTimePreset(p.hour, p.minute, p.meridiem)).toBe(p);
    }
  });

  // The whole point of falling through to "Custom" instead of rounding: a
  // coach who reopens a 5:17 PM practice must see 5:17, not 5:00 or 5:30.
  it("does not match 5:17 PM and falls through to custom", () => {
    expect(matchTimePreset("5", "17", "PM")).toBeUndefined();
  });

  it("does not match a preset's hour/minute under the wrong meridiem", () => {
    expect(matchTimePreset("5", "00", "AM")).toBeUndefined();
  });
});

describe("weeklyOccurrences", () => {
  it("returns the requested count", () => {
    const start = new Date(2026, 2, 2, 17, 0, 0);
    expect(weeklyOccurrences(start, 4)).toHaveLength(4);
  });

  it("includes the start time itself as the first occurrence", () => {
    const start = new Date(2026, 2, 2, 17, 0, 0);
    const [first] = weeklyOccurrences(start, 3);
    expect(first).toEqual(start);
  });

  it("spaces occurrences 7 days apart at the same clock time", () => {
    const start = new Date(2026, 2, 2, 17, 30, 0); // Mon Mar 2, 2026, 5:30 PM
    const occ = weeklyOccurrences(start, 3);
    expect(occ[1].getDate()).toBe(9);
    expect(occ[2].getDate()).toBe(16);
    for (const d of occ) {
      expect(d.getHours()).toBe(17);
      expect(d.getMinutes()).toBe(30);
    }
  });

  it("carries the series across a month boundary", () => {
    const start = new Date(2026, 0, 28, 18, 0, 0); // Wed Jan 28, 2026, 6 PM
    const occ = weeklyOccurrences(start, 2);
    expect(occ[1].getMonth()).toBe(1); // February
    expect(occ[1].getDate()).toBe(4);
    expect(occ[1].getHours()).toBe(18);
  });

  it("preserves wall-clock time across a DST transition, when the runtime honours one", () => {
    // US spring-forward in 2026 is March 8th. A practice the week before at
    // 5 PM should still read 5 PM the week after, not 4 or 6.
    const start = new Date(2026, 2, 1, 17, 0, 0); // Sun Mar 1, 2026, 5 PM
    const [, second] = weeklyOccurrences(start, 2);
    expect(second.getHours()).toBe(17);
    expect(second.getMinutes()).toBe(0);
  });

  it("returns an empty array for a count of zero", () => {
    expect(weeklyOccurrences(new Date(2026, 2, 2), 0)).toEqual([]);
  });
});
