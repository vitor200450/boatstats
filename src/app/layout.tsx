import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { t } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();

  return {
    title: "BoatStats",
    description: t(locale, "metadata.description"),
    icons: {
      icon: [
        { url: "/favicon-32x32.png?v=3", type: "image/png", sizes: "32x32" },
        { url: "/favicon-16x16.png?v=3", type: "image/png", sizes: "16x16" },
      ],
      apple: [{ url: "/apple-touch-icon.png?v=3", sizes: "180x180", type: "image/png" }],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale();

  return (
    <html lang={locale}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
