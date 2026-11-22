// Reglas de conciliación de pagos (blueprint paso 18). TypeScript puro: sin dependencias de Medusa.

const SPEI = "pp_spei_spei"
// Proveedores que cobran en línea al completar el carrito: un pedido suyo sin captura tras 1 h es anómalo.
const PROVEEDORES_EN_LINEA = new Set(["pp_stripe_stripe", "pp_paypal_paypal"])
const UNA_HORA_MS = 60 * 60 * 1000

// Pedidos SPEI cuyo pago no se capturó y cuya fecha límite ya pasó.
export function speiVencidos(
  pagos: { order_id: string; provider_id: string; captured: boolean; vence_en: string }[],
  ahora: Date
): string[] {
  const vencidos = new Set<string>()
  for (const pago of pagos) {
    if (pago.provider_id !== SPEI || pago.captured) continue
    const limite = new Date(pago.vence_en).getTime()
    if (Number.isFinite(limite) && limite < ahora.getTime()) vencidos.add(pago.order_id)
  }
  return [...vencidos]
}

// Pedidos con tarjeta o PayPal que llevan más de 1 h sin pago capturado.
export function pedidosSinPago(
  pedidos: { id: string; created_at: Date; tiene_pago_capturado: boolean; proveedor: string }[],
  ahora: Date
): string[] {
  return pedidos
    .filter(
      (p) =>
        PROVEEDORES_EN_LINEA.has(p.proveedor) &&
        !p.tiene_pago_capturado &&
        ahora.getTime() - new Date(p.created_at).getTime() > UNA_HORA_MS
    )
    .map((p) => p.id)
}
