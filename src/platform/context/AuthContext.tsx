import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  onAuthStateChanged,
  signInWithGoogle,
  signUpWithEmail,
  signInWithEmail,
  linkAnonymousToGoogle,
  linkAnonymousToEmail,
  signOutCreator,
} from "../firebase/authService";

interface AuthContextValue {
  user: User | null;
  isCreator: boolean;
  isAdmin: boolean;
  loading: boolean;
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  linkGoogle: () => Promise<void>;
  linkEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const isCreator = user !== null && !user.isAnonymous;
  const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const isAdmin = isCreator && user?.email?.toLowerCase() === adminEmail;

  const value: AuthContextValue = {
    user,
    isCreator,
    isAdmin,
    loading,
    signInGoogle: async () => { await signInWithGoogle(); },
    signInEmail: async (email, password) => { await signInWithEmail(email, password); },
    signUpEmail: async (email, password) => { await signUpWithEmail(email, password); },
    linkGoogle: async () => { await linkAnonymousToGoogle(); },
    linkEmail: async (email, password) => { await linkAnonymousToEmail(email, password); },
    signOut: async () => { await signOutCreator(); },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
