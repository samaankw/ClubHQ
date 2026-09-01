import { palette } from "./primitives";
import { radiusScales } from "./scales";

describe("palette", () => {
  it("uses the confirmed single brand blue", () => {
    expect(palette.brand[500]).toBe("#0066FF");
  });

  it("uses the slate ramp measured from the mockups", () => {
    expect(palette.slate[50]).toBe("#F8FAFC");
    expect(palette.slate[900]).toBe("#0F172A");
    expect(palette.slate[200]).toBe("#E2E8F0");
    expect(palette.slate[600]).toBe("#475569");
  });

  it("every color is a 6-digit uppercase hex", () => {
    const walk = (o: object): string[] => Object.values(o).flatMap((v) => (typeof v === "string" ? [v] : walk(v)));
    for (const c of walk(palette)) expect(c).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("radiusScales", () => {
  it("offers three variants with identical keys", () => {
    const keys = Object.keys(radiusScales.rounded).sort();
    expect(Object.keys(radiusScales.sharp).sort()).toEqual(keys);
    expect(Object.keys(radiusScales.soft).sort()).toEqual(keys);
  });

  it("orders each scale monotonically", () => {
    for (const s of Object.values(radiusScales)) {
      expect(s.xs).toBeLessThan(s.sm);
      expect(s.sm).toBeLessThan(s.md);
      expect(s.md).toBeLessThan(s.lg);
      expect(s.lg).toBeLessThan(s.xl);
      expect(s.xl).toBeLessThan(s.xxl);
    }
  });
});
