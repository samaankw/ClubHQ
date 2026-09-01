import { color, space, radius, type, elevation, borderWidth, opacity } from "./index";
import { palette } from "./primitives";

describe("semantic color", () => {
  it("maps page background to slate 50", () => {
    expect(color.bg.page).toBe(palette.slate[50]);
  });
  it("maps brand surfaces to the brand ramp", () => {
    expect(color.bg.brand).toBe(palette.brand[500]);
    expect(color.text.brand).toBe(palette.brand[500]);
  });
  it("uses white text on spotlight surfaces", () => {
    expect(color.bg.spotlight).toBe(palette.slate[900]);
    expect(color.text.onSpotlight).toBe(palette.white);
  });
  it("derives the scrim from slate 900 at 60% opacity", () => {
    // palette.slate[900] is "#0F172A" -> rgb(15, 23, 42).
    expect(color.bg.scrim).toBe("rgba(15, 23, 42, 0.6)");
  });
});

describe("space", () => {
  it("is a 4pt scale", () => {
    expect(space[0]).toBe(0);
    expect(space[1]).toBe(4);
    expect(space[4]).toBe(16);
    expect(space[10]).toBe(64);
  });
});

describe("radius", () => {
  it("exposes semantic aliases derived from the active scale", () => {
    expect(radius.card).toBe(radius.lg);
    expect(radius.button).toBe(radius.md);
    expect(radius.chip).toBe(radius.full);
  });
});

describe("type", () => {
  it("defines nine roles", () => {
    expect(Object.keys(type)).toHaveLength(9);
  });
  it("makes eyebrow uppercase and letterspaced", () => {
    expect(type.eyebrow.textTransform).toBe("uppercase");
    expect(type.eyebrow.letterSpacing).toBeGreaterThan(0);
  });
  it("never sets a font family", () => {
    for (const role of Object.values(type)) {
      expect(role).not.toHaveProperty("fontFamily");
    }
  });
});

describe("elevation", () => {
  it("sets both iOS shadow and Android elevation", () => {
    expect(elevation.card.shadowRadius).toBeGreaterThan(0);
    expect(elevation.card.elevation).toBeGreaterThan(0);
  });
});

describe("borderWidth", () => {
  it("exposes hairline and thin", () => {
    expect(borderWidth.hairline).toBeGreaterThan(0);
    expect(borderWidth.thin).toBe(1);
  });
});

describe("opacity", () => {
  it("exposes pressed and disabled states between 0 and 1", () => {
    for (const v of [opacity.pressed, opacity.disabled]) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });
});
