// Prueba la conexión con Gemini fuera de Next, con las mismas variables del
// .env.local. Uso:  npm run test:gemini
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

if (!apiKey) {
  console.error("✗ No encontré GEMINI_API_KEY en .env.local");
  process.exit(1);
}

console.log(`Modelo: ${model}`);
console.log(`Key: ...${apiKey.slice(-4)} (${apiKey.length} caracteres)`);

// 1. ¿Llegamos a los servidores de Google?
try {
  const t = Date.now();
  const res = await fetch("https://generativelanguage.googleapis.com/", {
    signal: AbortSignal.timeout(15_000),
  });
  console.log(`✓ Conexión con Google: HTTP ${res.status} en ${Date.now() - t} ms`);
} catch (err) {
  console.error("✗ No hay conexión con generativelanguage.googleapis.com:", err.cause ?? err);
  console.error("  Revisá VPN, proxy, firewall o antivirus.");
  process.exit(1);
}

// 2. ¿Responde el modelo?
try {
  const t = Date.now();
  const ai = new GoogleGenAI({ apiKey });
  const r = await ai.models.generateContent({
    model,
    contents: "Respondé solo: ok",
    config: {
      thinkingConfig: {
        thinkingLevel: process.env.GEMINI_THINKING_LEVEL ?? ThinkingLevel.MINIMAL,
      },
      abortSignal: AbortSignal.timeout(30_000),
    },
  });
  console.log(`✓ Respuesta del modelo en ${Date.now() - t} ms: ${r.text?.trim()}`);
} catch (err) {
  console.error("✗ Falló la llamada al modelo:", err.message ?? err, err.cause ?? "");
  process.exit(1);
}
