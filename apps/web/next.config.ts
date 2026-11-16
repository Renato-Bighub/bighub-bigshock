import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://localhost:3001";

// Cabeçalhos de segurança. CSP em modo restritivo mas sem script-src (o Next injeta scripts inline);
// a documentação /docs carrega o Redoc de um CDN fixado, por isso não restringimos script-src.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Mesma origem para o browser: o cookie de sessão da API passa pelo proxy.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};
export default nextConfig;
