"use client";

import { useState, type FormEvent } from "react";
import { authErrorMessage, useAuth } from "@/lib/auth-context";

// Si están configuradas, se muestra un botón para entrar con la cuenta demo
// (la crea `npm run seed:demo`). Son públicas a propósito: es una demo.
const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL;
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD;

export function LoginForm() {
  const { loginWithEmail, registerWithEmail, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<void>) {
    setError(null);
    setPending(true);
    try {
      await action();
    } catch (err) {
      console.error(err);
      setError(authErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    run(() =>
      mode === "login"
        ? loginWithEmail(email, password)
        : registerWithEmail(email, password),
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Contraseña</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand-600 py-2 font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {mode === "login" ? "Ingresar" : "Crear cuenta"}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />o
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => run(loginWithGoogle)}
        className="w-full rounded-lg border border-slate-300 py-2 font-medium transition hover:bg-slate-50 disabled:opacity-60"
      >
        Continuar con Google
      </button>

      {DEMO_EMAIL && DEMO_PASSWORD && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => loginWithEmail(DEMO_EMAIL, DEMO_PASSWORD))}
          className="mt-3 w-full rounded-lg bg-brand-50 py-2 font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
        >
          Probar con la cuenta demo
        </button>
      )}

      <p className="mt-4 text-center text-sm text-slate-500">
        {mode === "login" ? "¿No tenés cuenta?" : "¿Ya tenés cuenta?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
          className="font-medium text-brand-700 hover:underline"
        >
          {mode === "login" ? "Registrate" : "Ingresá"}
        </button>
      </p>
    </div>
  );
}
