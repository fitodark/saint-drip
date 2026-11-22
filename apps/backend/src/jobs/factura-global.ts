// Factura global mensual al público en general (blueprint paso 11): ventas pagadas del mes anterior sin CFDI.
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { construirFacturaGlobal, limitesPeriodo, periodoAnterior, RECEPTOR_PUBLICO_GENERAL } from "../lib/cfdi/reglas"
import { FACTURAPI_MODULE } from "../modules/facturapi"
import type FacturapiModuleService from "../modules/facturapi/service"

type NuevoCfdiGlobal = { period: string; order_ids: string[]; facturapi_id: string; uuid: string; total: number }

const guardarCfdiGlobalStep = createStep(
  "guardar-cfdi-global",
  async (input: NuevoCfdiGlobal, { container }) => {
    const facturapi = container.resolve<FacturapiModuleService>(FACTURAPI_MODULE)
    const [cfdi] = await facturapi.createCfdiInvoices([
      {
        kind: "global",
        period: input.period,
        order_ids: { ids: input.order_ids },
        facturapi_id: input.facturapi_id,
        uuid: input.uuid,
        rfc: RECEPTOR_PUBLICO_GENERAL.rfc,
        total: input.total,
      },
    ])
    return new StepResponse(cfdi, cfdi.id)
  },
  async (id, { container }) => {
    if (!id) return
    await container.resolve<FacturapiModuleService>(FACTURAPI_MODULE).deleteCfdiInvoices([id])
  }
)

export const guardarCfdiGlobalWorkflow = createWorkflow("guardar-cfdi-global", (input: NuevoCfdiGlobal) => {
  return new WorkflowResponse(guardarCfdiGlobalStep(input))
})

export default async function facturaGlobal(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const facturapi = container.resolve<FacturapiModuleService>(FACTURAPI_MODULE)

  const periodo = periodoAnterior(new Date())

  const existentes = await facturapi.listCfdiInvoices({ kind: "global", period: periodo.periodo })
  if (existentes.length > 0) {
    logger.info(`factura-global: ya existe ${periodo.periodo}`)
    return
  }

  // Pedidos ya incluidos en cualquier CFDI (individual o global).
  const facturados = new Set<string>()
  for (const cfdi of await facturapi.listCfdiInvoices({})) {
    for (const id of ((cfdi.order_ids as { ids?: string[] } | null)?.ids ?? [])) facturados.add(id)
  }

  const { desde, hasta } = limitesPeriodo(periodo)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "total", "payment_collections.status"],
    filters: { created_at: { $gte: desde, $lt: hasta } },
  })
  const pedidos = (data as any[])
    .filter((o) => !facturados.has(o.id))
    .filter((o) => (o.payment_collections ?? []).some((pc: { status?: string }) => pc?.status === "completed"))
    .map((o) => ({ id: String(o.id), display_id: Number(o.display_id), total: Number(o.total) }))

  const cfdi = construirFacturaGlobal(pedidos, periodo)
  if (!cfdi) {
    logger.info(`factura-global: ${periodo.periodo} 0 pedidos`)
    return
  }

  const timbrado = await facturapi.gateway().timbrar(cfdi)
  await guardarCfdiGlobalWorkflow(container).run({
    input: {
      period: periodo.periodo,
      order_ids: pedidos.map((p) => p.id),
      facturapi_id: timbrado.id,
      uuid: timbrado.uuid,
      total: pedidos.reduce((suma, p) => suma + p.total, 0),
    },
  })
  logger.info(`factura-global: ${periodo.periodo} ${pedidos.length} pedidos`)
}

// Día 1 de cada mes a las 09:00 UTC = 03:00 en Ciudad de México (UTC−6, sin horario de verano desde 2022).
export const config = {
  name: "factura-global",
  schedule: "0 9 1 * *",
}
