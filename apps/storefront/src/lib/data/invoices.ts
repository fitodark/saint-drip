"use server"

// Solicitud de CFDI desde la cuenta del cliente (paso 17). D16: se usa fetch con las mismas cabeceras del
// SDK porque FetchError de @medusajs/js-sdk solo conserva `message`, y las rutas propias responden
// { codigo, mensaje } (§5). Así el formulario muestra el mensaje en español y distingue los dos 422.
import { getAuthHeaders } from "./cookies"

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"

export type DatosFiscales = {
  order_id: string
  rfc: string
  razon_social: string
  regimen_fiscal: string
  codigo_postal: string
  uso_cfdi: string
}

export type ResultadoFactura =
  | { ok: true; id: string; uuid: string }
  | { ok: false; codigo: string; mensaje: string }

export async function solicitarFactura(datos: DatosFiscales): Promise<ResultadoFactura> {
  const respuesta = await fetch(`${BACKEND_URL}/store/invoices`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
      ...(await getAuthHeaders()),
    },
    body: JSON.stringify(datos),
    cache: "no-store",
  }).catch(() => null)

  if (!respuesta) {
    return { ok: false, codigo: "E_RED", mensaje: "No pudimos conectar con la tienda. Intenta de nuevo." }
  }
  const cuerpo = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>
  if (respuesta.status === 201) {
    return { ok: true, id: String(cuerpo.id), uuid: String(cuerpo.uuid) }
  }
  if (respuesta.status === 401) {
    return { ok: false, codigo: "E_SESION", mensaje: "Tu sesión expiró. Inicia sesión de nuevo." }
  }
  return {
    ok: false,
    codigo: String(cuerpo.codigo ?? "E_DESCONOCIDO"),
    mensaje: String(cuerpo.mensaje ?? "No se pudo emitir la factura."),
  }
}
