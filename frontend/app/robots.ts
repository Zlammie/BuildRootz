import type { MetadataRoute } from "next";
import { getConfiguredSiteOrigin } from "../lib/seo";

export default function robots(): MetadataRoute.Robots {
  const origin = getConfiguredSiteOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/admin/",
          "/account",
          "/saved",
          "/login",
          "/signup",
          "/*?utm_*",
          "/*?fbclid=*",
          "/*?gclid=*",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
