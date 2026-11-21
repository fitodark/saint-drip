import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import SpeiPaymentService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [SpeiPaymentService],
})
