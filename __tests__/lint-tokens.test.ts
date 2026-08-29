import { findViolations, lintScoped, CONVERTED } from "../scripts/lint-tokens.mjs";

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

  it("flags a raw rgba() color", () => {
    const v = findViolations('const s = { backgroundColor: "rgba(15, 23, 42, 0.6)" };', "app/x.tsx");
    expect(v.map((x) => x.rule)).toEqual(["raw-color"]);
  });

  it("flags a raw hsl() color", () => {
    const v = findViolations('const s = { backgroundColor: "hsl(210, 100%, 50%)" };', "app/x.tsx");
    expect(v.map((x) => x.rule)).toEqual(["raw-color"]);
  });
});

describe("lintScoped", () => {
  it("only checks files it was given, ignoring anything else on disk", () => {
    const sources: Record<string, string> = {
      "app/scoped.tsx": "const s = { color: color.text.primary };",
      "app/not-scoped.tsx": 'const s = { color: "#FF0000" };',
    };
    const violations = lintScoped(["app/scoped.tsx"], (f: string) => sources[f]);
    expect(violations).toHaveLength(0);
  });

  it("still flags violations inside a file that is in scope", () => {
    const violations = lintScoped(["app/bad.tsx"], () => 'const s = { color: "#FF0000" };');
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe("app/bad.tsx");
  });

  it("checks every file passed in, not just the first", () => {
    const sources: Record<string, string> = {
      "app/a.tsx": 'const s = { color: "#111111" };',
      "app/b.tsx": 'const s = { color: "#222222" };',
    };
    const violations = lintScoped(["app/a.tsx", "app/b.tsx"], (f: string) => sources[f]);
    expect(violations.map((v: { file: string }) => v.file)).toEqual(["app/a.tsx", "app/b.tsx"]);
  });

  it("CONVERTED lists at least the screens named in the design-system plan", () => {
    expect(CONVERTED).toEqual(expect.arrayContaining([
      "app/(tabs)/dashboard.tsx",
      "app/(tabs)/profile.tsx",
      "app/(tabs)/players.tsx",
    ]));
  });
});
