"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MAX_MESSAGE_CHARS,
  deleteConversation,
  requestReply,
  sendUserMessage,
  watchMessages,
  type Conversation,
  type Message,
} from "@/lib/chat";

type Props = {
  conversation: Conversation;
  onBack: () => void;
  onDeleted: () => void;
};

export function ChatWindow({ conversation, onBack, onDeleted }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // El estado se reinicia al cambiar de conversación porque el panel monta
  // este componente con key={conversation.id}.
  useEffect(() => {
    let firstSnapshot = true;
    return watchMessages(
      conversation.id,
      (items) => {
        setMessages(items);
        // Si al abrir la conversación el último mensaje quedó sin respuesta
        // (por ejemplo, se cerró la pestaña a mitad), la pedimos de nuevo.
        // La API es idempotente: si ya hay respuesta, no hace nada.
        if (firstSnapshot && items.at(-1)?.role === "user") {
          requestReply(conversation.id).catch((err) => {
            console.error(err);
            setReplyError(
              err instanceof Error ? err.message : "No se pudo obtener la respuesta.",
            );
          });
        }
        firstSnapshot = false;
      },
      (err) => {
        console.error(err);
        setError("No se pudieron cargar los mensajes.");
      },
    );
  }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Si el último mensaje es del usuario, el servidor todavía está generando
  // la respuesta: mostramos el indicador de "escribiendo".
  const lastIsUser = messages.at(-1)?.role === "user";
  const waitingReply = lastIsUser && !replyError;

  async function askReply() {
    setReplyError(null);
    try {
      await requestReply(conversation.id);
    } catch (err) {
      console.error(err);
      setReplyError(err instanceof Error ? err.message : "No se pudo obtener la respuesta.");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || lastIsUser) return;
    setText("");
    setError(null);
    try {
      await sendUserMessage(conversation.id, value, messages.length === 0);
    } catch (err) {
      console.error(err);
      setError("No se pudo enviar el mensaje.");
      setText(value);
      return;
    }
    await askReply();
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteConversation(conversation.id);
      onDeleted();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "No se pudo borrar la conversación.");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-slate-50">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          onClick={onBack}
          className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 md:hidden"
          aria-label="Volver"
        >
          ←
        </button>
        <h2 className="min-w-0 flex-1 truncate font-medium">{conversation.title}</h2>

        {/* Confirmación en dos pasos para no borrar por error. */}
        {confirmingDelete ? (
          <div className="flex shrink-0 items-center gap-2 text-sm">
            <span className="hidden text-slate-600 sm:inline">¿Borrar la conversación?</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? "Borrando…" : "Sí, borrar"}
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-red-50 hover:text-red-700"
          >
            Borrar
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="mt-10 text-center text-sm text-slate-500">
            Escribí una consulta como si fueras un cliente.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <p
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm shadow-sm ${
                m.role === "user"
                  ? "rounded-br-sm bg-brand-600 text-white"
                  : "rounded-bl-sm bg-white text-slate-800"
              }`}
            >
              {m.text}
            </p>
          </div>
        ))}
        {waitingReply && (
          <div className="flex justify-start">
            <p className="rounded-2xl rounded-bl-sm bg-white px-4 py-2 text-sm text-slate-400 shadow-sm">
              Escribiendo…
            </p>
          </div>
        )}
        {lastIsUser && replyError && (
          <div className="flex items-center gap-3 text-sm text-red-700">
            <span>{replyError}</span>
            <button
              onClick={askReply}
              className="rounded-full border border-red-300 px-3 py-1 hover:bg-red-50"
            >
              Reintentar
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-slate-200 bg-white p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_MESSAGE_CHARS}
          placeholder={waitingReply ? "Esperando respuesta…" : "Escribí un mensaje"}
          className="min-w-0 flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={!text.trim() || lastIsUser}
          className="rounded-full bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
