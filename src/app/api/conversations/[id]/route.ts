import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/server/firebase-admin";
import { getUidFromRequest } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/conversations/:id
 *
 * Borrar un documento en Firestore no borra sus subcolecciones, así que se
 * hace desde el servidor con recursiveDelete, que elimina la conversación y
 * todos sus mensajes. Las reglas siguen sin permitir borrar desde el cliente.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const uid = await getUidFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const db = adminDb();
  const ref = db.collection("conversations").doc(id);
  const snap = await ref.get();

  if (!snap.exists || snap.get("ownerUid") !== uid) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  }

  await db.recursiveDelete(ref);
  return NextResponse.json({ ok: true });
}
