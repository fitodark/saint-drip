// Store API / storefront assertions used by the Verify blocks. Exit 0 = found, 1 = not found / error, 2 = usage.
//   node scripts/store-check.mjs payment-provider <provider_id>     e.g. pp_spei_spei
//   node scripts/store-check.mjs shipping-option "<option name>"    e.g. "Envío terrestre"
//   node scripts/store-check.mjs html <path> "<substring>"          e.g. /mx https://wa.me/529531720664
// Reads the publishable key from apps/storefront/.env.local (written by scripts/write-storefront-env.mjs).
import { readFileSync } from "node:fs"

const BACKEND = "http://localhost:9000"
const STOREFRONT = "http://localhost:8000"
const [mode, arg1, arg2] = process.argv.slice(2)

const usage = () => {
  console.error("uso: store-check.mjs payment-provider <id> | shipping-option <nombre> | html <ruta> <texto>")
  process.exit(2)
}
if (!mode || !arg1) usage()

const env = readFileSync("apps/storefront/.env.local", "utf8")
const key = env.match(/^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=(pk_[A-Za-z0-9]+)/m)?.[1]
if (!key && mode !== "html") {
  console.error("store-check: falta NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY en apps/storefront/.env.local")
  process.exit(1)
}
const headers = { "x-publishable-api-key": key ?? "", "content-type": "application/json" }

const get = async (path) => {
  const res = await fetch(`${BACKEND}${path}`, { headers })
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

const regionMx = async () => {
  const { regions } = await get("/store/regions")
  const region = regions.find((r) => (r.countries ?? []).some((c) => c.iso_2 === "mx"))
  if (!region) throw new Error("no hay región con México")
  return region
}

try {
  if (mode === "payment-provider") {
    const region = await regionMx()
    const { payment_providers } = await get(`/store/payment-providers?region_id=${region.id}`)
    const ids = payment_providers.map((p) => p.id)
    if (!ids.includes(arg1)) {
      console.error(`store-check: ${arg1} no está en la región México (hay: ${ids.join(", ")})`)
      process.exit(1)
    }
  } else if (mode === "shipping-option") {
    const region = await regionMx()
    const res = await fetch(`${BACKEND}/store/carts`, {
      method: "POST",
      headers,
      // Shipping options are matched by the service zone's geo zone, so the cart needs a Mexican address.
      body: JSON.stringify({
        region_id: region.id,
        shipping_address: {
          address_1: "Centro",
          city: "Huajuapan de León",
          province: "Oaxaca",
          postal_code: "69000",
          country_code: "mx",
        },
      }),
    })
    if (!res.ok) throw new Error(`/store/carts → ${res.status}`)
    const { cart } = await res.json()
    const { shipping_options } = await get(`/store/shipping-options?cart_id=${cart.id}`)
    const names = shipping_options.map((o) => o.name)
    if (!names.includes(arg1)) {
      console.error(`store-check: opción "${arg1}" no encontrada (hay: ${names.join(", ")})`)
      process.exit(1)
    }
  } else if (mode === "html") {
    if (!arg2) usage()
    const res = await fetch(`${STOREFRONT}${arg1}`)
    const body = await res.text()
    if (!res.ok || !body.includes(arg2)) {
      console.error(`store-check: ${arg1} (${res.status}) no contiene "${arg2}"`)
      process.exit(1)
    }
  } else {
    usage()
  }
  console.log(`store-check: ok (${mode} ${arg1})`)
} catch (err) {
  console.error(`store-check: ${err.message}`)
  process.exit(1)
}
