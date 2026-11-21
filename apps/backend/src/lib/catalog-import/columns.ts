// Contrato del Excel de carga masiva (blueprint §5). TypeScript puro: sin dependencias de Medusa.
import ExcelJS from "exceljs"

export const COLUMNAS = [
  "handle",
  "titulo",
  "descripcion",
  "categoria",
  "tipo_opcion",
  "valor_opcion",
  "sku",
  "precio_mxn",
  "existencia",
  "peso_g",
  "largo_cm",
  "ancho_cm",
  "alto_cm",
  "solo_terrestre",
  "estado",
] as const

export type Columna = (typeof COLUMNAS)[number]

export const CATEGORIAS = ["ropa", "tenis", "joyeria", "perfumes", "accesorios"] as const

export const TIPOS_OPCION = ["talla_ropa", "talla_calzado", "contenido_ml", "medida", "unica"] as const

export type TipoOpcion = (typeof TIPOS_OPCION)[number]

export const TALLAS_ROPA = ["XCH", "CH", "M", "G", "EG", "EEG"]

export const ETIQUETA_OPCION: Record<TipoOpcion, string> = {
  talla_ropa: "Talla",
  talla_calzado: "Número",
  contenido_ml: "Contenido",
  medida: "Medida",
  unica: "Presentación",
}

export const SI_NO = ["SI", "NO"] as const

export const ESTADOS = ["borrador", "publicado"] as const

const INSTRUCCIONES = [
  "Plantilla de carga masiva de Saint Drip",
  "",
  "1. Llena la hoja Productos: una fila por variante, desde la fila 2. No cambies los encabezados ni su orden.",
  "2. Las filas del mismo handle deben repetir titulo, descripcion, categoria, tipo_opcion, solo_terrestre y estado.",
  "3. handle: minúsculas, números y guiones (ej. sd-hoodie-oversize-negro).",
  "4. tipo_opcion y valor_opcion: talla_ropa (XCH, CH, M, G, EG, EEG) · talla_calzado (22 a 31, pasos de 0.5) · contenido_ml (1 a 1000) · medida (texto de hasta 20 caracteres) · unica (Única).",
  "5. sku: mayúsculas, números y guiones; único en el archivo y en la tienda.",
  "6. precio_mxn con IVA incluido, punto decimal (ej. 1299.00). existencia: entero ≥ 0.",
  "7. peso_g, largo_cm, ancho_cm y alto_cm: enteros mayores que 0 (paquete listo para enviar).",
  "8. solo_terrestre: SI o NO. estado: borrador o publicado.",
  "9. Fotos JPG nombradas {handle}-{n}.jpg en minúsculas (ej. sd-hoodie-oversize-negro-1.jpg). La foto 1 es la portada.",
  "",
  "La hoja Valores lista los valores permitidos.",
]

export async function buildPlantilla(): Promise<Buffer> {
  const libro = new ExcelJS.Workbook()

  const instrucciones = libro.addWorksheet("Instrucciones")
  instrucciones.getColumn(1).width = 120
  for (const linea of INSTRUCCIONES) instrucciones.addRow([linea])
  instrucciones.getCell("A1").font = { bold: true, size: 14 }

  const productos = libro.addWorksheet("Productos")
  const encabezado = productos.addRow([...COLUMNAS])
  encabezado.eachCell((celda) => {
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A0A0A" } }
    celda.font = { bold: true, color: { argb: "FFF4F4F1" } }
  })
  COLUMNAS.forEach((_, i) => {
    productos.getColumn(i + 1).width = 18
  })

  const valores = libro.addWorksheet("Valores")
  const listas: [string, readonly string[]][] = [
    ["categoria", CATEGORIAS],
    ["tipo_opcion", TIPOS_OPCION],
    ["solo_terrestre", SI_NO],
    ["estado", ESTADOS],
    ["talla_ropa", TALLAS_ROPA],
  ]
  listas.forEach(([titulo, lista], i) => {
    const columna = valores.getColumn(i + 1)
    columna.width = 18
    columna.values = [titulo, ...lista]
    valores.getCell(1, i + 1).font = { bold: true }
  })

  return Buffer.from(await libro.xlsx.writeBuffer())
}
