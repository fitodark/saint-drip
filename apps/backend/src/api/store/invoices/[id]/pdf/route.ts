// GET /store/invoices/:id/pdf — descarga el PDF de un CFDI propio (blueprint §5).
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { FACTURAPI_MODULE } from "../../../../../modules/facturapi"
import type FacturapiModuleService from "../../../../../modules/facturapi/service"

const noEsTuya = (res: MedusaResponse) =>
  res.status(403).json({ codigo: "E_NO_ES_TU_PEDIDO", mensaje: "La factura no pertenece a tu cuenta" })

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const facturapi = req.scope.resolve<FacturapiModuleService>(FACTURAPI_MODULE)
  const [cfdi] = await facturapi.listCfdiInvoices({ id: req.params.id })
  if (!cfdi || cfdi.kind !== "individual" || !cfdi.order_id) return noEsTuya(res)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: pedidos } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id"],
    filters: { id: cfdi.order_id },
  })
  if (pedidos[0]?.customer_id !== req.auth_context.actor_id) return noEsTuya(res)

  let pdf: Buffer
  try {
    pdf = await facturapi.gateway().pdf(cfdi.facturapi_id)
  } catch (e) {
    return res.status(502).json({ codigo: "E_PAC", mensaje: e instanceof Error ? e.message : "FacturAPI no devolvió el PDF" })
  }
  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", `attachment; filename="cfdi-${cfdi.uuid}.pdf"`)
  res.status(200).send(pdf)
}
