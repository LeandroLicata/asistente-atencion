import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Integración con WhatsApp Cloud API (Meta).
// Docs: https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v26.0";

// --- Tipos del webhook (solo lo que usamos) -------------------------------

export type IncomingMessage = {
  id: string; // wamid: id único del mensaje, sirve para deduplicar
  from: string; // teléfono del cliente, sin "+" (ej. 5492611234567)
  type: string; // "text", "image", "audio", ...
  text?: { body: string };
};

type WebhookPayload = {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: IncomingMessage[];
      };
    }[];
  }[];
};

export type ParsedMessage = IncomingMessage & { contactName?: string };

/**
 * Saca los mensajes entrantes del payload del webhook. Ignora el resto de
 * los eventos (estados de entrega, lecturas, etc.).
 */
export function extractMessages(payload: WebhookPayload): ParsedMessage[] {
  if (payload.object !== "whatsapp_business_account") return [];

  const out: ParsedMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      for (const msg of value?.messages ?? []) {
        const contact = value?.contacts?.find((c) => c.wa_id === msg.from);
        out.push({ ...msg, contactName: contact?.profile?.name });
      }
    }
  }
  return out;
}

// --- Seguridad ------------------------------------------------------------

/**
 * Meta firma cada POST con el App Secret (HMAC-SHA256 del body crudo) y
 * manda la firma en el header X-Hub-Signature-256. Si no coincide, el
 * pedido no viene de Meta y se descarta.
 */
export function isValidSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const received = Buffer.from(header.slice("sha256=".length), "hex");

  // timingSafeEqual exige el mismo largo y evita ataques de tiempo.
  return received.length === expected.length && timingSafeEqual(received, expected);
}

// --- Envío ----------------------------------------------------------------

/**
 * En Argentina, WhatsApp manda los números con el 9 de celulares
 * (549 + área + número), pero la lista de destinatarios de prueba de Meta
 * los guarda sin el 9. Si se responde al número tal como llega, Meta
 * devuelve el error 131030 ("recipient not in allowed list"). Le sacamos el
 * 9 para que coincida.
 */
export function toRecipient(from: string): string {
  return /^549\d{10}$/.test(from) ? `54${from.slice(3)}` : from;
}

/** Manda un mensaje de texto por WhatsApp. */
export async function sendText(to: string, body: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error("Faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID");
  }

  const res = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toRecipient(to),
        type: "text",
        text: { body, preview_url: false },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!res.ok) {
    // El error de Meta trae código y mensaje útiles para diagnosticar
    // (token vencido, número fuera de la lista de prueba, etc.).
    const detail = await res.text().catch(() => "");
    throw new Error(`WhatsApp respondió ${res.status}: ${detail}`);
  }
}
