import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { site } from "@/config/site";
import "@/styles/globals.css";
import { getSiteTheme } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: site.fullName, template: `%s · ${site.name}` },
  description: site.tagline,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = await getSiteTheme();
  return (
    <html lang="en" data-theme={theme}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700;9..144,900&family=Inter:wght@300;400;500;600;700&family=Tiro+Bangla:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* suppressHydrationWarning: browser extensions (Grammarly, etc.) inject
          attributes like data-gr-ext-installed onto <body> before React
          hydrates, which otherwise triggers a harmless hydration mismatch. */}
      <body suppressHydrationWarning>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
