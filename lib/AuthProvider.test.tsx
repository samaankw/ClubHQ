import { createSessionFromUrl } from "./AuthProvider";

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));

jest.mock("expo-linking", () => {
  function parse(url: string) {
    const m = url.match(/^([a-zA-Z0-9+.-]+):\/\/([^/?#]*)?\/?([^?#]*)?(?:\?(.*))?$/);
    const scheme = m?.[1] ?? null;
    const hostname = m?.[2] || null;
    const path = m?.[3] || null;
    const queryParams: Record<string, string> = {};
    new URLSearchParams(m?.[4] ?? "").forEach((v, k) => {
      queryParams[k] = v;
    });
    return { scheme, hostname, path, queryParams };
  }
  return {
    createURL: (path: string) => `clubhq://${path}`,
    parse,
  };
});

const mockExchangeCodeForSession = jest.fn().mockResolvedValue({ error: null });
jest.mock("./supabase", () => ({
  supabase: { auth: { exchangeCodeForSession: (...args: unknown[]) => mockExchangeCodeForSession(...args) } },
}));

describe("createSessionFromUrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("exchanges the code from a link matching this app's own scheme and path", async () => {
    await createSessionFromUrl("clubhq://update-password?code=abc123");
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith("abc123");
  });

  test("ignores a link with a different scheme, even with a valid-looking code", async () => {
    await createSessionFromUrl("evilapp://update-password?code=abc123");
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  test("ignores a link with the right scheme but a different path", async () => {
    await createSessionFromUrl("clubhq://some-other-route?code=abc123");
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  test("does nothing for a trusted link with no code param", async () => {
    await createSessionFromUrl("clubhq://update-password");
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });

  test("a malformed URL is swallowed, not thrown", async () => {
    await expect(createSessionFromUrl("not a url")).resolves.toBeUndefined();
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });
});
