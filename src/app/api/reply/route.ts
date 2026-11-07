import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebase-admin";
import { getUidFromRequest } from "@/lib/server/auth";
import { FALLBACK_REPLY, generateReply, type Turn } from "@/lib/server/assistant";

// El Admin SDK necesita el runtime de Node, no Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 20;

// Rate limit simple por usuario. Vive en memoria, así que en serverless cada
// instancia lleva su cuenta; alcanza para frenar abusos de una demo.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const hits = new Map<string, number[]>();

function rateLimited(uid: string): boolean {
  const now = Date.now();
  const recent = (hits.get(uid) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(uid, recent);
  return recent.length > MAX_REQUESTS;
}

/**
 * POST /api/reply  { conversationId }
 * Header: Authorization: Bearer <Firebase ID token>
 *
 * Hace lo mismo que la Cloud Function de functions/: lee el historial, le
 * pide la respuesta a Gemini y la guarda en Firestore. El panel la recibe por
 * onSnapshot, igual que si la hubiera escrito la función.
 */
export async function POST(req: NextRequest) {
  // 1. Autenticación: el ID token lo emite Firebase Auth en el cliente.
  const uid = await getUidFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (rateLimited(uid)) {
    return NextResponse.json(
      { error: "Demasiados mensajes seguidos. Esperá un minuto." },
      { status: 429 },
    );
  }

  // 2. Validación del body.
  const body = (await req.json().catch(() => null)) as { conversationId?: unknown } | null;
  const conversationId = body?.conversationId;
  if (typeof conversationId !== "string" || !conversationId) {
    return NextResponse.json({ error: "Falta conversationId" }, { status: 400 });
  }

  // 3. Autorización: la conversación tiene que ser del usuario.
  const conversationRef = adminDb().collection("conversations").doc(conversationId);
  const conversation = await conversationRef.get();
  if (!conversation.exists || conversation.get("ownerUid") !== uid) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  // 4. Historial, del más viejo al más nuevo.
  const messagesRef = conversationRef.collection("messages");
  const snap = await messagesRef.orderBy("createdAt", "desc").limit(HISTORY_LIMIT).get();
  const history: Turn[] = snap.docs
    .reverse()
    .map((d) => d.data())
    .filter((m) => typeof m.text === "string" && m.text.length > 0)
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", text: m.text }));

  // Si el último mensaje ya es del asistente, no hay nada que responder.
  // Evita respuestas duplicadas si el cliente reintenta.
  if (history.at(-1)?.role !== "user") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // 5. Respuesta de Gemini. Si falla, se guarda un mensaje de respaldo para
  // que el cliente no quede esperando para siempre.
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

  return NextResponse.json({ ok: true });
}
