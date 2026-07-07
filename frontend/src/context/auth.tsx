import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { api, clearToken, getToken, setToken } from "@/src/api/client";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { getFirebaseAuth } from "@/src/firebase/auth";

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
  role?: "user" | "advertiser" | "admin";
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





export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const bootstrappedRef = useRef(false);

 

  const bootstrap = useCallback(async () => {
    setLoading(true);

    // On web, look for session_id in the URL FIRST (before checking existing token) to avoid races.
    

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
  }, []);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    bootstrap();
  }, [bootstrap]);



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
  try {
    // Opens the Google account picker
    await GoogleSignin.hasPlayServices();

    const response = await GoogleSignin.signIn();

    // New versions return the ID token here
    const idToken = response.data?.idToken;

    if (!idToken) {
      throw new Error("Google did not return an ID token.");
    }

    // Sign in to Firebase
    const credential = GoogleAuthProvider.credential(idToken);
    const firebaseUser = await signInWithCredential(
      getFirebaseAuth(),
      credential
    );

    // Get Firebase ID token
    const firebaseIdToken = await firebaseUser.user.getIdToken();

    // Send it to Huni backend
   const res = await api.post<{ token: string; user: User }>(
      "/auth/firebase",
      {
        id_token: firebaseIdToken,
      }
    );
    // Save Huni JWT
    await setToken(res.token);
    setUser(res.user);
    console.log("TOKEN:", res.token);
    console.log("USER:", res.user);
    
    console.log("✅ Huni token:", res.token);
    console.log("✅ Huni user:", res.user);
  } catch (err) {
    console.error("Google Sign-In failed:", err);
    throw err;
  }
}, []);
  

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
