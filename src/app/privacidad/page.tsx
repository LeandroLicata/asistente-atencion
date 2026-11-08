import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidad — Asistente de atención",
  description: "Qué datos usa la demo del asistente de atención y cómo pedir que se borren.",
};

// Contacto para consultas y pedidos de borrado de datos.
const CONTACT_EMAIL = "leandrolicata1@gmail.com";
const LAST_UPDATED = "8 de noviembre de 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-slate-700">
      <Link href="/" className="text-sm text-brand-700 hover:underline">
        ← Volver
      </Link>

      <h1 className="mt-6 text-3xl font-semibold text-slate-900">Política de privacidad</h1>
      <p className="mt-2 text-sm text-slate-500">Última actualización: {LAST_UPDATED}</p>

      <div className="mt-8 space-y-8 leading-relaxed">
        <section>
          <p>
            &ldquo;Asistente de atención&rdquo; es un proyecto de demostración desarrollado por
            Leandro Licata. Simula la atención al cliente de un negocio ficticio (&ldquo;Pizzería
            Don Zonda&rdquo;) mediante un asistente con inteligencia artificial, en la web y por
            WhatsApp. No es un servicio comercial y no se venden productos reales.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">Qué datos se usan</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              <strong>Cuenta del panel:</strong> el email y, si iniciás sesión con Google, el
              nombre asociado a tu cuenta.
            </li>
            <li>
              <strong>WhatsApp:</strong> tu número de teléfono, el nombre de tu perfil de WhatsApp
              y el texto de los mensajes que le envíes al asistente.
            </li>
            <li>
              <strong>Conversaciones:</strong> los mensajes que escribís y las respuestas del
              asistente.
            </li>
          </ul>
          <p className="mt-3">
            No se recopilan datos de pago, ubicación ni contactos, y no se usan cookies de
            publicidad ni de seguimiento.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">Para qué se usan</h2>
          <p className="mt-3">
            Solo para que el asistente pueda responderte y para mostrar la conversación en el panel
            de la demo. Los datos no se venden, no se comparten con fines comerciales y no se usan
            para publicidad.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">Servicios que intervienen</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              <strong>Google Firebase</strong> (Authentication y Firestore): inicio de sesión y
              almacenamiento de las conversaciones.
            </li>
            <li>
              <strong>Google Gemini:</strong> genera las respuestas del asistente a partir del
              texto de la conversación.
            </li>
            <li>
              <strong>Meta (WhatsApp Business Platform):</strong> envío y recepción de mensajes por
              WhatsApp.
            </li>
            <li>
              <strong>Vercel:</strong> alojamiento del sitio.
            </li>
          </ul>
          <p className="mt-3">Cada uno trata los datos según sus propias políticas de privacidad.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">Cuánto tiempo se guardan</h2>
          <p className="mt-3">
            Las conversaciones se guardan mientras la demo esté activa y se borran periódicamente.
            Desde el panel podés borrar tus conversaciones en cualquier momento.
          </p>
        </section>

        <section id="borrado">
          <h2 className="text-xl font-semibold text-slate-900">Cómo pedir que se borren tus datos</h2>
          <p className="mt-3">
            Escribí a{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-700 hover:underline">
              {CONTACT_EMAIL}
            </a>{" "}
            indicando el email de tu cuenta o el número de WhatsApp desde el que escribiste. Tus
            datos se borran en un plazo máximo de 30 días y te confirmo por el mismo medio.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">Contacto</h2>
          <p className="mt-3">
            Para cualquier consulta sobre esta política, escribí a{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-700 hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
