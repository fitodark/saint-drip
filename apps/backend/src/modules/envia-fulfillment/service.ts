// Proveedor de fulfillment Envia.com (blueprint paso 8): cotización en vivo, guía y cancelación.
import { AbstractFulfillmentProviderService, MedusaError } from "@medusajs/framework/utils"
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CreateFulfillmentResult,
  FulfillmentOption,
} from "@medusajs/framework/types"
import {
  crearEnviaGateway,
  crearEnviaGatewayMock,
  type EnviaGateway,
  type SolicitudCotizacion,
  type Tarifa,
  type TipoEnvio,
} from "./gateway"

export type EnviaOptions = {
  environment: "mock" | "sandbox" | "production"
  token?: string
  origenCp: string
}

export const OPCIONES_ENVIA = [
  { id: "envia-terrestre", name: "Envío terrestre" },
  { id: "envia-express", name: "Envío express" },
] as const

const TIPO_POR_OPCION: Record<string, TipoEnvio> = { "envia-terrestre": "terrestre", "envia-express": "express" }

export const MENSAJE_SOLO_TERRESTRE = "Este pedido contiene productos que solo pueden enviarse por tierra"

// Busca la metadata de productos por id. Desviación D9: Medusa 2.23 no incluye la metadata del producto
// en el contexto de calculatePrice (cartFieldsForCalculateShippingOptionsPrices), así que se consulta aparte.
export type BuscarMetadataProductos = (productIds: string[]) => Promise<Record<string, Record<string, unknown> | null>>

type Knex = (tabla: string) => {
  select(...cols: string[]): { whereIn(col: string, vals: string[]): { whereNull(col: string): Promise<{ id: string; metadata: unknown }[]> } }
}

// Lee de la tabla product por la conexión compartida (__pg_connection__) que Medusa registra en el contenedor
// de cada módulo, porque un proveedor de fulfillment no puede resolver el módulo de productos.
export const metadataDesdePg =
  (container: Record<string, unknown>): BuscarMetadataProductos =>
  async (productIds) => {
    const pg = container["__pg_connection__"] as Knex | undefined
    if (!pg || productIds.length === 0) return {}
    const filas = await pg("product").select("id", "metadata").whereIn("id", productIds).whereNull("deleted_at")
    const porId: Record<string, Record<string, unknown> | null> = {}
    for (const f of filas) {
      const m = typeof f.metadata === "string" ? JSON.parse(f.metadata) : f.metadata
      porId[f.id] = (m as Record<string, unknown> | null) ?? null
    }
    return porId
  }

type ItemContexto = {
  quantity?: unknown
  product_id?: string | null
  product?: { id?: string | null } | null
  variant?: {
    weight?: number | null
    length?: number | null
    width?: number | null
    height?: number | null
    product?: { id?: string | null; metadata?: Record<string, unknown> | null } | null
  } | null
}

class EnviaFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "envia"

  protected readonly options_: EnviaOptions
  protected readonly gateway_?: EnviaGateway
  protected readonly buscarMetadata_: BuscarMetadataProductos

  constructor(
    container: Record<string, unknown>,
    options: EnviaOptions,
    deps?: { gateway?: EnviaGateway; buscarMetadata?: BuscarMetadataProductos }
  ) {
    super()
    this.options_ = options
    this.buscarMetadata_ = deps?.buscarMetadata ?? metadataDesdePg(container)
    if (deps?.gateway) {
      this.gateway_ = deps.gateway
    } else if (options.environment === "mock") {
      this.gateway_ = crearEnviaGatewayMock()
    } else if (options.token) {
      this.gateway_ = crearEnviaGateway({ token: options.token, environment: options.environment })
    }
  }

  private gateway(): EnviaGateway {
    if (!this.gateway_) throw new MedusaError(MedusaError.Types.INVALID_DATA, "ENVIA_API_TOKEN no configurado")
    return this.gateway_
  }

  private tipo(data: Record<string, unknown>): TipoEnvio {
    const tipo = TIPO_POR_OPCION[String(data?.id ?? "")]
    if (!tipo) throw new MedusaError(MedusaError.Types.INVALID_DATA, `Opción de envío Envia desconocida: ${data?.id}`)
    return tipo
  }

  // true si algún item es solo_terrestre: primero la metadata del contexto (lo que pide el blueprint) y,
  // para los items que no la traen, la metadata consultada por product_id (D9).
  private async haySoloTerrestre(items: ItemContexto[]): Promise<boolean> {
    if (items.some((i) => i.variant?.product?.metadata?.solo_terrestre === true)) return true
    const sinMetadata = items.filter((i) => !i.variant?.product?.metadata)
    const ids = [
      ...new Set(
        sinMetadata
          .map((i) => i.variant?.product?.id ?? i.product?.id ?? i.product_id)
          .filter((id): id is string => typeof id === "string" && id !== "")
      ),
    ]
    if (ids.length === 0) return false
    const porId = await this.buscarMetadata_(ids)
    return ids.some((id) => porId[id]?.solo_terrestre === true)
  }

  // Un solo paquete: peso total en kg, el mayor largo y ancho y la suma de las alturas.
  private paquete(items: ItemContexto[], destinoCp: string, destinoEstado: string): SolicitudCotizacion {
    let pesoG = 0
    let largoCm = 0
    let anchoCm = 0
    let altoCm = 0
    for (const item of items) {
      const cantidad = Number(item.quantity ?? 1)
      const v = item.variant ?? {}
      pesoG += Number(v.weight ?? 0) * cantidad
      largoCm = Math.max(largoCm, Number(v.length ?? 0))
      anchoCm = Math.max(anchoCm, Number(v.width ?? 0))
      altoCm += Number(v.height ?? 0) * cantidad
    }
    return {
      origenCp: this.options_.origenCp,
      destinoCp,
      destinoEstado,
      pesoKg: pesoG / 1000,
      largoCm: Math.max(largoCm, 1),
      anchoCm: Math.max(anchoCm, 1),
      altoCm: Math.max(altoCm, 1),
    }
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return OPCIONES_ENVIA.map((o) => ({ ...o }))
  }

  async validateOption(data: Record<string, unknown>): Promise<boolean> {
    return String(data?.id ?? "") in TIPO_POR_OPCION
  }

  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!(await this.validateOption(optionData))) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, `Opción de envío Envia desconocida: ${optionData?.id}`)
    }
    return { ...data, id: optionData.id }
  }

  async canCalculate(): Promise<boolean> {
    return true
  }

  async calculatePrice(
    optionData: CalculateShippingOptionPriceDTO["optionData"],
    _data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    const tipo = this.tipo(optionData)
    const items = (context?.items ?? []) as unknown as ItemContexto[]

    if (tipo === "express" && (await this.haySoloTerrestre(items))) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, MENSAJE_SOLO_TERRESTRE)
    }

    const gateway = this.gateway()
    const destino = context?.shipping_address
    const tarifas = await gateway.cotizar(
      this.paquete(items, String(destino?.postal_code ?? ""), String(destino?.province ?? ""))
    )
    const delTipo = tarifas.filter((t) => t.tipo === tipo)
    if (delTipo.length === 0) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Sin tarifas de Envia para este código postal")
    }
    const masBarata = delTipo.reduce((a, b) => (b.total < a.total ? b : a))
    return { calculated_amount: masBarata.total, is_calculated_price_tax_inclusive: true }
  }

  async createFulfillment(
    data: Record<string, unknown>,
    items: Record<string, any>[],
    order: Record<string, any> | undefined
  ): Promise<CreateFulfillmentResult> {
    const tipo = this.tipo(data)
    const direccion = order?.shipping_address ?? {}
    const lineas = new Map<string, Record<string, any>>()
    for (const linea of order?.items ?? []) lineas.set(linea.id, linea)
    const itemsContexto: ItemContexto[] = items.map((i) => ({
      quantity: i.quantity,
      variant: lineas.get(i.line_item_id)?.variant ?? null,
    }))

    const gateway = this.gateway()
    const paquete = this.paquete(itemsContexto, String(direccion.postal_code ?? ""), String(direccion.province ?? ""))
    const tarifas = (await gateway.cotizar(paquete)).filter((t) => t.tipo === tipo)
    const tarifa: Tarifa =
      tarifas.length > 0
        ? tarifas.reduce((a, b) => (b.total < a.total ? b : a))
        : { carrier: String(data.carrier ?? ""), servicio: String(data.servicio ?? ""), tipo, total: 0, dias: "" }

    const guia = await gateway.generarGuia({
      ...paquete,
      ...tarifa,
      destino: {
        nombre: [direccion.first_name, direccion.last_name].filter(Boolean).join(" "),
        telefono: direccion.phone,
        email: order?.email,
        calle: [direccion.address_1, direccion.address_2].filter(Boolean).join(" "),
        ciudad: direccion.city,
        estado: direccion.province,
        cp: String(direccion.postal_code ?? ""),
        pais: String(direccion.country_code ?? "mx").toUpperCase(),
      },
    })

    return {
      data: { ...data, tracking: guia.tracking, carrier: guia.carrier },
      labels: [{ tracking_number: guia.tracking, tracking_url: guia.rastreoUrl, label_url: guia.etiquetaUrl }],
    }
  }

  async cancelFulfillment(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (typeof data?.tracking === "string" && typeof data?.carrier === "string") {
      await this.gateway().cancelarGuia(data.tracking, data.carrier)
    }
    return data
  }
}

export default EnviaFulfillmentService
