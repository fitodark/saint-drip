// Merges the create-medusa-app output (.scaffold-tmp/saint-drip) into the project root.
// Rule: a file that already exists is NEVER overwritten — the workspace files from the blueprint win.
// node_modules and .git from the scaffold are skipped; every app is reinstalled with --prefix afterwards.
// Supports the two layouts create-medusa-app has produced:
//   A) monorepo:  .scaffold-tmp/saint-drip/apps/backend + .scaffold-tmp/saint-drip/apps/storefront
//   B) siblings:  .scaffold-tmp/saint-drip (backend) + .scaffold-tmp/saint-drip-storefront
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"

const root = ".scaffold-tmp/saint-drip"
const fail = (msg) => {
  console.error(`merge-scaffold: ${msg}`)
  process.exit(1)
}

if (!existsSync(root)) fail(`${root} no existe — create-medusa-app no terminó`)

let pairs
if (existsSync(join(root, "apps/backend/medusa-config.ts"))) {
  pairs = [[join(root, "apps/backend"), "apps/backend"], [join(root, "apps/storefront"), "apps/storefront"]]
} else if (existsSync(join(root, "medusa-config.ts"))) {
  pairs = [[root, "apps/backend"], [".scaffold-tmp/saint-drip-storefront", "apps/storefront"]]
} else {
  fail("layout desconocido: no se encontró medusa-config.ts")
}

const copyMissing = (from, to) => {
  for (const entry of readdirSync(from)) {
    if (entry === "node_modules" || entry === ".git") continue
    const src = join(from, entry)
    const dest = join(to, entry)
    if (statSync(src).isDirectory()) {
      mkdirSync(dest, { recursive: true })
      copyMissing(src, dest)
    } else if (!existsSync(dest)) {
      copyFileSync(src, dest)
    }
  }
}

for (const [from, to] of pairs) {
  if (!existsSync(from)) fail(`falta ${from}`)
  mkdirSync(to, { recursive: true })
  copyMissing(from, to)
}

for (const required of ["apps/backend/medusa-config.ts", "apps/backend/package.json", "apps/storefront/package.json"]) {
  if (!existsSync(required)) fail(`falta ${required} después de la mezcla`)
}

// Best-effort cleanup: on Windows a large node_modules can fail with ENOTEMPTY/EBUSY. The merge already
// succeeded, .scaffold-tmp/ is gitignored and Bootstrap never re-scaffolds once apps/backend exists.
try {
  rmSync(".scaffold-tmp", { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
} catch (err) {
  console.warn(`merge-scaffold: no se pudo borrar .scaffold-tmp (${err.code}); bórralo a mano cuando quieras`)
}
console.log("merge-scaffold: ok")
