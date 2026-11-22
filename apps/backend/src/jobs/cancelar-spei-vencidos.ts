// Cada hora: cancela los pedidos SPEI vencidos sin pago (libera la reserva de inventario) y concilia los
// pedidos con tarjeta o PayPal que siguen sin captura (blueprint paso 18).
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows"
import * as Sentry from "@sentry/node"
import { pedidosSinPago, speiVencidos } from "../lib/reconciliacion"

// Ventana de pedidos que se revisan. SPEI vence en 72 h, así que un pedido más viejo ya se habría cancelado.
const VENTANA_DIAS = 30

type PagoConsultado = { provider_id?: string; captured_at?: string | Date | null; data?: Record<string, unknown> | null }
type PedidoConsultado = {
  id: string
  status: string
  created_at: string | Date
  payment_collections?: { status?: string; payments?: PagoConsultado[] }[]
}

export default async function cancelarSpeiVencidos(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const ahora = new Date()

  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "created_at",
      "payment_collections.status",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.data",
    ],
    filters: { created_at: { $gte: new Date(ahora.getTime() - VENTANA_DIAS * 24 * 60 * 60 * 1000) } },
  })
  const pedidos = (data as PedidoConsultado[]).filter((p) => p.status !== "canceled")

  const pagos = pedidos.flatMap((pedido) =>
    (pedido.payment_collections ?? []).flatMap((pc) =>
      (pc.payments ?? []).map((pago) => ({
        order_id: pedido.id,
        provider_id: String(pago.provider_id ?? ""),
        captured: Boolean(pago.captured_at) || pc.status === "completed",
        vence_en: String(pago.data?.vence_en ?? ""),
      }))
    )
  )

  for (const orderId of speiVencidos(pagos, ahora)) {
    try {
      await cancelOrderWorkflow(container).run({ input: { order_id: orderId } })
      logger.info(`spei.vencido ${orderId}`)
    } catch (e) {
      logger.error(`spei.vencido ${orderId}: no se pudo cancelar: ${e instanceof Error ? e.message : e}`)
    }
  }

  const sinPago = pedidosSinPago(
    pedidos.map((pedido) => {
      const colecciones = pedido.payment_collections ?? []
      const pagosDelPedido = colecciones.flatMap((pc) => pc.payments ?? [])
      return {
        id: pedido.id,
        created_at: new Date(pedido.created_at),
        tiene_pago_capturado:
          colecciones.some((pc) => pc.status === "completed") || pagosDelPedido.some((p) => Boolean(p.captured_at)),
        proveedor: String(pagosDelPedido[0]?.provider_id ?? ""),
      }
    }),
    ahora
  )
  const mensaje = `reconciliacion: ${sinPago.length} pedidos sin pago`
  logger.info(mensaje)
  if (sinPago.length > 0) Sentry.captureMessage(mensaje, { level: "warning", extra: { pedidos: sinPago } })
}

export const config = {
  name: "cancelar-spei-vencidos",
  schedule: "0 * * * *",
}
