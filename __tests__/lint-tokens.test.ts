import { findViolations } from "../scripts/lint-tokens.mjs";

describe("findViolations", () => {
  it("flags a raw hex color", () => {
    const v = findViolations('const s = { color: "#0066FF" };', "app/x.tsx");
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe("raw-color");
    expect(v[0].line).toBe(1);
  });

  it("flags a raw fontSize", () => {
    const v = findViolations("const s = { fontSize: 14 };", "app/x.tsx");
    expect(v.map((x) => x.rule)).toEqual(["raw-font-size"]);
  });

  it("flags a raw borderRadius", () => {
    const v = findViolations("const s = { borderRadius: 10 };", "app/x.tsx");
    expect(v.map((x) => x.rule)).toEqual(["raw-border-radius"]);
  });

  it("allows token references", () => {
    const src = "const s = { fontSize: type.body.fontSize, borderRadius: radius.card };";
    expect(findViolations(src, "app/x.tsx")).toHaveLength(0);
  });

  it("reports the correct line number", () => {
    const v = findViolations('a\nb\nconst c = "#FFFFFF";', "app/x.tsx");
    expect(v[0].line).toBe(3);
  });

  it("ignores hex inside a line comment", () => {
    const v = findViolations('// was #0066FF before tokens', "app/x.tsx");
    expect(v).toHaveLength(0);
  });

  it("does not let a URL's // swallow a real violation on the same line", () => {
    const v = findViolations(
      'const s = { uri: "https://cdn.example.com/a.png", borderRadius: 8 };',
      "app/x.tsx"
    );
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe("raw-border-radius");
  });

  it("flags a raw borderWidth", () => {
    const v = findViolations("const s = { borderWidth: 1 };", "app/x.tsx");
    expect(v.map((x) => x.rule)).toEqual(["raw-border-width"]);
  });

  it("allows a borderWidth token reference", () => {
    expect(findViolations("const s = { borderWidth: borderWidth.thin };", "app/x.tsx")).toHaveLength(0);
  });
});
