/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const scriptSrc = isProd
      ? "'self' 'unsafe-inline'"
      : "'self' 'unsafe-inline' 'unsafe-eval'";

    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline'",
      `script-src ${scriptSrc}`,
      "connect-src 'self' https: wss:",
      "font-src 'self' data: https:",
      "upgrade-insecure-requests",
      "block-all-mixed-content"
    ].join("; ");

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
      ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
      : [];

    return [
      {
        source: "/:path*",
        headers: [...base, ...hsts],
      },
    ];
  },
  poweredByHeader: false,
};

export default nextConfig;
