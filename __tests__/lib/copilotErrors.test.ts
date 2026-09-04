import { copilotFailureMessage, copilotResponseError } from "../../lib/copilotErrors";

describe("copilotResponseError", () => {
  it("names a missing deployment instead of blaming the data", () => {
    // The gateway's own 404 body says "Requested function was not found",
    // which is true but tells a director nothing they can act on.
    const message = copilotResponseError(404, { code: "NOT_FOUND", message: "Requested function was not found" });
    expect(message).toContain("isn't deployed");
  });

  it("passes the edge function's own user-facing message through", () => {
    const message = copilotResponseError(429, {
      error: "Too many requests — you can call this again in a few minutes (limit: 6 per 1 min).",
    });
    expect(message).toContain("a few minutes");
  });

  it("passes a permission message through", () => {
    const message = copilotResponseError(403, { error: "Only coaches and directors can use the Copilot." });
    expect(message).toBe("Only coaches and directors can use the Copilot.");
  });

  it("falls back to the status when the body carries no message", () => {
    expect(copilotResponseError(500, null)).toContain("500");
    expect(copilotResponseError(502, {})).toContain("502");
  });

  it("ignores a non-string error field rather than rendering an object", () => {
    expect(copilotResponseError(500, { error: { nested: true } })).toContain("500");
  });
});

describe("copilotFailureMessage", () => {
  it("explains a network failure rather than echoing 'Failed to fetch'", () => {
    expect(copilotFailureMessage(new TypeError("Failed to fetch"))).toContain("Couldn't reach");
  });

  it("shows a thrown message so the diagnosis reaches the screen", () => {
    expect(copilotFailureMessage(new Error("Only coaches and directors can use the Copilot."))).toBe(
      "Only coaches and directors can use the Copilot."
    );
  });

  it("still has something to say for a non-Error throw", () => {
    expect(copilotFailureMessage("boom")).toContain("Something went wrong");
    expect(copilotFailureMessage(new Error(""))).toContain("Something went wrong");
  });
});
