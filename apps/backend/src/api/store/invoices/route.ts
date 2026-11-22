// POST /store/invoices — el cliente solicita el CFDI individual de su pedido (blueprint §5).
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { z } from "@medusajs/framework/zod"
import { validarSolicitud } from "../../../lib/cfdi/reglas"
import { facturaEmitida } from "../../../lib/emails/templates"
import { FACTURAPI_MODULE } from "../../../modules/facturapi"
import type FacturapiModuleService from "../../../modules/facturapi/service"

const SolicitudBody = z.object({
  order_id: z.string().min(1),
  rfc: z
    .string()
    .min(12)
    .max(13)
    .regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/),
  razon_social: z.string().trim().min(1),
  regimen_fiscal: z.string().regex(/^\d{3}$/),
  codigo_postal: z.string().regex(/^\d{5}$/),
  uso_cfdi: z.string().regex(/^[A-Z0-9]{3,4}$/),
})

type NuevoCfdi = { order_id: string; facturapi_id: string; uuid: string; rfc: string; total: number }

const guardarCfdiIndividualStep = createStep(
  "guardar-cfdi-individual",
  async (input: NuevoCfdi, { container }) => {
    const facturapi = container.resolve<FacturapiModuleService>(FACTURAPI_MODULE)
    const [cfdi] = await facturapi.createCfdiInvoices([
      {
        kind: "individual",
        order_id: input.order_id,
        order_ids: { ids: [input.order_id] },
        facturapi_id: input.facturapi_id,
        uuid: input.uuid,
        rfc: input.rfc,
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

export const guardarCfdiIndividualWorkflow = createWorkflow("guardar-cfdi-individual", (input: NuevoCfdi) => {
  const cfdi = guardarCfdiIndividualStep(input)
  return new WorkflowResponse(cfdi)
})

const error = (res: MedusaResponse, status: number, codigo: string, mensaje: string) =>
  res.status(status).json({ codigo, mensaje })

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const cuerpo = SolicitudBody.safeParse(req.body)
  if (!cuerpo.success) return error(res, 400, "E_CUERPO", "Los datos fiscales no son válidos")
  const datos = cuerpo.data
  const clienteId = req.auth_context.actor_id

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: pedidos } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "customer_id",
      "created_at",
      "total",
      "items.title",
      "items.quantity",
      "items.total",
      "payment_collections.status",
    ],
    filters: { id: datos.order_id },
  })
  const pedido = pedidos[0] as any
  if (!pedido) return error(res, 403, "E_NO_ES_TU_PEDIDO", "El pedido no pertenece a tu cuenta")

  const facturapi = req.scope.resolve<FacturapiModuleService>(FACTURAPI_MODULE)
  const existentes = await facturapi.listCfdiInvoices({ order_id: pedido.id, kind: "individual" })

  const falla = validarSolicitud({
    pedido: {
      customer_id: pedido.customer_id ?? null,
      created_at: new Date(pedido.created_at),
      pago_capturado: (pedido.payment_collections ?? []).some((pc: { status?: string }) => pc?.status === "completed"),
      ya_facturado: existentes.length > 0,
    },
    cliente_id: clienteId,
    ahora: new Date(),
  })
  if (falla) return error(res, falla.status, falla.codigo, falla.mensaje)

  let timbrado: { id: string; uuid: string; total: number }
  try {
    timbrado = await facturapi.gateway().timbrar({
      receptor: {
        rfc: datos.rfc,
        razon_social: datos.razon_social,
        regimen_fiscal: datos.regimen_fiscal,
        codigo_postal: datos.codigo_postal,
      },
      uso_cfdi: datos.uso_cfdi,
      items: (pedido.items ?? []).map((i: { title: string; quantity: unknown; total: unknown }) => ({
        descripcion: i.title,
        cantidad: Number(i.quantity),
        precio: Number(i.total) / Number(i.quantity),
      })),
    })
  } catch (e) {
    return error(res, 502, "E_PAC", e instanceof Error ? e.message : "FacturAPI rechazó la factura")
  }

  try {
    const { result } = await guardarCfdiIndividualWorkflow(req.scope).run({
      input: {
        order_id: pedido.id,
        facturapi_id: timbrado.id,
        uuid: timbrado.uuid,
        rfc: datos.rfc,
        total: timbrado.total,
      },
    })
    await enviarFacturaEmitida(req, pedido, result.uuid)
    return res.status(201).json({ id: result.id, uuid: result.uuid })
  } catch (e) {
    // El índice único parcial sobre order_id resuelve dos solicitudes simultáneas del mismo pedido.
    // D18: solo un choque sobre order_id significa "ya facturado"; cualquier otro error se propaga.
    if (e instanceof Error && /order_id/i.test(e.message) && /unique|duplicate|already exists/i.test(e.message)) {
      return error(res, 409, "E_YA_FACTURADO", "Este pedido ya tiene una factura")
    }
    throw e
  }
}

// Desviación D10: §5 pide el correo "factura emitida" como efecto de esta ruta. El enlace lleva a la página
// del pedido en la tienda (allí está "Descargar PDF", paso 17): la ruta del PDF exige sesión de cliente.
// Un fallo del correo no revierte la respuesta: el CFDI ya está timbrado y guardado.
async function enviarFacturaEmitida(
  req: AuthenticatedMedusaRequest,
  pedido: { id: string; display_id: number; email?: string | null },
  uuid: string
) {
  if (!pedido.email) return
  const storefront = process.env.STOREFRONT_URL ?? "http://localhost:8000"
  try {
    await req.scope.resolve(Modules.NOTIFICATION).createNotifications({
      to: pedido.email,
      channel: "email",
      template: "factura-emitida",
      content: facturaEmitida({
        display_id: pedido.display_id,
        uuid,
        urlPdf: `${storefront}/mx/account/orders/details/${pedido.id}`,
      }),
      resource_id: pedido.id,
      resource_type: "order",
    })
  } catch (e) {
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`factura-emitida: no se pudo enviar el correo del pedido ${pedido.id}: ${e instanceof Error ? e.message : e}`)
  }
}
