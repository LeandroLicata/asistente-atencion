import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Query,
  type QuerySnapshot,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "./firebase";

// Modelo de datos
//
// conversations/{conversationId}
//   ownerUid, title, channel ("web" | "whatsapp"), lastMessage,
//   createdAt, updatedAt
// conversations/{conversationId}/messages/{messageId}
//   role ("user" | "assistant"), text, createdAt
//
// El cliente solo escribe mensajes con role "user". La respuesta la escribe
// el servidor (POST /api/reply) con el Admin SDK, y el panel la recibe por
// onSnapshot.

export type Channel = "web" | "whatsapp";

export type Conversation = {
  id: string;
  title: string;
  channel: Channel;
  lastMessage: string;
  updatedAt: Timestamp | null;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: Timestamp | null;
};

export const MAX_MESSAGE_CHARS = 1000;

// Un listener de Firestore que falla queda muerto: no vuelve a recibir
// cambios. Pasa por cortes de red o, justo después de crear un documento, si
// las reglas lo evalúan antes de que el servidor termine de propagar la
// escritura. Por eso reintentamos unas veces antes de mostrar el error.
const RETRY_DELAYS_MS = [500, 1_500, 4_000];

function resilientSnapshot(
  q: Query,
  onNext: (snap: QuerySnapshot) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  let unsubscribe: Unsubscribe = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let attempt = 0;

  const subscribe = () => {
    unsubscribe = onSnapshot(
      q,
      (snap) => {
        attempt = 0; // si vuelve a andar, se reinician los reintentos
        onNext(snap);
      },
      (err) => {
        // Al cerrar sesión Firebase invalida el token antes de que React
        // desmonte los listeners: no es un error real.
        if (stopped || !auth.currentUser) return;

        const delay = RETRY_DELAYS_MS[attempt++];
        console.warn(`Listener de Firestore falló (${(err as { code?: string }).code ?? err.message})`);
        if (delay === undefined) {
          onError(err);
          return;
        }
        timer = setTimeout(subscribe, delay);
      },
    );
  };

  subscribe();

  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
  };
}

export function watchConversations(
  uid: string,
  onChange: (items: Conversation[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, "conversations"),
    where("ownerUid", "==", uid),
    orderBy("updatedAt", "desc"),
    limit(50),
  );
  return resilientSnapshot(
    q,
    (snap) =>
      onChange(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Conversation),
      ),
    onError,
  );
}

export function watchMessages(
  conversationId: string,
  onChange: (items: Message[]) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, "conversations", conversationId, "messages"),
    orderBy("createdAt", "asc"),
    limit(200),
  );
  return resilientSnapshot(
    q,
    (snap) =>
      onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Message)),
    onError,
  );
}

/**
 * Crea una conversación y devuelve su id al instante, sin esperar al
 * servidor: el id se genera en el cliente y Firestore muestra el documento
 * enseguida en los listeners (compensación de latencia). `saved` se
 * resuelve cuando el servidor confirma la escritura.
 */
export function createConversation(uid: string): { id: string; saved: Promise<void> } {
  const ref = doc(collection(db, "conversations"));
  const saved = setDoc(ref, {
    ownerUid: uid,
    title: "Nueva conversación",
    channel: "web" satisfies Channel,
    lastMessage: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: ref.id, saved };
}

export async function sendUserMessage(
  conversationId: string,
  text: string,
  isFirstMessage: boolean,
): Promise<void> {
  const clean = text.trim().slice(0, MAX_MESSAGE_CHARS);
  if (!clean) return;

  await addDoc(collection(db, "conversations", conversationId, "messages"), {
    role: "user",
    text: clean,
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "conversations", conversationId), {
    lastMessage: clean,
    updatedAt: serverTimestamp(),
    // El primer mensaje le pone nombre a la conversación.
    ...(isFirstMessage ? { title: clean.slice(0, 40) } : {}),
  });
}

/** Headers con el ID token, para que la API sepa quién es el usuario. */
async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error("No hay sesión iniciada");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${await user.getIdToken()}`,
  };
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return new Error(data?.error ?? fallback);
}

/**
 * Le pide al servidor que responda el último mensaje de la conversación.
 * Manda el ID token de Firebase para que la API sepa quién es el usuario.
 */
export async function requestReply(conversationId: string): Promise<void> {
  const res = await fetch("/api/reply", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ conversationId }),
  });
  if (!res.ok) throw await errorFrom(res, "No se pudo obtener la respuesta.");
}

/** Borra la conversación y todos sus mensajes (lo hace el servidor). */
export async function deleteConversation(conversationId: string): Promise<void> {
  const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw await errorFrom(res, "No se pudo borrar la conversación.");
}
