import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import { NONCE_HEADER } from "@/lib/security/apply-security-headers";
import { themeInitScript } from "@/lib/theme-init-script";
import Script from "next/script";
import { headers } from "next/headers";
import { Suspense } from "react";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Analise Alvará - Gestão de Alvarás",
  description:
    "Análise e gestão de alvarás, empresas e sincronização com a Receita Federal (BrasilAPI).",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${inter.variable} min-h-screen font-sans antialiased`}
      >
        <Script id="theme-init" strategy="beforeInteractive" nonce={nonce}>
          {themeInitScript()}
        </Script>
        <Suspense fallback={null}>
          <Providers>{children}</Providers>
        </Suspense>
      </body>
    </html>
  );
}
