import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Credenciales de una service account (Consola → Configuración del proyecto →
// Cuentas de servicio → Generar nueva clave privada). Solo existen en el
// servidor: nunca llevan el prefijo NEXT_PUBLIC_.
function createAdminApp(): App {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // En los .env la clave viene con "\n" literales; hay que convertirlos.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Faltan FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY",
    );
  }

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

// Se inicializa recién en el primer uso, no al importar: así el build de
// Next no necesita las credenciales.
function adminApp(): App {
  return getApps()[0] ?? createAdminApp();
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
