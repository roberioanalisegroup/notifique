/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline'",
      // Next (especialmente em dev) pode precisar de inline/eval; manter aqui por compatibilidade.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' https: wss:",
      "font-src 'self' data: https:",
      "upgrade-insecure-requests",
    ]
      .join("; ");

    /** @type {{ key: string, value: string }[]} */
    const base = [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value:
          "camera=(), microphone=(), geolocation=(), usb=(), payment=(), autoplay=(), interest-cohort=()",
      },
    ];

    const hsts = isProd
      ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }]
      : [];

    return [
      {
        source: "/:path*",
        headers: [...base, ...hsts],
      },
    ];
  },
};

export default nextConfig;
