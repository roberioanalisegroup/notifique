/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

/** Alinhado com src/lib/security/cross-origin-headers.ts (assets estáticos /_next). */
const PERMISSIONS_POLICY =
  "accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-create=(), publickey-credentials-get=(), usb=(), xr-spatial-tracking=()";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    /** CSP dinâmica (nonce) é aplicada no middleware. */
    /** @type {{ key: string, value: string }[]} */
    const base = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-XSS-Protection", value: "0" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
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
