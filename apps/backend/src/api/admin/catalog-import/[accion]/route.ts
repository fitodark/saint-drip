// Carga masiva del catálogo (blueprint §5): GET plantilla · POST validar · POST importar.
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { buildPlantilla } from "../../../../lib/catalog-import/columns"
import { leerExcel } from "../../../../lib/catalog-import/parse"
import { emparejarFotos } from "../../../../lib/catalog-import/photos"
import { validarCatalogo } from "../../../../lib/catalog-import/validate"
import { importCatalogWorkflow } from "../../../../workflows/import-catalog"

const MAX_EXCEL_BYTES = 6 * 1024 * 1024

const archivoBase64 = z
  .string()
  .min(1)
  .refine((s) => Buffer.byteLength(s, "base64") <= MAX_EXCEL_BYTES, "El Excel decodificado supera 6 MB")

const ValidarBody = z.object({ archivo_base64: archivoBase64, fotos: z.array(z.string()) })
const ImportarBody = z.object({ archivo_base64: archivoBase64, fotos: z.record(z.string(), z.string()) })

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const errorPropio = (res: MedusaResponse, status: number, codigo: string, mensaje: string) =>
  res.status(status).json({ codigo, mensaje })

const accionDesconocida = (res: MedusaResponse) =>
  errorPropio(res, 404, "E_ACCION", "La acción solicitada no existe")

type Reporte = {
  valido: boolean
  productos: number
  variantes: number
  errores: ReturnType<typeof validarCatalogo>["errores"]
  fotos_faltantes: string[]
  fotos_sin_usar: string[]
}

// Lee el Excel, consulta handles y SKUs existentes y arma el reporte de §5.
async function revisar(req: MedusaRequest, archivo: string, nombresFotos: string[]) {
  const leido = await leerExcel(Buffer.from(archivo, "base64"))

  const handles = [...new Set(leido.filas.map((f) => f.valores.handle).filter(Boolean))]
  const skus = [...new Set(leido.filas.map((f) => f.valores.sku).filter(Boolean))]
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: productos } = handles.length
    ? await query.graph({ entity: "product", fields: ["handle"], filters: { handle: handles } })
    : { data: [] as { handle: string }[] }
  const { data: variantes } = skus.length
    ? await query.graph({ entity: "product_variant", fields: ["sku"], filters: { sku: skus } })
    : { data: [] as { sku: string | null }[] }

  const resultado = validarCatalogo({
    ...leido,
    handlesExistentes: new Set(productos.map((p) => p.handle)),
    skusExistentes: new Set(variantes.map((v) => v.sku).filter((s): s is string => Boolean(s))),
  })
  const fotos = emparejarFotos(
    resultado.productos.map((p) => p.handle),
    nombresFotos
  )

  const reporte: Reporte = {
    valido: resultado.errores.length === 0 && fotos.faltantes.length === 0,
    productos: resultado.productos.length,
    variantes: resultado.productos.reduce((n, p) => n + p.variantes.length, 0),
    errores: resultado.errores,
    fotos_faltantes: fotos.faltantes,
    fotos_sin_usar: fotos.sinUsar,
  }
  return { reporte, resultado, fotos }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  if (req.params.accion !== "plantilla") return accionDesconocida(res)

  const buffer = await buildPlantilla()
  res.setHeader("Content-Type", XLSX_TYPE)
  res.setHeader("Content-Disposition", 'attachment; filename="plantilla-catalogo-saint-drip.xlsx"')
  res.status(200).send(buffer)
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const accion = req.params.accion
  if (accion !== "validar" && accion !== "importar") return accionDesconocida(res)

  const esquema = accion === "validar" ? ValidarBody : ImportarBody
  const cuerpo = esquema.safeParse(req.body)
  if (!cuerpo.success) {
    return errorPropio(res, 400, "E_CUERPO", "El cuerpo de la solicitud no es válido")
  }

  const urlPorNombre: Record<string, string> =
    accion === "importar" ? (cuerpo.data.fotos as Record<string, string>) : {}
  const nombresFotos =
    accion === "importar" ? Object.keys(urlPorNombre) : (cuerpo.data.fotos as string[])

  let revision: Awaited<ReturnType<typeof revisar>>
  try {
    revision = await revisar(req, cuerpo.data.archivo_base64, nombresFotos)
  } catch (e) {
    if (e instanceof Error && e.message === "E_EXCEL") {
      return errorPropio(res, 400, "E_EXCEL", "El archivo no es un Excel válido o no tiene la hoja Productos")
    }
    throw e
  }
  const { reporte, resultado, fotos } = revision

  if (accion === "validar") return res.status(200).json(reporte)

  if (!reporte.valido) return res.status(422).json(reporte)

  const fotosPorHandle: Record<string, string[]> = {}
  for (const [handle, nombres] of Object.entries(fotos.porHandle)) {
    fotosPorHandle[handle] = nombres.map((n) => urlPorNombre[n])
  }

  const { result } = await importCatalogWorkflow(req.scope).run({
    input: { productos: resultado.productos, fotos: fotosPorHandle },
  })

  return res.status(200).json({ creados: result.handles.length, handles: result.handles })
}
