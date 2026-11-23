// Migración de una sola vez del catálogo anterior (saint-drip-catalogo.vercel.app) a la plantilla de
// carga masiva (blueprint §5, D25). Lee los mismos datos que muestra el sitio, genera el Excel y las fotos
// {handle}-{n}.jpg, y un reporte de lo que la marca debe revisar. Todo sale en estado "borrador".
//
// Uso (desde la raíz):  node scripts/migrar-catalogo-anterior.mjs [carpeta-salida]
// Salida por defecto:  migracion-catalogo/  (ignorada por git)
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { chromium } from "playwright"

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..")
const ExcelJS = createRequire(path.join(raiz, "apps/backend/package.json"))("exceljs")
const sharp = createRequire(path.join(raiz, "apps/storefront/package.json"))("sharp")

const ORIGEN = "https://saint-drip-catalogo.vercel.app"
const SALIDA = path.resolve(process.argv[2] ?? path.join(raiz, "migracion-catalogo"))
const COLUMNAS = ["handle", "titulo", "descripcion", "categoria", "tipo_opcion", "valor_opcion", "sku", "precio_mxn",
  "existencia", "peso_g", "largo_cm", "ancho_cm", "alto_cm", "solo_terrestre", "estado"]
const TALLAS_ROPA = ["XCH", "CH", "M", "G", "EG", "EEG", "XS", "S", "L", "XL", "XXL"]
const CATEGORIAS = ["ropa", "tenis", "joyeria", "perfumes", "accesorios"]

// Paquete listo para enviar (propuesta para que la marca la ajuste): [peso_g, largo, ancho, alto] en cm.
const PAQUETES = {
  ropa_pesada: [900, 38, 30, 10], // hoodies, chamarras, sudaderas, conjuntos
  ropa_ligera: [300, 30, 25, 4], // playeras, jerseys, polos
  ropa: [600, 35, 28, 6],
  tenis: [1400, 36, 24, 14],
  joyeria: [150, 15, 12, 5],
  perfumes: [500, 15, 10, 10],
  accesorios: [250, 20, 15, 5],
}
const paquete = (categoria, nombre) => {
  if (categoria !== "ropa") return PAQUETES[categoria]
  if (/hoodie|chamarra|sudadera|zip|conjunto|sweater|su[eé]ter|abrigo/i.test(nombre)) return PAQUETES.ropa_pesada
  if (/playera|jersey|polo|camiseta|t-?shirt/i.test(nombre)) return PAQUETES.ropa_ligera
  return PAQUETES.ropa
}

const slug = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
const skuParte = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")

// Tipo y valor de opción a partir de las tallas del catálogo anterior.
function opcion(tallas) {
  const t = tallas.map((x) => String(x ?? "").trim())
  if (t.every((x) => TALLAS_ROPA.includes(x.toUpperCase()))) return { tipo: "talla_ropa", valor: (x) => x.toUpperCase() }
  if (t.every((x) => /^\d{2}(\.5)?$/.test(x) && Number(x) >= 22 && Number(x) <= 31)) return { tipo: "talla_calzado", valor: (x) => x }
  if (t.every((x) => /^\d{1,4}\s*ml$/i.test(x))) return { tipo: "contenido_ml", valor: (x) => String(parseInt(x, 10)) }
  if (t.length === 1 && /^(única|unica|ajustable.*|preventa)$/i.test(t[0])) return { tipo: "unica", valor: () => "Única" }
  if (t.every((x) => x.length <= 20)) return { tipo: "medida", valor: (x) => x }
  return null
}

async function leerCatalogo() {
  const navegador = await chromium.launch()
  const pagina = await navegador.newPage()
  let productos = null
  pagina.on("response", async (r) => {
    if (/\/rest\/v1\/productos\?/.test(r.url())) productos = await r.json().catch(() => null)
  })
  await pagina.goto(ORIGEN, { waitUntil: "networkidle", timeout: 90_000 })
  await pagina.waitForTimeout(2_000)
  await navegador.close()
  if (!Array.isArray(productos)) throw new Error(`No se pudieron leer los productos de ${ORIGEN}`)
  return productos
}

