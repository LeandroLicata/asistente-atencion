import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asistente de atención — demo",
  description:
    "Demo de un asistente de atención al cliente con Next.js, Firebase y Gemini.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      {/* suppressHydrationWarning: algunas extensiones del navegador
          (ColorZilla, Grammarly) agregan atributos al <body> antes de que
          cargue React. Solo afecta a este elemento, no a sus hijos. */}
      <body className="antialiased" suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
