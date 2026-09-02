import { router } from "expo-router";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { supabase } from "./supabase";
import { Profile, OrgType } from "@/types/db";

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  orgType: OrgType | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  orgType: null,
  loading: true,
  refreshProfile: async () => {},
});

// Custom URL schemes (this app registers "clubhq") aren't guaranteed
// exclusive to one app on iOS/Android, so a deep link's mere arrival proves
// nothing about who sent it. Before acting on any query param, require the
// link to match the exact scheme/host/path this app's own auth flow
// generates (see resetPasswordForEmail's redirectTo) — anything else is
// ignored rather than trusted.
function isTrustedAuthCallback(url: string): boolean {
  try {
    const expected = Linking.parse(Linking.createURL("update-password"));
    const incoming = Linking.parse(url);
    return incoming.scheme === expected.scheme && incoming.hostname === expected.hostname && incoming.path === expected.path;
  } catch {
    return false;
  }
}

export async function createSessionFromUrl(url: string) {
  try {
    if (!isTrustedAuthCallback(url)) return;

    const { code } = Linking.parse(url).queryParams ?? {};
    if (typeof code === "string") {
      await supabase.auth.exchangeCodeForSession(code);
    }
  } catch (error) {
    console.error("Failed to create auth session from deep link:", error);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orgType, setOrgType] = useState<OrgType | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOrgType = async (clubId: string | null | undefined) => {
    if (!clubId) {
      setOrgType(null);
      return;
    }
    // Deliberately a separate query, not embedded onto the profiles select
    // below (`select("*, clubs(org_type)")`) -- clubs has two FKs to/from
    // profiles (profiles.club_id and clubs.owner_id), which PostgREST can't
    // disambiguate without a !fkey hint, and this app has already hit that
    // exact "more than one relationship was found" error once before.
    const { data, error } = await supabase.from("clubs").select("org_type").eq("id", clubId).maybeSingle();
    if (error) {
      console.error("Failed to load club org_type:", error.message);
      setOrgType(null);
      return;
    }
    setOrgType((data?.org_type as OrgType | undefined) ?? null);
  };

  const loadProfile = async (userId: string) => {
    let { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

    // A stale/skewed access token occasionally fails the DB's JWT check
    // ("JWT issued at future", "JWT expired") even though the session is
    // otherwise valid — one refreshSession() mints a token with a current
    // iat and the retry clears it without the user having to sign out.
    if (error && /jwt/i.test(error.message)) {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError) {
        ({ data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle());
      }
    }

    if (error) {
      console.error("Failed to load ClubHQ profile:", error.message);
      setProfile(null);
      setOrgType(null);
      return;
    }
    setProfile(data as Profile | null);
    await loadOrgType((data as Profile | null)?.club_id);
  };

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) await createSessionFromUrl(initialUrl);

        const { data, error } = await supabase.auth.getSession();
        if (error) console.error("Failed to restore session:", error.message);
        if (!mounted) return;
        setSession(data.session);
        if (data.session) await loadProfile(data.session.user.id);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    bootstrap();

    const linkSub = Linking.addEventListener("url", ({ url }) => {
      void createSessionFromUrl(url);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
  if (!mounted) return;

  setSession(newSession);

  if (event === "PASSWORD_RECOVERY") {
    setLoading(false);
    router.replace("/update-password");
    return;
  }

  if (newSession) {
    await loadProfile(newSession.user.id);
  } else {
    setProfile(null);
    setOrgType(null);
  }

  setLoading(false);
});

    return () => {
      mounted = false;
      linkSub.remove();
      listener.subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (session) await loadProfile(session.user.id);
  };

  return <AuthContext.Provider value={{ session, profile, orgType, loading, refreshProfile }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
