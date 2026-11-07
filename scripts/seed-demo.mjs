// Crea (o reinicia) la cuenta demo con conversaciones de ejemplo.
//
// Uso:  npm run seed:demo
//
// Lee del .env.local las credenciales de la service account y la cuenta demo
// (NEXT_PUBLIC_DEMO_EMAIL y NEXT_PUBLIC_DEMO_PASSWORD). Se puede correr las
// veces que haga falta: borra las conversaciones de la cuenta demo y las
// vuelve a crear, así la demo queda limpia después de que alguien la pruebe.
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const {
  FIREBASE_PROJECT_ID: projectId,
  FIREBASE_CLIENT_EMAIL: clientEmail,
  FIREBASE_PRIVATE_KEY: rawKey,
  NEXT_PUBLIC_DEMO_EMAIL: email,
  NEXT_PUBLIC_DEMO_PASSWORD: password,
} = process.env;

const missing = Object.entries({
  FIREBASE_PROJECT_ID: projectId,
  FIREBASE_CLIENT_EMAIL: clientEmail,
  FIREBASE_PRIVATE_KEY: rawKey,
  NEXT_PUBLIC_DEMO_EMAIL: email,
  NEXT_PUBLIC_DEMO_PASSWORD: password,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error(`✗ Faltan variables en .env.local: ${missing.join(", ")}`);
  process.exit(1);
}
if (password.length < 6) {
  console.error("✗ NEXT_PUBLIC_DEMO_PASSWORD tiene que tener al menos 6 caracteres");
  process.exit(1);
}

const privateKey = rawKey.trim().replace(/^"([\s\S]*)"$/, "$1").replace(/\\n/g, "\n");
initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const auth = getAuth();
const db = getFirestore();

// --- Conversaciones de ejemplo -------------------------------------------
// Cada una muestra un comportamiento distinto del asistente.
const CONVERSATIONS = [
  {
    // Pedido completo: pide datos, calcula el total con envío y confirma.
    messages: [
      ["user", "Hola! quiero 2 muzzarellas"],
      ["assistant", "¡Hola! Anoto 2 muzzarellas ($24.000). ¿Me pasás tu nombre, dirección con localidad o barrio, y medio de pago?"],
      ["user", "Martina, San Juan 1250, Godoy Cruz. Pago con transferencia"],
      ["assistant", "Perfecto, Martina. Con el envío a Godoy Cruz ($2.500) el total queda en $26.500, por transferencia. ¿Te confirmo el pedido?"],
      ["user", "Dale"],
      ["assistant", "¡Listo! Pedido confirmado. En un rato sale para San Juan 1250, Godoy Cruz."],
    ],
  },
  {
    // Fuera de zona: no confirma el pedido.
    messages: [
      ["user", "¿Hacen delivery a Luján de Cuyo?"],
      ["assistant", "Por ahora el delivery llega a Ciudad de Mendoza, Godoy Cruz y Guaymallén, así que Luján de Cuyo queda fuera de zona. ¡Perdón por no poder ayudarte esta vez!"],
    ],
  },
  {
    // Dato que no tiene: no inventa.
    messages: [
      ["user", "¿Tienen pizzas sin TACC?"],
      ["assistant", "No tengo esa información a mano. Lo consulto con una persona del equipo y te confirmamos por acá."],
    ],
  },
  {
    // Cliente molesto: ofrece derivar.
    messages: [
      ["user", "Hace una hora que espero el pedido y no llega nada"],
      ["assistant", "Uh, perdón por la demora. Si querés, te derivo ahora con una persona del equipo para que revise tu pedido."],
    ],
  },
];

// --- Usuario demo ---------------------------------------------------------
async function upsertDemoUser() {
  try {
    const user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password, displayName: "Cuenta demo" });
    console.log(`✓ Usuario demo actualizado (${email})`);
    return user.uid;
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    const user = await auth.createUser({ email, password, displayName: "Cuenta demo" });
    console.log(`✓ Usuario demo creado (${email})`);
    return user.uid;
  }
}

async function main() {
  const uid = await upsertDemoUser();

  // Borrar lo que haya quedado de pruebas anteriores, mensajes incluidos.
  const old = await db.collection("conversations").where("ownerUid", "==", uid).get();
  for (const doc of old.docs) await db.recursiveDelete(doc.ref);
  console.log(`✓ ${old.size} conversación(es) anteriores borradas`);

  // Crear las de ejemplo con horarios escalonados: la primera es la más
  // vieja y cada mensaje queda un minuto después del anterior.
  let clock = Date.now() - CONVERSATIONS.length * 60 * 60_000;

  for (const { messages } of CONVERSATIONS) {
    const ref = db.collection("conversations").doc();
    const batch = db.batch();
    let last = null;

    for (const [role, text] of messages) {
      clock += 60_000;
      last = { text, at: Timestamp.fromMillis(clock) };
      batch.set(ref.collection("messages").doc(), { role, text, createdAt: last.at });
    }

    batch.set(ref, {
      ownerUid: uid,
      title: messages[0][1].slice(0, 40),
      channel: "web",
      lastMessage: last.text,
      createdAt: Timestamp.fromMillis(clock - messages.length * 60_000),
      updatedAt: last.at,
    });

    await batch.commit();
    clock += 45 * 60_000;
  }

  console.log(`✓ ${CONVERSATIONS.length} conversaciones de ejemplo creadas`);
  console.log("\nListo. Entrá con la cuenta demo para verlas.");
}

main().catch((err) => {
  console.error("✗ Falló el seed:", err.message ?? err);
  process.exit(1);
});
