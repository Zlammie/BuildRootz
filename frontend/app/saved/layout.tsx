import type { Metadata } from "next";
import { buildRobotsMeta } from "../../lib/seo";

export const metadata: Metadata = {
  robots: buildRobotsMeta({
    index: false,
    follow: true,
  }),
};

export default function SavedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
