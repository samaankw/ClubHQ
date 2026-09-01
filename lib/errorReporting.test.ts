import { redactMessage, reportError } from "./errorReporting";

describe("redactMessage", () => {
  test("strips a JWT-shaped token out of an error message", () => {
    const message = "Invalid token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U rejected";
    expect(redactMessage(message)).toBe("Invalid token: [redacted-token] rejected");
  });

  test("strips an email address out of an error message", () => {
    expect(redactMessage("No profile found for coach@example.com")).toBe("No profile found for [redacted-email]");
  });

  test("leaves an ordinary message with no token or email untouched", () => {
    expect(redactMessage("permission denied for table players")).toBe("permission denied for table players");
  });
});

describe("reportError", () => {
  // No EXPO_PUBLIC_SENTRY_DSN is set in the test environment, so
  // errorReporting.ts never calls Sentry.init -- this exercises the actual
  // no-DSN-configured path every dev machine and CI run takes today.
  test("never throws when no DSN is configured", () => {
    expect(() => reportError({ message: "boom" }, { scope: "test" })).not.toThrow();
  });

  test("redacts the message before it would reach any transport", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    reportError({ message: "failed for user@example.com" }, { scope: "test-scope", extra: { count: 3 } });
    expect(spy).toHaveBeenCalledWith("[test-scope]", "failed for [redacted-email]", { count: 3 });
    spy.mockRestore();
  });
});

describe("reportError once a DSN is configured", () => {
  const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  afterEach(() => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
    jest.resetModules();
  });

  test("routes through Sentry.captureException instead of console.error once initErrorReporting has run", async () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://fake@o0.ingest.sentry.io/1";
    const init = jest.fn();
    const captureException = jest.fn();
    jest.doMock("@sentry/react-native", () => ({ init, captureException }));

    const fresh = require("./errorReporting") as typeof import("./errorReporting");
    fresh.initErrorReporting();
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ dsn: "https://fake@o0.ingest.sentry.io/1" }));

    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    fresh.reportError({ message: "db exploded" }, { scope: "test" });
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
