import type { Metadata, Viewport } from "next";
import { WYQD_PRODUCT_POSITIONING, WYQD_PRODUCT_SLOGAN } from "@/core/runtime";
import { Providers } from "./providers";
import "./globals.css";

function getBasePath(): string {
  const configured = process.env.OWNLY_BASE_PATH?.trim() ?? "";
  if (!configured || configured === "/") return "";
  return `/${configured.replace(/^\/+|\/+$/g, "")}`;
}

const basePath = getBasePath();

export const metadata: Metadata = {
  title: "Ownly",
  applicationName: "Ownly",
  description: `${WYQD_PRODUCT_POSITIONING} ${WYQD_PRODUCT_SLOGAN}.`,
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: [
      {
        url: `${basePath}/icons/ownly-192.svg`,
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        url: `${basePath}/icons/ownly-512.svg`,
        sizes: "512x512",
        type: "image/svg+xml",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#1c1917",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="font-sans min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
