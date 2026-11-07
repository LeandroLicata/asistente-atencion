"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  createConversation,
  watchConversations,
  type Conversation,
} from "@/lib/chat";
import { ConversationList } from "@/components/ConversationList";
import { ChatWindow } from "@/components/ChatWindow";

export default function PanelPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ruta protegida: sin sesión vuelve al login.
  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    return watchConversations(user.uid, setConversations, (err) => {
      console.error(err);
      setError("No se pudieron cargar las conversaciones.");
    });
  }, [user]);

  async function handleNew() {
    if (!user) return;
    const id = await createConversation(user.uid);
    setActiveId(id);
  }

  if (loading || !user) {
    return (
      <main className="grid min-h-screen place-items-center text-slate-500">
        Cargando…
      </main>
    );
  }

  const active = conversations.find((c) => c.id === activeId) ?? null;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-white">
            💬
          </span>
          <span className="font-semibold">Asistente de atención</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-slate-500 sm:inline">{user.email}</span>
          <button
            onClick={logout}
            className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
          >
            Salir
          </button>
        </div>
      </header>

      {error && (
        <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex min-h-0 flex-1">
        {/* En mobile se muestra la lista o el chat, no los dos. */}
        <aside
          className={`${active ? "hidden md:flex" : "flex"} w-full flex-col border-r border-slate-200 bg-white md:w-80`}
        >
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            onSelect={setActiveId}
            onNew={handleNew}
          />
        </aside>

        <section className={`${active ? "flex" : "hidden md:flex"} min-w-0 flex-1`}>
          {active ? (
            <ChatWindow
              conversation={active}
              onBack={() => setActiveId(null)}
              onDeleted={() => setActiveId(null)}
            />
          ) : (
            <div className="grid flex-1 place-items-center p-6 text-center text-slate-500">
              <div>
                <p className="font-medium text-slate-700">
                  Elegí una conversación
                </p>
                <p className="mt-1 text-sm">
                  o creá una nueva para probar el asistente.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
