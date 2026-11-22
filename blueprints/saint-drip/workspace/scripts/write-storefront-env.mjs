// Makes apps/storefront/.env.local complete: every key of apps/storefront/.env.example that is missing
// is appended with its example value (the scaffold writes its own .env.local, which lacks our keys),
// then NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY is set to the key the seed created.
// Idempotent: a second run changes nothing and exits 0.
import { execSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"

const target = "apps/storefront/.env.local"
const example = readFileSync("apps/storefront/.env.example", "utf8")
let env = existsSync(target) ? readFileSync(target, "utf8") : ""

const hasKey = (text, key) => new RegExp(`^${key}=`, "m").test(text)
const added = []
for (const line of example.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (!m || hasKey(env, m[1])) continue
  env += `${env.endsWith("\n") || env === "" ? "" : "\n"}${m[1]}=${m[2]}\n`
  added.push(m[1])
}

// La llave se compara siempre con la del seed: si la base se recrea, el seed crea otra llave y una `pk_`
// vieja en .env.local dejaría al storefront sin acceso a la Store API.
const out = execSync("npm --prefix apps/backend run -s print-key", { encoding: "utf8" })
const match = out.match(/PUBLISHABLE_KEY=(pk_[A-Za-z0-9]+)/)
if (!match) {
  console.error("write-storefront-env: no se obtuvo la llave publicable; corre npm --prefix apps/backend run seed")
  process.exit(1)
}
const actual = env.match(/^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=(.*)$/m)?.[1]?.trim()
if (actual !== match[1]) {
  env = env.replace(/^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=.*$/m, `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${match[1]}`)
  added.push(actual?.startsWith("pk_") ? "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY (llave renovada)" : "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY (valor)")
}

if (!/^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_/m.test(env)) {
  console.error("write-storefront-env: la llave no quedó escrita en .env.local")
  process.exit(1)
}

writeFileSync(target, env)
console.log(added.length ? `write-storefront-env: ok (${added.join(", ")})` : "write-storefront-env: ya configurado")
