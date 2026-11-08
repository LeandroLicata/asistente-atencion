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
 * Formatos posibles para responderle a un número.
 *
 * En Argentina, WhatsApp avisa los mensajes con el número en formato
 * internacional (549 + área + número), pero la lista de destinatarios de
 * prueba de Meta puede tenerlo guardado de otra forma: sin el 9, o con el 15
 * de los celulares después del código de área (54 + área + 15 + número). Si
 * se responde a un formato que no está en la lista, Meta devuelve el error
 * 131030. Como el código de área tiene entre 2 y 4 dígitos, probamos las
 * variantes en orden hasta que una funciona.
 */
export function recipientCandidates(from: string): string[] {
  const match = /^549(\d{10})$/.exec(from);
  if (!match) return [from];

  const local = match[1]; // área + número, 10 dígitos
  const candidates = [from, `54${local}`];
  for (const areaLength of [3, 2, 4]) {
    const area = local.slice(0, areaLength);
    const number = local.slice(areaLength);
    candidates.push(`54${area}15${number}`);
  }
  return candidates;
}

// Formato que funcionó para cada número, para no repetir los intentos
// fallidos en cada mensaje (vive en memoria de la instancia).
const workingRecipient = new Map<string, string>();

const RECIPIENT_NOT_ALLOWED = 131030;

class WhatsAppError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | undefined,
    detail: string,
  ) {
    super(`WhatsApp respondió ${status}: ${detail}`);
  }
}

async function postMessage(to: string, body: string): Promise<void> {
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
        to,
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
    let code: number | undefined;
    try {
      code = (JSON.parse(detail) as { error?: { code?: number } }).error?.code;
    } catch {
      // la respuesta no era JSON; nos quedamos con el texto
    }
    throw new WhatsAppError(res.status, code, detail);
  }
}

/** Manda un mensaje de texto por WhatsApp al número que nos escribió. */
export async function sendText(from: string, body: string): Promise<void> {
  const known = workingRecipient.get(from);
  const candidates = known ? [known] : recipientCandidates(from);

  let lastError: unknown;
  for (const to of candidates) {
    try {
      await postMessage(to, body);
      workingRecipient.set(from, to);
      return;
    } catch (err) {
      lastError = err;
      // Solo probamos otro formato si el problema es que el número no está
      // en la lista; cualquier otro error (token vencido, etc.) se informa.
      if (!(err instanceof WhatsAppError) || err.code !== RECIPIENT_NOT_ALLOWED) {
        throw err;
      }
    }
  }
  throw lastError;
}
