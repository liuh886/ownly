import type { Metadata } from "next";
import { WYQD_PRODUCT_POSITIONING, WYQD_PRODUCT_SLOGAN } from "@/core/runtime";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ownly (物欲清单)",
  description: `${WYQD_PRODUCT_POSITIONING} ${WYQD_PRODUCT_SLOGAN}.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="h-full antialiased">
      <body className="font-sans min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
