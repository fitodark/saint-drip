const checkEnvVariables = require("./check-env-variables")

checkEnvVariables()

/**
 * Medusa Cloud-related environment variables
 */
const S3_HOSTNAME = process.env.MEDUSA_CLOUD_S3_HOSTNAME
const S3_PATHNAME = process.env.MEDUSA_CLOUD_S3_PATHNAME

/**
 * @type {import('next').NextConfig}
 */
const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"

const hostDe = (url) => {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

// D26: para probar desde otro dispositivo de la red (p. ej. http://192.168.0.217:8000), next dev debe aceptar
// el host de NEXT_PUBLIC_BASE_URL; si no, bloquea sus scripts y la página queda sin interacción.
const DEV_HOSTS = [...new Set([hostDe(process.env.NEXT_PUBLIC_BASE_URL), hostDe(BACKEND_URL)])].filter(
  (h) => h && h !== "localhost"
)
const BACKEND = new URL(BACKEND_URL)

/**
 * Blueprint §14: encabezados de seguridad. La CSP va en modo report-only en v1 porque Stripe y PayPal
 * cargan scripts y marcos propios; las violaciones solo aparecen en la consola del navegador.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.paypal.com https://*.paypalobjects.com",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https: ${BACKEND_URL}`,
  "font-src 'self' data:",
  `connect-src 'self' ${BACKEND_URL} https://api.stripe.com https://*.paypal.com`,
  "frame-src https://js.stripe.com https://hooks.stripe.com https://*.paypal.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.paypal.com",
  "object-src 'none'",
].join("; ")

const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
]

const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: DEV_HOSTS,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Link", value: '</.well-known/ucp>; rel="ucp"' }, ...SECURITY_HEADERS],
      },
      {
        source: "/:countryCode/products/:handle",
        headers: [{ key: "Vary", value: "Accept" }],
      },
    ]
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/:countryCode/products/:handle([^/.]+).md",
          destination: "/:countryCode/products/:handle/markdown",
        },
        {
          source: "/:countryCode/products/:handle([^/.]+)",
          has: [{ type: "header", key: "accept", value: ".*text/markdown.*" }],
          destination: "/:countryCode/products/:handle/markdown",
        },
      ],
    }
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: BACKEND.protocol.replace(":", ""),
        hostname: BACKEND.hostname,
      },
      {
        protocol: "https",
        hostname: "*.s3.*.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "*.s3.amazonaws.com",
      },
      ...(S3_HOSTNAME && S3_PATHNAME
        ? [
            {
              protocol: "https",
              hostname: S3_HOSTNAME,
              pathname: S3_PATHNAME,
            },
          ]
        : []),
    ],
  },
}

module.exports = nextConfig
