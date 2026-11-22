// Envía el aviso de envío con número y URL de rastreo al emitirse shipment.created (data.id = fulfillment).
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { envioGenerado } from "../lib/emails/templates"

export default async function shipmentCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string; no_notification?: boolean }>) {
  if (data.no_notification) return
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const notificationModule = container.resolve(Modules.NOTIFICATION)

  const { data: fulfillments } = await query.graph({
    entity: "fulfillment",
    fields: ["id", "data", "labels.*", "order.id", "order.display_id", "order.email"],
    filters: { id: data.id },
  })
  const fulfillment = fulfillments[0] as any
  const pedido = fulfillment?.order
  const etiqueta = fulfillment?.labels?.[0]
  if (!pedido?.email || !etiqueta) return

  const content = envioGenerado({
    display_id: pedido.display_id,
    carrier: String(fulfillment.data?.carrier ?? ""),
    tracking: etiqueta.tracking_number,
    rastreoUrl: etiqueta.tracking_url,
  })

  await notificationModule.createNotifications({
    to: pedido.email,
    channel: "email",
    template: "envio-generado",
    content,
    resource_id: pedido.id,
    resource_type: "order",
  })
}

export const config: SubscriberConfig = {
  event: "shipment.created",
}
