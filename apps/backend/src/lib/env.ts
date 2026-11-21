// Validación de variables de entorno de producción (blueprint §10, paso 2).
// TypeScript puro: sin imports de @medusajs/*. Solo medusa-config.ts la invoca, y solo con NODE_ENV=production.

type Env = Record<string, string | undefined>

export const PRODUCTION_REQUIRED = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "COOKIE_SECRET",
  "STORE_CORS",
  "ADMIN_CORS",
  "AUTH_CORS",
  "MEDUSA_BACKEND_URL",
  "S3_FILE_URL",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
  "S3_ENDPOINT",
  "STRIPE_API_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SPEI_WEBHOOK_SECRET",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
  "ENVIA_API_TOKEN",
  "FACTURAPI_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "STOREFRONT_URL",
  "SENTRY_DSN",
] as const

export const PRODUCTION_VALUES = {
  FILE_PROVIDER: "s3",
  SPEI_MODE: "live",
  PAYPAL_ENVIRONMENT: "live",
  ENVIA_ENVIRONMENT: "production",
  FACTURAPI_MODE: "live",
} as const

const MIN_SECRET_LENGTH = 32

export function missingProductionEnv(env: Env): string[] {
  const missing: string[] = []
  for (const name of PRODUCTION_REQUIRED) {
    if (!env[name] || env[name]!.trim() === "") missing.push(name)
  }
  for (const [name, expected] of Object.entries(PRODUCTION_VALUES)) {
    if (env[name] !== expected) missing.push(name)
  }
  for (const name of ["JWT_SECRET", "COOKIE_SECRET"]) {
    const value = env[name]
    if (value && value.trim() !== "" && value.length < MIN_SECRET_LENGTH) missing.push(name)
  }
  return missing
}

export function assertProductionEnv(env: Env): void {
  const lista = missingProductionEnv(env)
  if (lista.length > 0) {
    throw new Error("Variables de producción faltantes o inválidas: " + lista.join(", "))
  }
}
