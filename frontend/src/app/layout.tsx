import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Rent Management System",
  description: "Sistema de gestión de alquileres",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
