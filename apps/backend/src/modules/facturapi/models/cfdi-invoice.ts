import { model } from "@medusajs/framework/utils"

export const CfdiInvoice = model
  .define("cfdi_invoice", {
    id: model.id({ prefix: "cfdi" }).primaryKey(),
    kind: model.enum(["individual", "global"]),
    order_id: model.text().nullable(),
    period: model.text().nullable(),
    order_ids: model.json().default({ ids: [] }),
    facturapi_id: model.text().unique(),
    uuid: model.text(),
    rfc: model.text(),
    total: model.bigNumber(),
    status: model.enum(["issued", "cancelled"]).default("issued"),
  })
  .indexes([
    { on: ["order_id"], unique: true, where: "kind = 'individual' AND deleted_at IS NULL" },
    { on: ["period"], unique: true, where: "kind = 'global' AND deleted_at IS NULL" },
  ])
