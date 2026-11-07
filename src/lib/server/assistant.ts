import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";

// Flash-Lite alcanza para responder sobre datos que ya están en el prompt, es
// más rápido y es el que más margen deja en el free tier. Se puede cambiar
// sin tocar el código con GEMINI_MODEL en el .env.
export const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

// Los Gemini 3.x razonan por defecto; acá no aporta y suma demora y cuota.
// Ojo: no todos los modelos aceptan MINIMAL (algunos Flash solo LOW o más).
const THINKING_LEVEL =
  (process.env.GEMINI_THINKING_LEVEL as ThinkingLevel | undefined) ??
  ThinkingLevel.MINIMAL;

// Reintentos ante picos de demanda (503) o límite de cuota momentáneo (429).
const RETRY_DELAYS_MS = [1_000, 3_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryable(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 503 || err.status === 429);
}

export const SYSTEM_PROMPT = `
Sos el asistente virtual de atención al cliente de "Pizzería Don Zonda",
una pizzería de Mendoza (Argentina) con delivery.

Datos del negocio:
- Horario: martes a domingo de 19 a 0 h. Los lunes está cerrado.
- Delivery en Ciudad de Mendoza, Godoy Cruz y Guaymallén. Envío: $2.500.
- Medios de pago: efectivo, transferencia y Mercado Pago.
- Pizzas: muzzarella $12.000, napolitana $14.000, fugazzeta $13.500,
  especial (jamón, morrones y huevo) $15.500. Todas de 8 porciones.
- Pedidos: se toman por este chat; pedí nombre, dirección con localidad o
  barrio, y medio de pago.

Reglas:
- Respondé en español rioplatense, breve y amable (máximo 3 o 4 oraciones).
- Usá solo los datos de arriba. Si te preguntan algo que no está, decí que
  lo vas a consultar con una persona del equipo; no inventes.
- Si el cliente está enojado o pide hablar con una persona, ofrecé derivarlo.
- Saludá solo en tu primer mensaje; después respondé directo, sin "¡Hola!".
- Antes de confirmar un pedido, verificá que la dirección esté en una zona de
  delivery. Si no queda claro (por ejemplo "Maipú" puede ser una calle o el
  departamento), preguntá la localidad. Si está fuera de zona, avisalo con
  amabilidad y no confirmes el pedido.
`.trim();

export const FALLBACK_REPLY =
  "Perdón, tuve un problema para responder. Una persona del equipo te va a contestar en breve.";

export type Turn = { role: "user" | "assistant"; text: string };

/** Pide a Gemini la respuesta para un historial en orden cronológico. */
export async function generateReply(history: Turn[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY");

  const ai = new GoogleGenAI({ apiKey });

  for (let attempt = 0; ; attempt++) {
    try {
      return await callModel(ai, history);
    } catch (err) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (!isRetryable(err) || delay === undefined) throw err;
      console.warn(`Gemini ocupado (intento ${attempt + 1}), reintento en ${delay} ms`);
      await sleep(delay);
    }
  }
}

async function callModel(ai: GoogleGenAI, history: Turn[]): Promise<string> {
  const response = await ai.models.generateContent({
    model: MODEL,
    // Gemini usa "model" para los turnos del asistente.
    contents: history.map((t) => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.text }],
    })),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      maxOutputTokens: 400,
      temperature: 0.3,
      thinkingConfig: { thinkingLevel: THINKING_LEVEL },
      // Si Gemini no contesta en 20 s, cortamos y mostramos el mensaje de
      // respaldo en vez de dejar al cliente esperando.
      abortSignal: AbortSignal.timeout(20_000),
    },
  });

  return response.text?.trim() || FALLBACK_REPLY;
}
