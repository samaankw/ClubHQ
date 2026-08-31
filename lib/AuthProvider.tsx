import { router } from "expo-router";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { supabase } from "./supabase";
import { Profile } from "@/types/db";
import { OrgConfig, resolveOrgConfig, cacheOrgType, getCachedOrgType } from "./orgConfig";

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  orgConfig: OrgConfig;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  orgConfig: resolveOrgConfig(null),
  loading: true,
  refreshProfile: async () => {},
});

async function createSessionFromUrl(url: string) {
  try {
    const normalized = url.includes("#") ? url.replace("#", "?") : url;
    const parsed = new URL(normalized);
    const accessToken = parsed.searchParams.get("access_token");
    const refreshToken = parsed.searchParams.get("refresh_token");
    const code = parsed.searchParams.get("code");

    if (accessToken && refreshToken) {
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    } else if (code) {
      await supabase.auth.exchangeCodeForSession(code);
    }
  } catch (error) {
    console.error("Failed to create auth session from deep link:", error);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orgConfig, setOrgConfig] = useState<OrgConfig>(resolveOrgConfig(null));
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    // Read whatever org type was cached from the last successful load
    // first, so labels/features resolve immediately even with no network
    // (a coach on a field with no signal) rather than sitting on the
    // small_club default until the request below completes or fails.
    const cached = await getCachedOrgType(userId);
    if (cached) setOrgConfig(resolveOrgConfig(cached));

    let { data, error } = await supabase
      .from("profiles")
      .select("*, clubs!profiles_club_fk(org_type)")
      .eq("id", userId)
      .maybeSingle();

    // A stale/skewed access token occasionally fails the DB's JWT check
    // ("JWT issued at future", "JWT expired") even though the session is
    // otherwise valid — one refreshSession() mints a token with a current
    // iat and the retry clears it without the user having to sign out.
    if (error && /jwt/i.test(error.message)) {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError) {
        ({ data, error } = await supabase
          .from("profiles")
          .select("*, clubs!profiles_club_fk(org_type)")
          .eq("id", userId)
          .maybeSingle());
      }
    }

    if (error) {
      console.error("Failed to load ClubHQ profile:", error.message);
      setProfile(null);
      return;
    }

    const row = data as (Profile & { clubs?: { org_type: string } | { org_type: string }[] | null }) | null;
    const clubsRel = row?.clubs;
    const orgType = Array.isArray(clubsRel) ? clubsRel[0]?.org_type : clubsRel?.org_type;

    setProfile(row as Profile | null);
    setOrgConfig(resolveOrgConfig(orgType));
    if (orgType) void cacheOrgType(userId, resolveOrgConfig(orgType).orgType);
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

  return <AuthContext.Provider value={{ session, profile, orgConfig, loading, refreshProfile }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
