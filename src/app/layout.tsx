import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import { themeInitScript } from "@/lib/theme-init-script";
import Script from "next/script";
import { Suspense } from "react";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Analise Alvará - Gestão de Alvarás",
  description:
    "Análise e gestão de alvarás, empresas e sincronização com a Receita Federal (BrasilAPI).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen font-sans antialiased`}
      >
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript()}
        </Script>
        <Suspense fallback={null}>
          <Providers>{children}</Providers>
        </Suspense>
      </body>
    </html>
  );
}
