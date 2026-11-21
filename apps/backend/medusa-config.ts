import { defineConfig, loadEnv } from "@medusajs/framework/utils"
import { assertProductionEnv } from "./src/lib/env"

loadEnv(process.env.NODE_ENV || "development", process.cwd())
if (process.env.NODE_ENV === "production") assertProductionEnv(process.env)

const redisUrl = process.env.REDIS_URL
// Tests run without Redis (in-memory event bus/workflows); dev and production use it.
const useRedis = Boolean(redisUrl) && process.env.NODE_ENV !== "test"
const backendUrl = process.env.MEDUSA_BACKEND_URL ?? "http://localhost:9000"

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: useRedis ? redisUrl : undefined,
    workerMode: (process.env.MEDUSA_WORKER_MODE as "shared" | "worker" | "server") || "shared",
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  admin: {
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
    backendUrl,
  },
  modules: [
    ...(useRedis
      ? [
          { resolve: "@medusajs/medusa/event-bus-redis", options: { redisUrl } },
          { resolve: "@medusajs/medusa/workflow-engine-redis", options: { redis: { redisUrl } } },
          {
            resolve: "@medusajs/medusa/locking",
            options: {
              providers: [
                { resolve: "@medusajs/medusa/locking-redis", id: "locking-redis", is_default: true, options: { redisUrl } },
              ],
            },
          },
        ]
      : []),
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          process.env.FILE_PROVIDER === "s3"
            ? {
                resolve: "@medusajs/medusa/file-s3",
                id: "s3",
                options: {
                  file_url: process.env.S3_FILE_URL,
                  access_key_id: process.env.S3_ACCESS_KEY_ID,
                  secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
                  region: process.env.S3_REGION,
                  bucket: process.env.S3_BUCKET,
                  endpoint: process.env.S3_ENDPOINT,
                },
              }
            : { resolve: "@medusajs/medusa/file-local", id: "local", options: { upload_dir: "static", backend_url: `${backendUrl}/static` } },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [{ resolve: "@medusajs/medusa/notification-local", id: "local", options: { channels: ["email"] } }],
      },
    },
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          ...(process.env.STRIPE_API_KEY
            ? [
                {
                  resolve: "@medusajs/medusa/payment-stripe",
                  id: "stripe",
                  options: { apiKey: process.env.STRIPE_API_KEY, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET },
                },
              ]
            : []),
          {
            resolve: "./src/modules/spei-payment",
            id: "spei",
            options: {
              mode: process.env.SPEI_MODE === "live" ? "live" : "mock",
              apiKey: process.env.STRIPE_API_KEY,
              webhookSecret: process.env.SPEI_WEBHOOK_SECRET,
              expiresHours: 72,
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: { providers: [{ resolve: "@medusajs/medusa/fulfillment-manual", id: "manual" }] },
    },
  ],
})
