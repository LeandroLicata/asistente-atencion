import "server-only";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { FALLBACK_REPLY, generateReply, type Turn } from "./assistant";

const HISTORY_LIMIT = 20;

/**
 * Responde el último mensaje de una conversación: lee el historial, le pide
 * la respuesta a Gemini y la guarda como mensaje del asistente.
 *
 * Devuelve el texto de la respuesta, o null si no había nada que responder
 * (el último mensaje ya era del asistente). Eso la hace idempotente: si se
 * llama dos veces seguidas, la segunda no duplica la respuesta.
 *
 * La usan el chat web (/api/reply) y el webhook de WhatsApp.
 */
export async function replyToConversation(
  conversationRef: DocumentReference,
): Promise<string | null> {
  const messagesRef = conversationRef.collection("messages");

  // Historial, del más viejo al más nuevo.
  const snap = await messagesRef.orderBy("createdAt", "desc").limit(HISTORY_LIMIT).get();
  const history: Turn[] = snap.docs
    .reverse()
    .map((d) => d.data())
    .filter((m) => typeof m.text === "string" && m.text.length > 0)
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", text: m.text }));

  if (history.at(-1)?.role !== "user") return null;

  // Si Gemini falla, se guarda un mensaje de respaldo para que el cliente no
  // quede esperando para siempre.
  let reply = FALLBACK_REPLY;
  try {
    reply = await generateReply(history);
  } catch (err) {
    console.error("Falló la llamada a Gemini", err);
  }

  await messagesRef.add({
    role: "assistant",
    text: reply,
    createdAt: FieldValue.serverTimestamp(),
  });
  await conversationRef.update({
    lastMessage: reply,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return reply;
}

// Rate limit simple por clave (uid o teléfono). Vive en memoria, así que en
// serverless cada instancia lleva su cuenta; alcanza para frenar abusos de
// una demo.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const hits = new Map<string, number[]>();

export function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > MAX_REQUESTS;
}
