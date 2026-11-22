import { Module } from "@medusajs/framework/utils"
import FacturapiModuleService from "./service"

export const FACTURAPI_MODULE = "facturapi"

export default Module(FACTURAPI_MODULE, {
  service: FacturapiModuleService,
})
