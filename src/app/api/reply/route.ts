import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/server/firebase-admin";
import { getUidFromRequest } from "@/lib/server/auth";
import { rateLimited, replyToConversation } from "@/lib/server/replies";

// El Admin SDK necesita el runtime de Node, no Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/reply  { conversationId }
 * Header: Authorization: Bearer <Firebase ID token>
 *
 * Responde el último mensaje de una conversación del chat web. Hace lo mismo
 * que la Cloud Function de functions/: lee el historial, le pide la respuesta
 * a Gemini y la guarda en Firestore. El panel la recibe por onSnapshot.
 */
export async function POST(req: NextRequest) {
  // 1. Autenticación: el ID token lo emite Firebase Auth en el cliente.
  const uid = await getUidFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (rateLimited(`uid:${uid}`)) {
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

  // Las de WhatsApp las responde el webhook y la respuesta se manda por
  // WhatsApp; generarla desde acá la guardaría sin que le llegue al cliente.
  if (conversation.get("channel") === "whatsapp") {
    return NextResponse.json(
      { error: "Las conversaciones de WhatsApp se responden desde WhatsApp." },
      { status: 409 },
    );
  }

  // 4. Generar y guardar la respuesta (no hace nada si ya estaba respondida).
  const reply = await replyToConversation(conversationRef);
  return NextResponse.json({ ok: true, skipped: reply === null });
}
