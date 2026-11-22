// Gate del sistema de diseño (blueprint paso 14): cero literales hex en src/ fuera de src/styles/globals.css.
// Marca un hex dentro de un string ("…", '…', `…`) o de una clase arbitraria [#…]; en .css marca cualquier hex.
// Una línea con `// tokens-ok` se ignora (p. ej. anclas como href="#cafe").
// Uso: node apps/storefront/scripts/check-tokens.mjs  → exit 0 limpio · exit 1 con la lista archivo:línea
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const raizApp = join(dirname(fileURLToPath(import.meta.url)), "..")
const src = join(raizApp, "src")
const excluido = join(src, "styles", "globals.css")
const EXTENSIONES = /\.(ts|tsx|css)$/
const HEX = /#[0-9a-fA-F]{3,8}\b/g

const archivos = []
const recorrer = (dir) => {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) recorrer(ruta)
    else if (EXTENSIONES.test(nombre) && ruta !== excluido) archivos.push(ruta)
  }
}
recorrer(src)

// ¿La posición `i` de la línea cae dentro de un literal de string?
const dentroDeString = (linea, i) => {
  let abierta = null
  for (let k = 0; k < i; k++) {
    const c = linea[k]
    if (c === "\\") {
      k++
      continue
    }
    if (abierta) {
      if (c === abierta) abierta = null
    } else if (c === '"' || c === "'" || c === "`") {
      abierta = c
    }
  }
  return abierta !== null
}

const hallazgos = []
for (const archivo of archivos) {
  const esCss = archivo.endsWith(".css")
  readFileSync(archivo, "utf8")
    .split(/\r?\n/)
    .forEach((linea, n) => {
      if (linea.includes("// tokens-ok")) return
      for (const m of linea.matchAll(HEX)) {
        const i = m.index ?? 0
        if (esCss || linea[i - 1] === "[" || dentroDeString(linea, i)) {
          hallazgos.push(`${relative(raizApp, archivo).split(sep).join("/")}:${n + 1}  ${m[0]}`)
          break
        }
      }
    })
}

if (hallazgos.length > 0) {
  console.error(`check-tokens: ${hallazgos.length} línea(s) con hex fuera de src/styles/globals.css`)
  for (const h of hallazgos) console.error(`  ${h}`)
  process.exit(1)
}
console.log(`check-tokens: ok (${archivos.length} archivos, cero hex fuera de los tokens)`)
