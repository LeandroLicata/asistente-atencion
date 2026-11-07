import "server-only";
import type { NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Verificamos el ID token de Firebase con jose en lugar de
// firebase-admin/auth. El verificador de firebase-admin carga jwks-rsa, que
// hace require() de jose (un paquete solo ESM) y eso rompe la función en
// Vercel con ERR_REQUIRE_ESM. Importando jose directamente, Next lo empaqueta
// sin problema.
//
// Es la verificación que documenta Firebase para librerías de terceros:
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library

// Claves públicas con las que Google firma los ID tokens. jose las cachea y
// las renueva solo cuando rotan.
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

async function verifyIdToken(token: string): Promise<string> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Falta FIREBASE_PROJECT_ID");

  // jose valida la firma, el algoritmo, la expiración, el emisor y la
  // audiencia (el token tiene que ser de este proyecto).
  const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
    algorithms: ["RS256"],
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });

  // Chequeos extra que pide Firebase: sub es el uid y no puede venir vacío,
  // y el momento del login no puede estar en el futuro.
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("Token sin uid");
  }
  const authTime = payload.auth_time;
  if (typeof authTime !== "number" || authTime > Date.now() / 1000 + 60) {
    throw new Error("auth_time inválido");
  }

  return payload.sub;
}

/**
 * Lee el header `Authorization: Bearer <ID token>` y devuelve el uid del
 * usuario, o null si falta o no es válido.
 */
export async function getUidFromRequest(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;

  if (!process.env.FIREBASE_PROJECT_ID) {
    // Problema de configuración, no del usuario: que responda 500.
    throw new Error("Falta FIREBASE_PROJECT_ID");
  }

  try {
    return await verifyIdToken(token);
  } catch (err) {
    console.warn("ID token rechazado:", err instanceof Error ? err.message : err);
    return null;
  }
}
