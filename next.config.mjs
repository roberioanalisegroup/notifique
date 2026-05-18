/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    /** CSP dinâmica (nonce) é aplicada no middleware. */
    /** @type {{ key: string, value: string }[]} */
    const base = [
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
