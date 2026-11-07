"use client";

import type { Conversation } from "@/lib/chat";

type Props = {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
};

export function ConversationList({ conversations, activeId, onSelect, onNew }: Props) {
  return (
    <>
      <div className="border-b border-slate-200 p-3">
        <button
          onClick={onNew}
          className="w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Nueva conversación
        </button>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {conversations.length === 0 && (
          <li className="p-6 text-center text-sm text-slate-500">
            Todavía no hay conversaciones.
          </li>
        )}
        {conversations.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className={`flex w-full flex-col gap-0.5 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${
                c.id === activeId ? "bg-brand-50" : ""
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{c.title}</span>
                <span
                  className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                    c.channel === "whatsapp"
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {c.channel}
                </span>
              </span>
              <span className="truncate text-xs text-slate-500">
                {c.lastMessage || "Sin mensajes"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
