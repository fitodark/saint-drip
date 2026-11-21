/**
 * Prints the storefront publishable key as `PUBLISHABLE_KEY=pk_...` (read by scripts/write-storefront-env.mjs).
 * Run: npm --prefix apps/backend run -s print-key
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { SEED } from "./seed-saint-drip"

export default async function printPublishableKey({ container }: ExecArgs) {
  const [key] = await container
    .resolve(Modules.API_KEY)
    .listApiKeys({ title: SEED.publishableKeyTitle, type: "publishable" })
  if (!key) throw new Error("print-publishable-key: corre primero npm --prefix apps/backend run seed")
  console.log(`PUBLISHABLE_KEY=${key.token}`)
}
