import { ANNOUNCEMENT_CATEGORIES, FILTER_BUCKETS } from "./announcementCategories";
import { color } from "../theme";

describe("ANNOUNCEMENT_CATEGORIES", () => {
  it("colors the 'changed' tier from color.icon.warning, not a raw hex", () => {
    expect(ANNOUNCEMENT_CATEGORIES.schedule.color).toBe(color.icon.warning);
    expect(ANNOUNCEMENT_CATEGORIES.location.color).toBe(color.icon.warning);
    expect(ANNOUNCEMENT_CATEGORIES.holiday.color).toBe(color.icon.warning);
    expect(ANNOUNCEMENT_CATEGORIES.weather.color).toBe(color.icon.warning);
  });

  it("colors the 'opportunity' tier from color.text.success, not a raw hex", () => {
    expect(ANNOUNCEMENT_CATEGORIES.availability.color).toBe(color.text.success);
    expect(ANNOUNCEMENT_CATEGORIES.clinic.color).toBe(color.text.success);
    expect(ANNOUNCEMENT_CATEGORIES.camp.color).toBe(color.text.success);
  });

  it("colors the 'info' tier from color.text.brand, not a raw hex (the retired legacy blue)", () => {
    expect(ANNOUNCEMENT_CATEGORIES.training_focus.color).toBe(color.text.brand);
    expect(ANNOUNCEMENT_CATEGORIES.challenge.color).toBe(color.text.brand);
    expect(ANNOUNCEMENT_CATEGORIES.what_to_bring.color).toBe(color.text.brand);
    expect(ANNOUNCEMENT_CATEGORIES.general.color).toBe(color.text.brand);
  });

  it("gives every 'changed' tier category (something a parent already planned around) a way back to the schedule", () => {
    expect(ANNOUNCEMENT_CATEGORIES.schedule.actionLabel).toBe("View Schedule");
    expect(ANNOUNCEMENT_CATEGORIES.location.actionLabel).toBe("View Schedule");
    expect(ANNOUNCEMENT_CATEGORIES.holiday.actionLabel).toBe("View Schedule");
  });

  it("maps every category into a bucket that FILTER_BUCKETS actually offers", () => {
    const bucketKeys = new Set(FILTER_BUCKETS.map((b) => b.key));
    for (const meta of Object.values(ANNOUNCEMENT_CATEGORIES)) {
      expect(bucketKeys.has(meta.bucket)).toBe(true);
    }
  });
});

describe("FILTER_BUCKETS", () => {
  it("starts with an 'all' option", () => {
    expect(FILTER_BUCKETS[0]).toEqual({ key: "all", label: "All" });
  });
});
