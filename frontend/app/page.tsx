import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import { DEFAULT_SITE_NAME, DEFAULT_TWITTER_CARD } from "../lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "BuildRootz",
  description: "Browse new construction listings and builder communities on BuildRootz.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "BuildRootz",
    description: "Browse new construction listings and builder communities on BuildRootz.",
    url: "/",
    siteName: DEFAULT_SITE_NAME,
  },
  twitter: {
    card: DEFAULT_TWITTER_CARD,
    title: "BuildRootz",
    description: "Browse new construction listings and builder communities on BuildRootz.",
  },
};

export default async function Page() {
  return <HomeClient initialHomes={[]} />;
}
