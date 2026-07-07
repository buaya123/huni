import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { api, clearToken, getToken, setToken } from "@/src/api/client";

export type User = {
  id: string;
  alias: string;
  helpful_score: number;
  post_count: number;
  comment_count: number;
  bio: string;
  joined_at: string;
  first_name?: string;
  last_name?: string;
  birthdate?: string;
  picture?: string;
  auth_provider?: "password" | "google";
  role?: "user" | "advertiser" | "partner" | "admin";
  points?: number;
  business_name?: string;
  business_type?: string;
};

export type SignUpInput = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  birthdate: string; // YYYY-MM-DD
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  regenerateAlias: () => Promise<User>;
  updateBio: (bio: string) => Promise<User>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

function parseSessionIdFromUrl(url: string): string | null {
  try {
    const hash = url.split("#")[1];
    if (hash) {
      const params = new URLSearchParams(hash);
      const s = params.get("session_id");
      if (s) return s;
    }
    const query = url.split("?")[1];
    if (query) {
      const params = new URLSearchParams(query.split("#")[0]);
      const s = params.get("session_id");
      if (s) return s;
    }
  } catch {
    // ignore
  }
  return null;
}

async function exchangeSessionId(sessionId: string): Promise<{ token: string; user: User }> {
  return api.post<{ token: string; user: User }>("/auth/google/session", { session_id: sessionId });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const bootstrappedRef = useRef(false);

  const consumeSessionId = useCallback(async (sessionId: string) => {
    try {
      const res = await exchangeSessionId(sessionId);
      await setToken(res.token);
      setUser(res.user);
    } catch {
      // ignore — bad session
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);

    // On web, look for session_id in the URL FIRST (before checking existing token) to avoid races.
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const sid = parseSessionIdFromUrl(window.location.href);
      if (sid) {
        try {
          window.history.replaceState(null, "", window.location.pathname);
        } catch { /* ignore */ }
        await consumeSessionId(sid);
        setLoading(false);
        return;
      }
    }

    const token = await getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
    } catch {
      await clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [consumeSessionId]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    bootstrap();
  }, [bootstrap]);

  // Mobile cold-start / deep-link listener
  useEffect(() => {
    if (Platform.OS === "web") return;
    let sub: { remove: () => void } | undefined;
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const sid = parseSessionIdFromUrl(url);
      if (sid) await consumeSessionId(sid);
    };
    Linking.getInitialURL().then(handleUrl);
    sub = Linking.addEventListener("url", (event) => handleUrl(event.url));
    return () => sub?.remove();
  }, [consumeSessionId]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>("/auth/login", { email, password });
    await setToken(res.token);
    setUser(res.user);
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    const res = await api.post<{ token: string; user: User }>("/auth/register", input);
    await setToken(res.token);
    setUser(res.user);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const redirectUrl =
      Platform.OS === "web"
        ? typeof window !== "undefined"
          ? `${window.location.origin}/`
          : "/"
        : Linking.createURL("auth");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.location.href = authUrl;
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type === "success" && result.url) {
      const sid = parseSessionIdFromUrl(result.url);
      if (sid) await consumeSessionId(sid);
    }
  }, [consumeSessionId]);

  const signOut = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    await clearToken();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
    } catch {
      // ignore
    }
  }, []);

  const regenerateAlias = useCallback(async () => {
    const u = await api.post<User>("/auth/regenerate-alias");
    setUser(u);
    return u;
  }, []);

  const updateBio = useCallback(async (bio: string) => {
    const u = await api.patch<User>("/auth/bio", { bio });
    setUser(u);
    return u;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        refresh,
        regenerateAlias,
        updateBio,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
