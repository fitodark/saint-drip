// Carga masiva: única vía de escritura del catálogo importado (blueprint §3 y §5 "Efectos").
// Si un paso falla, la compensación de createProductsWorkflow revierte los productos creados.
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import { ETIQUETA_OPCION, type TipoOpcion } from "../lib/catalog-import/columns"
import type { ProductoImportado } from "../lib/catalog-import/validate"
import { SEED } from "../scripts/seed-saint-drip"

export type ImportCatalogInput = {
  productos: ProductoImportado[]
  fotos: Record<string, string[]> // handle → URLs en orden
}

type Contexto = {
  salesChannelId: string
  locationId: string
  shippingProfileId: string
  categoriaPorHandle: Record<string, string>
}

export const resolverContextoStep = createStep(
  "resolver-contexto-importacion",
  async (input: { categorias: string[] }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const { data: canales } = await query.graph({
      entity: "sales_channel",
      fields: ["id"],
      filters: { name: SEED.salesChannel },
    })
    const { data: almacenes } = await query.graph({
      entity: "stock_location",
      fields: ["id"],
      filters: { name: SEED.stockLocation },
    })
    const { data: perfiles } = await query.graph({
      entity: "shipping_profile",
      fields: ["id"],
      filters: { type: "default" },
    })
    const { data: categorias } = await query.graph({
      entity: "product_category",
      fields: ["id", "handle"],
      filters: { handle: input.categorias },
    })

    if (!canales[0] || !almacenes[0] || !perfiles[0]) {
      throw new Error("La tienda no está configurada: corre npm --prefix apps/backend run seed")
    }
    const categoriaPorHandle: Record<string, string> = {}
    for (const c of categorias) categoriaPorHandle[c.handle] = c.id
    const faltan = input.categorias.filter((h) => !categoriaPorHandle[h])
    if (faltan.length > 0) throw new Error(`Categorías inexistentes: ${faltan.join(", ")}`)

    const contexto: Contexto = {
      salesChannelId: canales[0].id,
      locationId: almacenes[0].id,
      shippingProfileId: perfiles[0].id,
      categoriaPorHandle,
    }
    return new StepResponse(contexto)
  }
)

export const importCatalogWorkflow = createWorkflow("import-catalog", (input: ImportCatalogInput) => {
  const categorias = transform({ input }, ({ input }) => [...new Set(input.productos.map((p) => p.categoria))])
  const contexto = resolverContextoStep({ categorias })

  const products = transform({ input, contexto }, ({ input, contexto }) =>
    input.productos.map((p) => {
      const etiqueta = ETIQUETA_OPCION[p.tipoOpcion as TipoOpcion]
      const urls = input.fotos[p.handle] ?? []
      return {
        title: p.titulo,
        handle: p.handle,
        description: p.descripcion,
        status: p.estado,
        category_ids: [contexto.categoriaPorHandle[p.categoria]],
        sales_channels: [{ id: contexto.salesChannelId }],
        shipping_profile_id: contexto.shippingProfileId,
        images: urls.map((url) => ({ url })),
        thumbnail: urls[0],
        options: [{ title: etiqueta, values: p.variantes.map((v) => v.valorOpcion) }],
        metadata: { solo_terrestre: p.soloTerrestre },
        variants: p.variantes.map((v) => ({
          title: v.valorOpcion,
          sku: v.sku,
          options: { [etiqueta]: v.valorOpcion },
          prices: [{ amount: v.precio, currency_code: "mxn" }],
          manage_inventory: true,
          weight: v.pesoG,
          length: v.largoCm,
          width: v.anchoCm,
          height: v.altoCm,
        })),
      }
    })
  )

  createProductsWorkflow.runAsStep({ input: { products } })

  const handles = transform({ input }, ({ input }) => input.productos.map((p) => p.handle))

  const { data: creados } = useQueryGraphStep({
    entity: "product",
    fields: ["handle", "variants.sku", "variants.inventory_items.inventory_item_id"],
    filters: { handle: handles },
  })

  const inventory_levels = transform({ input, contexto, creados }, ({ input, contexto, creados }) => {
    const existenciaPorSku = new Map<string, number>()
    for (const p of input.productos) for (const v of p.variantes) existenciaPorSku.set(v.sku, v.existencia)

    const niveles: { inventory_item_id: string; location_id: string; stocked_quantity: number }[] = []
    for (const producto of creados as any[]) {
      for (const variante of producto.variants ?? []) {
        const itemId = variante.inventory_items?.[0]?.inventory_item_id
        if (!itemId) throw new Error(`La variante ${variante.sku} no tiene inventory item`)
        niveles.push({
          inventory_item_id: itemId,
          location_id: contexto.locationId,
          stocked_quantity: existenciaPorSku.get(variante.sku) ?? 0,
        })
      }
    }
    return niveles
  })

  createInventoryLevelsWorkflow.runAsStep({ input: { inventory_levels } })

  return new WorkflowResponse({ handles })
})
