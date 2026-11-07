// Versión de la respuesta automática como Cloud Function. Requiere el plan
// Blaze, así que la demo publicada usa la API route src/app/api/reply en su
// lugar (ver README). La lógica es la misma.

import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { GoogleGenAI } from "@google/genai";

initializeApp();
const db = getFirestore();

// La API key de Gemini vive en Secret Manager, nunca en el código:
//   firebase functions:secrets:set GEMINI_API_KEY
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const MODEL = "gemini-3.5-flash-lite";
// Cuántos mensajes previos se mandan como contexto.
const HISTORY_LIMIT = 20;

const SYSTEM_PROMPT = `
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

const FALLBACK_REPLY =
  "Perdón, tuve un problema para responder. Una persona del equipo te va a contestar en breve.";

/**
 * Se dispara con cada mensaje nuevo. Si lo escribió el cliente, arma el
 * historial, le pide la respuesta a Gemini y la guarda como mensaje del
 * asistente. El panel la ve aparecer en tiempo real por onSnapshot.
 *
 * El mismo flujo sirve para cualquier canal: el webhook de WhatsApp solo
 * tiene que escribir el mensaje entrante en Firestore.
 */
export const replyWithGemini = onDocumentCreated(
  {
    document: "conversations/{conversationId}/messages/{messageId}",
    secrets: [GEMINI_API_KEY],
    // Tiene que coincidir con la región de tu base de Firestore.
    region: "us-central1",
    maxInstances: 5,
  },
  async (event) => {
    const data = event.data?.data();
    // Solo respondemos mensajes del cliente; si no, el propio mensaje del
    // asistente volvería a disparar la función en un loop.
    if (!data || data.role !== "user") return;

    const { conversationId } = event.params;
    const conversationRef = db.collection("conversations").doc(conversationId);
    const messagesRef = conversationRef.collection("messages");

    const historySnap = await messagesRef
      .orderBy("createdAt", "desc")
      .limit(HISTORY_LIMIT)
      .get();

    // Gemini espera los turnos en orden cronológico, con roles user/model.
    const contents = historySnap.docs
      .reverse()
      .map((d) => d.data())
      .filter((m) => typeof m.text === "string" && m.text.length > 0)
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text as string }],
      }));

    let reply = FALLBACK_REPLY;
    try {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });
      const response = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: { systemInstruction: SYSTEM_PROMPT, maxOutputTokens: 400 },
      });
      reply = response.text?.trim() || FALLBACK_REPLY;
    } catch (err) {
      logger.error("Falló la llamada a Gemini", { conversationId, err });
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
  },
);
