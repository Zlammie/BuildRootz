import type { Metadata } from "next";
import HomeClient from "../HomeClient";
import {
  AppSearchParams,
  DEFAULT_SITE_NAME,
  DEFAULT_TWITTER_CARD,
  buildRobotsMeta,
  hasAnySearchParam,
} from "../../lib/seo";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: AppSearchParams | Promise<AppSearchParams>;
};

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const isIndexable = !hasAnySearchParam(resolvedSearchParams);

  return {
    title: "Listings",
    description: "Browse active new construction listings on BuildRootz.",
    alternates: {
      canonical: "/listings",
    },
    robots: buildRobotsMeta({
      index: isIndexable,
      follow: true,
    }),
    openGraph: {
      title: "Listings",
      description: "Browse active new construction listings on BuildRootz.",
      url: "/listings",
      siteName: DEFAULT_SITE_NAME,
    },
    twitter: {
      card: DEFAULT_TWITTER_CARD,
      title: "Listings",
      description: "Browse active new construction listings on BuildRootz.",
    },
  };
}

export default async function ListingsPage() {
  return <HomeClient initialHomes={[]} />;
}