const main = async () => {
  const productos = await leerCatalogo()
  fs.rmSync(SALIDA, { recursive: true, force: true })
  fs.mkdirSync(path.join(SALIDA, "fotos"), { recursive: true })

  const filas = []
  const fotosPorHandle = {}
  const revisar = []
  const handles = new Set()
  const skus = new Set()
  const unico = (base, usados, sep = "-") => {
    let v = base
    for (let i = 2; usados.has(v); i++) v = `${base}${sep}${i}`
    usados.add(v)
    return v
  }

  for (const p of productos) {
    const nombre = p.nombre.trim()
    let categoria = p.categorias?.slug
    if (!CATEGORIAS.includes(categoria)) {
      categoria = "ropa"
      revisar.push(`**${nombre}**: no tenía categoría; se asignó Ropa.`)
    }
    const variantes = (p.producto_variantes ?? []).filter((v) => v.activa)
    if (!variantes.length) {
      revisar.push(`**${nombre}**: no tiene variantes activas; no se migró.`)
      continue
    }
    // "Negra"/"Negro" y "Azul marino"/"Azul Marino" son el mismo color: se comparan sin mayúsculas, acentos ni género.
    const claveColor = (c) => slug(c ?? "").replace(/(?<=[a-z])[ao](?=-|$)/g, "")
    const porColor = new Map()
    for (const v of variantes) {
      const k = claveColor(v.color)
      if (!porColor.has(k)) porColor.set(k, { color: (v.color ?? "").trim(), vs: [] })
      porColor.get(k).vs.push(v)
    }
    const colores = [...porColor.values()].map((g) => g.color)
    const grupos = porColor.size > 1 ? [...porColor.values()].map((g) => [g.color, g.vs]) : [["", variantes]]
    if (colores.length > 1) revisar.push(`**${nombre}**: tenía ${colores.length} colores (${colores.join(", ")}); se separó en un producto por color con las mismas fotos. Quita las que no correspondan.`)

    const fotos = [...(p.producto_fotos ?? [])].sort((a, b) => Number(b.portada) - Number(a.portada) || a.orden - b.orden)
    const codigo = skuParte(p.codigo || nombre)

    for (const [color, vs] of grupos) {
      const conColor = color && !slug(nombre).includes(slug(color))
      const titulo = conColor ? `${nombre} ${color}` : nombre
      const handle = unico(`sd-${slug(titulo)}`, handles)
      const op = opcion(vs.map((v) => v.talla))
      if (!op) {
        revisar.push(`**${titulo}**: tallas no reconocidas (${vs.map((v) => v.talla).join(", ")}); no se migró.`)
        handles.delete(handle)
        continue
      }
      if (vs.some((v) => /preventa/i.test(v.talla))) revisar.push(`**${titulo}**: estaba en "Preventa"; se migró como talla Única. Ponle su talla real antes de publicar.`)
      if (categoria === "tenis" && op.tipo !== "talla_calzado") revisar.push(`**${titulo}**: está en Tenis pero sus tallas son ${vs.map((v) => v.talla).join(", ")}. Revisa la categoría o las tallas.`)
      const [peso, largo, ancho, alto] = paquete(categoria, titulo)
      const valores = new Set()

      for (const v of vs) {
        const valor = op.valor(String(v.talla).trim())
        if (valores.has(valor)) {
          revisar.push(`**${titulo}**: la talla ${valor} estaba repetida; se sumó su existencia.`)
          const fila = filas.find((f) => f.handle === handle && f.valor_opcion === valor)
          fila.existencia += Math.max(0, v.existencia ?? 0)
          continue
        }
        valores.add(valor)
        filas.push({
          handle,
          titulo,
          descripcion: (p.descripcion ?? "").replace(/[ \t]+\n/g, "\n").trim() || titulo,
          categoria,
          tipo_opcion: op.tipo,
          valor_opcion: valor,
          sku: unico([codigo, color && skuParte(color), skuParte(valor)].filter(Boolean).join("-"), skus),
          precio_mxn: Number(p.precio).toFixed(2),
          existencia: Math.max(0, v.existencia ?? 0),
          peso_g: peso,
          largo_cm: largo,
          ancho_cm: ancho,
          alto_cm: alto,
          solo_terrestre: categoria === "perfumes" ? "SI" : "NO",
          estado: "borrador",
        })
      }
      fotosPorHandle[handle] = fotos.map((f) => f.url)
    }
  }

  // Fotos: JPG con fondo blanco, lado mayor de 1600 px como máximo.
  let n = 0
  for (const [handle, urls] of Object.entries(fotosPorHandle)) {
    let i = 0
    for (const url of urls) {
      const r = await fetch(url)
      if (!r.ok) {
        revisar.push(`Foto no descargada (${r.status}) de **${handle}**: ${url}`)
        continue
      }
      const jpg = await sharp(Buffer.from(await r.arrayBuffer()))
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer()
      fs.writeFileSync(path.join(SALIDA, "fotos", `${handle}-${++i}.jpg`), jpg)
      n++
    }
    if (i === 0) revisar.push(`**${handle}**: quedó sin fotos.`)
  }

  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet("Productos")
  hoja.addRow(COLUMNAS)
  for (const f of filas) hoja.addRow(COLUMNAS.map((c) => String(f[c])))
  await libro.xlsx.writeFile(path.join(SALIDA, "catalogo-saint-drip.xlsx"))

  const productosMigrados = new Set(filas.map((f) => f.handle)).size
  const reporte = [
    "# Migración del catálogo anterior",
    "",
    `Origen: ${ORIGEN} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    `- Productos en el catálogo anterior: ${productos.length}`,
    `- Productos generados: ${productosMigrados} (todos en **borrador**)`,
    `- Filas (variantes): ${filas.length}`,
    `- Fotos JPG: ${n}`,
    "",
    "## Peso y medidas propuestos (paquete listo para enviar)",
    "",
    "| Tipo | Peso (g) | Largo × ancho × alto (cm) |",
    "|---|---|---|",
    ...Object.entries(PAQUETES).map(([k, [g, l, a, h]]) => `| ${k.replace("_", " ")} | ${g} | ${l} × ${a} × ${h} |`),
    "",
    "Envia cotiza con estos valores: si el paquete real pesa o mide distinto, el envío cobrado no coincidirá.",
    "",
    "## Para revisar antes de publicar",
    "",
    ...(revisar.length ? revisar.map((r) => `- ${r}`) : ["- Nada."]),
    "",
    "## Cómo importarlo",
    "",
    "Admin → Carga masiva: sube `catalogo-saint-drip.xlsx` y todas las fotos de `fotos/`, valida e importa.",
    "",
  ].join("\n")
  fs.writeFileSync(path.join(SALIDA, "REPORTE.md"), reporte, "utf-8")
  console.log(`Listo: ${productosMigrados} productos, ${filas.length} variantes, ${n} fotos → ${SALIDA}`)
  console.log(`Puntos a revisar: ${revisar.length} (ver REPORTE.md)`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
