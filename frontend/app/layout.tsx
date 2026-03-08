import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "../components/Providers";
import {
  DEFAULT_SITE_NAME,
  DEFAULT_TWITTER_CARD,
  getConfiguredSiteOrigin,
} from "../lib/seo";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getConfiguredSiteOrigin()),
  title: {
    default: "BuildRootz",
    template: "%s | BuildRootz",
  },
  description: "New construction listings and builder communities on BuildRootz.",
  applicationName: DEFAULT_SITE_NAME,
  openGraph: {
    type: "website",
    siteName: DEFAULT_SITE_NAME,
  },
  twitter: {
    card: DEFAULT_TWITTER_CARD,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
