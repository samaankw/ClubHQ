/**
 * Phase 6c's "navigation/tenant test matrix," scoped to what's actually
 * achievable here: this repo has no device/E2E harness (no Detox, Maestro,
 * or Playwright-RN config anywhere), so a literal end-to-end walk across
 * every role x org_type combination on a real device isn't something a new
 * test file can responsibly claim to do. The role x org_type AUTHORIZATION
 * matrix -- who can read/write what, cross-club denial, the teamless-client
 * case -- is already covered for real against Postgres by
 * supabase/tests/test_teamless_players.py (27 assertions). What's covered
 * here instead, and wasn't covered anywhere before: that AuthProvider's
 * fetched org_type actually reaches useVocab() and getTabConfig() as one
 * real wired chain, for each org_type, not just as isolated units.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { AuthProvider, useAuth } from "./AuthProvider";
import { useVocab } from "./vocab";
import { getTabConfig } from "./tabConfig";

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));

jest.mock("expo-linking", () => ({
  getInitialURL: jest.fn().mockResolvedValue(null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  createURL: (path: string) => `clubhq://${path}`,
  parse: () => ({ scheme: null, hostname: null, path: null, queryParams: {} }),
}));

let mockSession: { user: { id: string } } | null = null;
let mockProfile: { id: string; role: string; club_id: string | null; full_name: string } | null = null;
let mockClub: { org_type: string } | null = null;

jest.mock("./supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: mockSession }, error: null })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    from: jest.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === "profiles") return { data: mockProfile, error: null };
            if (table === "clubs") return { data: mockClub, error: null };
            throw new Error(`Unexpected table ${table}`);
          },
        }),
      }),
    })),
  },
}));

// A minimal consumer proving the real chain: AuthProvider's fetched orgType
// reaches useVocab() and getTabConfig(), not just each piece tested alone.
function TenantAwareScreen() {
  const { profile, orgType, loading } = useAuth();
  const vocab = useVocab();
  if (loading) return <Text>Loading…</Text>;
  // Proves the real chain: AuthProvider's own fetched orgType, not a
  // hardcoded value, is what getTabConfig ends up deriving the roster tab's
  // title from.
  const tabs = getTabConfig(profile?.role, orgType);
  const rosterTab = tabs.find((t) => t.name === "players");
  return (
    <>
      <Text>role:{profile?.role ?? "none"}</Text>
      <Text>member:{vocab.member.singular}</Text>
      <Text>group:{vocab.group?.singular ?? "none"}</Text>
      <Text>rosterTabTitle:{rosterTab?.title}</Text>
    </>
  );
}

function setScenario(role: string, clubId: string | null, orgType: string | null) {
  mockSession = { user: { id: "user-1" } };
  mockProfile = { id: "user-1", role, club_id: clubId, full_name: "Test User" };
  mockClub = orgType ? { org_type: orgType } : null;
}

describe("AuthProvider -> useVocab -> getTabConfig, wired end to end", () => {
  afterEach(() => {
    mockSession = null;
    mockProfile = null;
    mockClub = null;
  });

  test("private trainer + teamless client: a director sees Client wording and no group concept", async () => {
    setScenario("director", "club-a", "private_trainer");
    await render(
      <AuthProvider>
        <TenantAwareScreen />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("role:director")).toBeTruthy());
    expect(screen.getByText("member:Client")).toBeTruthy();
    expect(screen.getByText("group:none")).toBeTruthy();
    expect(screen.getByText("rosterTabTitle:My Clients")).toBeTruthy();
  });

  test("academy: a coach sees Athlete/Training Group wording", async () => {
    setScenario("coach", "club-b", "academy");
    await render(
      <AuthProvider>
        <TenantAwareScreen />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("role:coach")).toBeTruthy());
    expect(screen.getByText("member:Athlete")).toBeTruthy();
    expect(screen.getByText("group:Training Group")).toBeTruthy();
    expect(screen.getByText("rosterTabTitle:Athletes")).toBeTruthy();
  });

  test("traditional club: a parent sees Player/Team wording", async () => {
    setScenario("parent", "club-c", "small_club");
    await render(
      <AuthProvider>
        <TenantAwareScreen />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("role:parent")).toBeTruthy());
    expect(screen.getByText("member:Player")).toBeTruthy();
    expect(screen.getByText("group:Team")).toBeTruthy();
    // A parent gets "My Player" instead of the staff roster title -- proves
    // getTabConfig's role-aware branch, not just its org-aware one.
    expect(screen.getByText("rosterTabTitle:My Player")).toBeTruthy();
  });

  test("a profile with no club yet (still mid-onboarding) falls back to small_club wording, not a crash", async () => {
    setScenario("director", null, null);
    await render(
      <AuthProvider>
        <TenantAwareScreen />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("role:director")).toBeTruthy());
    expect(screen.getByText("member:Player")).toBeTruthy();
  });

  test("no signed-in session at all: loading resolves to a signed-out state, not stuck loading forever", async () => {
    mockSession = null;
    mockProfile = null;
    mockClub = null;
    await render(
      <AuthProvider>
        <TenantAwareScreen />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("role:none")).toBeTruthy());
  });
});
