// Módulo CFDI: modelo cfdi_invoice (blueprint §4) + gateway FacturAPI (mock o live).
import { MedusaService } from "@medusajs/framework/utils"
import { crearFacturapiGateway, crearFacturapiGatewayMock, type FacturapiGateway } from "./gateway"
import { CfdiInvoice } from "./models/cfdi-invoice"

export type FacturapiOptions = { mode: "mock" | "live"; key?: string }

class FacturapiModuleService extends MedusaService({ CfdiInvoice }) {
  protected readonly gateway_: FacturapiGateway

  constructor(container: Record<string, unknown>, options: FacturapiOptions) {
    // eslint-disable-next-line prefer-rest-params
    super(...arguments)
    if (options?.mode === "live") {
      if (!options.key) throw new Error("FACTURAPI_KEY no configurado con FACTURAPI_MODE=live")
      this.gateway_ = crearFacturapiGateway(options.key)
    } else {
      this.gateway_ = crearFacturapiGatewayMock()
    }
  }

  gateway(): FacturapiGateway {
    return this.gateway_
  }
}

export default FacturapiModuleService
