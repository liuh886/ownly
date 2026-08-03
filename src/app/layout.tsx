import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { WYQD_PRODUCT_POSITIONING, WYQD_PRODUCT_SLOGAN } from "@/core/runtime";
import { Providers } from "./providers";
import "./globals.css";

const GOOGLE_ANALYTICS_ID = "G-KXXVS33FQ2";

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
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GOOGLE_ANALYTICS_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
