"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { LoginForm } from "@/components/LoginForm";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/panel");
  }, [user, loading, router]);

  if (loading || user) {
    return (
      <main className="grid min-h-screen place-items-center text-slate-500">
        Cargando…
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-2xl text-white">
            💬
          </div>
          <h1 className="text-2xl font-semibold">Asistente de atención</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ingresá al panel para probar el asistente.
          </p>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-xs text-slate-400">
          <Link href="/privacidad" className="hover:text-slate-600 hover:underline">
            Política de privacidad
          </Link>
        </p>
      </div>
    </main>
  );
}
