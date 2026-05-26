import type { Metadata } from "next";
import { WYQD_PRODUCT_POSITIONING, WYQD_PRODUCT_SLOGAN } from "@/core/runtime";
import "./globals.css";

export const metadata: Metadata = {
  title: "WYQD (万物皆可量化)",
  description: `${WYQD_PRODUCT_POSITIONING} ${WYQD_PRODUCT_SLOGAN}.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="h-full antialiased">
      <body className="font-sans min-h-full flex flex-col">{children}</body>
    </html>
  );
}
