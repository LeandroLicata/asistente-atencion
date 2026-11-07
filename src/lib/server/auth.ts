import "server-only";
import type { NextRequest } from "next/server";
import { adminAuth } from "./firebase-admin";

/**
 * Lee el header `Authorization: Bearer <ID token>` y devuelve el uid del
 * usuario, o null si falta o no es válido.
 */
export async function getUidFromRequest(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;

  // Si faltan las credenciales del servidor, esto tira error y Next responde
  // 500: es un problema de configuración, no del usuario.
  const auth = adminAuth();

  try {
    return (await auth.verifyIdToken(token)).uid;
  } catch {
    return null;
  }
}
