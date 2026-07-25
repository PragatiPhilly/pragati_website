import type { NextConfig } from "next";

// Baseline HTTP security headers, applied to every response.
// - HSTS forces HTTPS for a long time (Vercel already serves HTTPS).
// - frame-ancestors 'none' + X-Frame-Options DENY block clickjacking.
// - nosniff stops MIME-type sniffing; Referrer-Policy limits URL leakage.
// - Permissions-Policy switches off device APIs the site never uses.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none';" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "sharp"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
