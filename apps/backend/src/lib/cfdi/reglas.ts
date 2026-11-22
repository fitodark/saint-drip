// Reglas de facturación CFDI (blueprint §5 y pasos 10-11). TypeScript puro: sin dependencias de Medusa.
// El import de abajo es solo de tipo y se borra al compilar.
import type { CfdiEntrada } from "../../modules/facturapi/gateway"

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

// Mes calendario anterior al de `ahora`, en la hora de Ciudad de México.
export function periodoAnterior(ahora: Date): { periodo: string; mes: string; anio: number } {
  const [anioActual, mesActual] = periodoDe(ahora).split("-").map(Number)
  const anio = mesActual === 1 ? anioActual - 1 : anioActual
  const mes = String(mesActual === 1 ? 12 : mesActual - 1).padStart(2, "0")
  return { periodo: `${anio}-${mes}`, mes, anio }
}

// Límites UTC [inicio, fin) de un periodo YYYY-MM en Ciudad de México (UTC−6 todo el año desde 2022).
export function limitesPeriodo(periodo: { mes: string; anio: number }): { desde: Date; hasta: Date } {
  const mes = Number(periodo.mes)
  return {
    desde: new Date(Date.UTC(periodo.anio, mes - 1, 1, 6)),
    hasta: new Date(Date.UTC(periodo.anio, mes, 1, 6)),
  }
}

export const RECEPTOR_PUBLICO_GENERAL = {
  rfc: "XAXX010101000",
  razon_social: "PUBLICO EN GENERAL",
  regimen_fiscal: "616",
  codigo_postal: "69000",
}

export function construirFacturaGlobal(
  pedidos: { id: string; display_id: number; total: number }[],
  periodo: { mes: string; anio: number }
): CfdiEntrada | null {
  if (pedidos.length === 0) return null
  return {
    receptor: { ...RECEPTOR_PUBLICO_GENERAL },
    uso_cfdi: "S01",
    items: pedidos.map((p) => ({ descripcion: "Venta pedido #" + p.display_id, precio: p.total, cantidad: 1 })),
    global: { periodicidad: "month", mes: periodo.mes, anio: periodo.anio },
  }
}
