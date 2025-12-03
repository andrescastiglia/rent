/**
 * Root layout minimal - el middleware maneja los redirects de i18n
 * Este layout existe solo para satisfacer los requisitos de Next.js
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
