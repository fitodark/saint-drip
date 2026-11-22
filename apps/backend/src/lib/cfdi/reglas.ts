// Reglas de facturación CFDI (blueprint §5, POST /store/invoices). TypeScript puro: sin dependencias de Medusa.

const FORMATO_PERIODO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
})

// Periodo fiscal "YYYY-MM" en la hora de Ciudad de México.
export function periodoDe(fecha: Date): string {
  const partes = FORMATO_PERIODO.formatToParts(fecha)
  const anio = partes.find((p) => p.type === "year")?.value
  const mes = partes.find((p) => p.type === "month")?.value
  return `${anio}-${mes}`
}

export type ErrorSolicitud = { status: number; codigo: string; mensaje: string }

export function validarSolicitud(p: {
  pedido: { customer_id: string | null; created_at: Date; pago_capturado: boolean; ya_facturado: boolean }
  cliente_id: string
  ahora: Date
}): null | ErrorSolicitud {
  if (!p.pedido.customer_id || p.pedido.customer_id !== p.cliente_id) {
    return { status: 403, codigo: "E_NO_ES_TU_PEDIDO", mensaje: "El pedido no pertenece a tu cuenta" }
  }
  if (p.pedido.ya_facturado) {
    return { status: 409, codigo: "E_YA_FACTURADO", mensaje: "Este pedido ya tiene una factura" }
  }
  if (!p.pedido.pago_capturado) {
    return { status: 422, codigo: "E_PAGO_PENDIENTE", mensaje: "El pago del pedido aún no se recibe" }
  }
  if (periodoDe(p.pedido.created_at) !== periodoDe(p.ahora)) {
    return {
      status: 422,
      codigo: "E_FUERA_DE_PERIODO",
      mensaje: "Solo se pueden facturar pedidos del mes en curso; los anteriores van en la factura global",
    }
  }
  return null
}
