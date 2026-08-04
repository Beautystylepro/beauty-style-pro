import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import safeStorage from "@/lib/safeStorage";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: any | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string, userType?: string, gender?: string, colorTheme?: string, extraMeta?: Record<string, any>) => Promise<{ error: any; needsEmailVerification: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const [profileRes, privateRes] = await Promise.all([
      supabase.rpc("get_my_profile"),
      supabase.from("profiles_private").select("*").eq("user_id", userId).maybeSingle(),
    ]);
    const ownProfile = Array.isArray(profileRes.data) ? profileRes.data[0] : profileRes.data;
    const merged = {
      ...ownProfile,
      ...(privateRes.data ? {
        iban: privateRes.data.iban,
        bank_holder_name: privateRes.data.bank_holder_name,
        birth_date: privateRes.data.birth_date,
        document_urls: privateRes.data.document_urls,
        verification_notes: privateRes.data.verification_notes,
      } : {}),
    };
    setProfile(merged);

    // Apply color theme from profile on login
    const ct = merged?.color_theme;
    if (ct === "male" || ct === "female") {
      safeStorage.setItem("style-color-theme", ct);
      // Dynamically import to avoid circular deps
      import("@/hooks/useColorTheme").then(mod => {
        // trigger CSS variable update by dispatching a custom event
        const r = document.documentElement;
        if (ct === "male") {
          r.style.setProperty("--primary", "45 88% 45%");
          r.style.setProperty("--ring", "45 88% 45%");
          r.style.setProperty("--gradient-primary", "linear-gradient(135deg, hsl(38 80% 38%), hsl(48 96% 58%), hsl(43 90% 46%))");
          r.style.setProperty("--shadow-glow", "0 0 40px hsl(45 88% 45% / 0.3)");
        } else {
          r.style.setProperty("--primary", "271 78% 42%");
          r.style.setProperty("--ring", "271 78% 42%");
          r.style.setProperty("--gradient-primary", "linear-gradient(135deg, hsl(271 82% 36%), hsl(285 75% 52%), hsl(258 78% 44%))");
          r.style.setProperty("--shadow-glow", "0 0 40px hsl(271 78% 42% / 0.3)");
        }
      }).catch(() => {});
    }
  };

  useEffect(() => {
    let isMounted = true;
    let initialSessionResolved = false;

    const clearAuthState = () => {
      if (!isMounted) return;
      setUser(null);
      setSession(null);
      setProfile(null);
    };

    const applyAuthState = (nextSession: Session | null) => {
      if (!isMounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        void fetchProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "TOKEN_REFRESHED" && !nextSession) {
        console.warn("Token refresh failed, signing out");
        clearAuthState();
        if (initialSessionResolved) setLoading(false);
        return;
      }

      if (event === "SIGNED_OUT") {
        clearAuthState();
        if (initialSessionResolved) setLoading(false);
        return;
      }

      applyAuthState(nextSession);

      if (initialSessionResolved) {
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: restoredSession }, error }) => {
      if (!isMounted) return;

      if (error) {
        console.warn("Session recovery failed:", error.message);
        supabase.auth.signOut().catch(() => {});
        clearAuthState();
        initialSessionResolved = true;
        setLoading(false);
        return;
      }

      applyAuthState(restoredSession);
      initialSessionResolved = true;
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, displayName: string, userType: string = "client", gender?: string, colorTheme?: string, extraMeta?: Record<string, any>) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName, user_type: userType, gender: gender || null, color_theme: colorTheme || "female", ...extraMeta },
        emailRedirectTo: (() => {
          const sp = new URLSearchParams(window.location.search).get("next");
          const safe = sp && /^\/(?!\/)/.test(sp) ? sp : "/";
          return window.location.origin + safe;
        })(),
      },
    });
    return { error, needsEmailVerification: !data.session };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signUp, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
