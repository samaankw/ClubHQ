import { renderHook, waitFor, act } from "@testing-library/react-native";
import { useEvaluationPulse } from "./hooks";

// useFocusEffect has no real navigation-focus system to fire in a unit test.
// It's wired as a mount-time effect (matching how every other file in this
// repo mocks it, e.g. club-management.test.tsx) so the initial fetch still
// happens, but the callback is also captured so a test can invoke it a
// second time on the *same* still-mounted instance -- simulating a screen
// regaining focus, which a second renderHook() call cannot do, since that's
// just a second, unrelated mount.
let latestFocusCallback: (() => void | (() => void)) | null = null;
jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    latestFocusCallback = cb;
    const ReactActual = jest.requireActual("react");
    ReactActual.useEffect(() => {
      const cleanup = cb();
      return typeof cleanup === "function" ? cleanup : undefined;
    }, [cb]);
  },
}));

let mockProfile: { club_id: string | null; role: string | null } | null = null;
jest.mock("./AuthProvider", () => ({
  useAuth: () => ({ profile: mockProfile }),
}));

const mockFromSpy = jest.fn();
jest.mock("./supabase", () => ({
  supabase: { from: (...args: unknown[]) => mockFromSpy(...args) },
}));

function mockChain(result: { data: unknown; error: null }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.eq = self;
  chain.is = self;
  chain.in = self;
  chain.gte = self;
  chain.then = (resolve: (r: typeof result) => void) => resolve(result);
  return chain;
}

describe("useEvaluationPulse", () => {
  beforeEach(() => {
    mockFromSpy.mockReset();
  });

  // The bug this guards against: the hook used to run its two Supabase
  // queries on every render regardless of role, wasted for every parent,
  // player, and coach, since Pilot Metrics is director-only data.
  it("does not query at all for a non-director role", async () => {
    mockProfile = { club_id: "club-1", role: "coach" };
    const { result } = await renderHook(() => useEvaluationPulse());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFromSpy).not.toHaveBeenCalled();
    expect(result.current.evaluatedLast7Days).toBe(0);
    expect(result.current.totalPlayers).toBe(0);
  });

  it("does not query before the profile has loaded", async () => {
    mockProfile = null;
    const { result } = await renderHook(() => useEvaluationPulse());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFromSpy).not.toHaveBeenCalled();
  });

  it("queries and returns real counts for a director", async () => {
    mockProfile = { club_id: "club-1", role: "director" };
    mockFromSpy.mockImplementation((table: string) => {
      if (table === "players") return mockChain({ data: [{ id: "p1" }, { id: "p2" }], error: null });
      if (table === "evaluations") return mockChain({ data: [{ player_id: "p1" }], error: null });
      throw new Error(`unexpected table ${table}`);
    });

    const { result } = await renderHook(() => useEvaluationPulse());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.totalPlayers).toBe(2);
    expect(result.current.evaluatedLast7Days).toBe(1);
  });

  // Pull-to-refresh aside, a director who evaluates players elsewhere and
  // returns to this still-mounted tab needs the count to update on its own.
  // Simulated here by invoking the captured focus callback a second time on
  // the same hook instance, rather than mounting a fresh one.
  it("refetches when the screen regains focus, without remounting", async () => {
    mockProfile = { club_id: "club-1", role: "director" };
    mockFromSpy.mockImplementation((table: string) => {
      if (table === "players") return mockChain({ data: [{ id: "p1" }], error: null });
      if (table === "evaluations") return mockChain({ data: [], error: null });
      throw new Error(`unexpected table ${table}`);
    });

    const { result } = await renderHook(() => useEvaluationPulse());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.totalPlayers).toBe(1);

    // The roster grew while the director was on another screen.
    mockFromSpy.mockImplementation((table: string) => {
      if (table === "players") return mockChain({ data: [{ id: "p1" }, { id: "p2" }], error: null });
      if (table === "evaluations") return mockChain({ data: [], error: null });
      throw new Error(`unexpected table ${table}`);
    });

    await act(async () => {
      latestFocusCallback?.();
    });

    await waitFor(() => expect(result.current.totalPlayers).toBe(2));
  });
});
