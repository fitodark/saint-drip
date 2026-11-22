// Envía la confirmación de pedido (con instrucciones SPEI si aplica) al emitirse order.placed.
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { confirmacionPedido, type DatosSpei } from "../lib/emails/templates"

const SPEI_PROVIDER = "pp_spei_spei"

export default async function orderPlacedHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const notificationModule = container.resolve(Modules.NOTIFICATION)

  const { data: pedidos } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "total",
      "items.*",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.data",
    ],
    filters: { id: data.id },
  })
  const pedido = pedidos[0] as any
  if (!pedido?.email) return

  const pagos = (pedido.payment_collections ?? []).flatMap((pc: any) => pc?.payments ?? [])
  const pagoSpei = pagos.find((p: any) => p?.provider_id === SPEI_PROVIDER)
  const spei: DatosSpei | undefined = pagoSpei?.data
    ? {
        clabe: String(pagoSpei.data.clabe ?? ""),
        banco: String(pagoSpei.data.banco ?? ""),
        referencia: String(pagoSpei.data.referencia ?? ""),
        vence_en: String(pagoSpei.data.vence_en ?? ""),
      }
    : undefined

  const storefront = process.env.STOREFRONT_URL ?? "http://localhost:8000"
  const content = confirmacionPedido({
    display_id: pedido.display_id,
    email: pedido.email,
    total: Number(pedido.total),
    items: (pedido.items ?? []).map((i: any) => ({
      titulo: i.product_title ?? i.title,
      variante: i.variant_title ?? i.subtitle ?? "",
      cantidad: Number(i.quantity),
      total: Number(i.total),
    })),
    urlPedido: `${storefront}/mx/order/${pedido.id}/confirmed`,
    spei,
  })

  await notificationModule.createNotifications({
    to: pedido.email,
    channel: "email",
    template: "confirmacion-pedido",
    content,
    resource_id: pedido.id,
    resource_type: "order",
  })
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
