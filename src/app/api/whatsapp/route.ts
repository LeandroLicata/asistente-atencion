import { after, NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebase-admin";
import { rateLimited, replyToConversation } from "@/lib/server/replies";
import {
  extractMessages,
  isValidSignature,
  sendText,
  type ParsedMessage,
} from "@/lib/server/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHARS = 1000;
const UNSUPPORTED_REPLY =
  "Por ahora solo puedo leer mensajes de texto. ¿Me escribís tu consulta?";

/**
 * GET /api/whatsapp — verificación del webhook.
 *
 * Al configurar el webhook en Meta, Meta hace un GET con un token que
 * elegimos nosotros (WHATSAPP_VERIFY_TOKEN) y un "challenge". Si el token
 * coincide, hay que devolver el challenge tal cual.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({ error: "Verificación inválida" }, { status: 403 });
}

/**
 * POST /api/whatsapp — mensajes entrantes.
 *
 * Meta espera una respuesta rápida; si tarda, reintenta y llegan mensajes
 * duplicados. Por eso respondemos 200 enseguida y procesamos después con
 * after() (en Vercel la función sigue viva hasta que termina).
 */
export async function POST(req: NextRequest) {
  // La firma se calcula sobre el body crudo, así que hay que leerlo como
  // texto antes de parsearlo.
  const rawBody = await req.text();

  if (!process.env.WHATSAPP_APP_SECRET) {
    console.error("Falta WHATSAPP_APP_SECRET: no se puede verificar la firma");
    return NextResponse.json({ error: "Webhook sin configurar" }, { status: 500 });
  }
  if (!isValidSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const messages = extractMessages(payload as Parameters<typeof extractMessages>[0]);

  after(async () => {
    for (const msg of messages) {
      try {
        await handleMessage(msg);
      } catch (err) {
        console.error(`Falló el mensaje de WhatsApp ${msg.id}`, err);
      }
    }
  });

  return NextResponse.json({ ok: true });
}

async function handleMessage(msg: ParsedMessage) {
  const ownerUid = process.env.WHATSAPP_OWNER_UID;
  if (!ownerUid) throw new Error("Falta WHATSAPP_OWNER_UID");

  // Imágenes, audios, stickers, etc.: avisamos que solo leemos texto.
  const text = msg.type === "text" ? msg.text?.body?.trim().slice(0, MAX_CHARS) : "";
  if (!text) {
    await sendText(msg.from, UNSUPPORTED_REPLY);
    return;
  }

  if (rateLimited(`wa:${msg.from}`)) {
    console.warn(`Rate limit de WhatsApp para ${msg.from}`);
    return;
  }

  const db = adminDb();
  // Una conversación por teléfono, con id fijo: así la encontramos sin
  // buscar y los mensajes de un mismo cliente quedan juntos.
  const conversationRef = db.collection("conversations").doc(`wa_${msg.from}`);

  // El id del mensaje es el wamid de Meta y create() falla si ya existe:
  // si Meta reintenta el webhook, el duplicado se descarta acá.
  try {
    await conversationRef.collection("messages").doc(msg.id).create({
      role: "user",
      text,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if ((err as { code?: number }).code === 6) return; // ALREADY_EXISTS
    throw err;
  }

  const snap = await conversationRef.get();
  if (snap.exists) {
    await conversationRef.update({
      lastMessage: text,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    await conversationRef.set({
      ownerUid,
      channel: "whatsapp",
      phone: msg.from,
      title: msg.contactName ? `${msg.contactName} (+${msg.from})` : `+${msg.from}`,
      lastMessage: text,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // La misma lógica que el chat web; después mandamos la respuesta por
  // WhatsApp.
  const reply = await replyToConversation(conversationRef);
  if (reply) await sendText(msg.from, reply);
}
