import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { WYQD_PRODUCT_POSITIONING, WYQD_PRODUCT_SLOGAN } from "@/core/runtime";
import { Providers } from "./providers";
import "./globals.css";
import "./brand.css";

const GOOGLE_ANALYTICS_ID = "G-KXXVS33FQ2";
const CLOUDFLARE_WEB_ANALYTICS_TOKEN =
  process.env.NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN?.trim() ?? "";

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
        url: `${basePath}/icons/ownly-mark.svg`,
        sizes: "any",
        type: "image/svg+xml",
      },
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
    shortcut: `${basePath}/icons/ownly-mark.svg`,
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
        <Script src={`${basePath}/membership-config.js`} strategy="beforeInteractive" />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = window.gtag || gtag;
            gtag('js', new Date());
            gtag('config', '${GOOGLE_ANALYTICS_ID}');
          `}
        </Script>
        {CLOUDFLARE_WEB_ANALYTICS_TOKEN ? (
          <Script
            src="https://static.cloudflareinsights.com/beacon.min.js"
            strategy="afterInteractive"
            data-cf-beacon={JSON.stringify({ token: CLOUDFLARE_WEB_ANALYTICS_TOKEN })}
          />
        ) : null}
      </body>
    </html>
  );
}
