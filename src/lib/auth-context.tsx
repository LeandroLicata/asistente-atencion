"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Firebase persiste la sesión y renueva el ID token solo; acá solo
    // escuchamos los cambios.
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    loginWithEmail: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    registerWithEmail: async (email, password) => {
      await createUserWithEmailAndPassword(auth, email, password);
    },
    loginWithGoogle: async () => {
      await signInWithPopup(auth, new GoogleAuthProvider());
    },
    logout: () => signOut(auth),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth tiene que usarse dentro de <AuthProvider>");
  return ctx;
}

// Traduce los códigos de error de Firebase Auth a mensajes para el usuario.
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email o contraseña incorrectos.";
    case "auth/email-already-in-use":
      return "Ya existe una cuenta con ese email.";
    case "auth/weak-password":
      return "La contraseña tiene que tener al menos 6 caracteres.";
    case "auth/invalid-email":
      return "El email no es válido.";
    case "auth/popup-closed-by-user":
      return "Se cerró la ventana de Google antes de terminar.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Probá de nuevo en unos minutos.";
    default:
      return "No se pudo iniciar sesión. Probá de nuevo.";
  }
}
