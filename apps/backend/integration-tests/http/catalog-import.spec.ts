import fs from "fs"
import path from "path"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import seedSaintDrip, { SEED } from "../../src/scripts/seed-saint-drip"

jest.setTimeout(240 * 1000)

const archivo_base64 = fs
  .readFileSync(path.join(__dirname, "../../src/lib/catalog-import/__fixtures__/plantilla-valida.xlsx"))
  .toString("base64")

const NOMBRES_FOTOS = [
  "sd-hoodie-oversize-negro-1.jpg",
  "sd-hoodie-oversize-negro-2.jpg",
  "sd-tenis-urban-blanco-1.jpg",
  "sd-perfume-noir-100-1.jpg",
]
const fotosConUrl = Object.fromEntries(NOMBRES_FOTOS.map((n) => [n, `http://localhost:9000/static/${n}`]))
const HANDLES = ["sd-hoodie-oversize-negro", "sd-tenis-urban-blanco", "sd-perfume-noir-100"]

// Sin `inApp`: la opción no existe en @medusajs/test-utils 2.23.0 (desviación D2).
medusaIntegrationTestRunner({
  env: {},
  testSuite: ({ api, getContainer }) => {
    let headers: Record<string, string>

    beforeEach(async () => {
      await seedSaintDrip({ container: getContainer(), args: [] } as any)
      const { data } = await api.post("/auth/user/emailpass", {
        email: SEED.adminEmail,
        password: process.env.SEED_ADMIN_PASSWORD ?? "saintdrip-dev",
      })
      headers = { Authorization: `Bearer ${data.token}` }
    })

    const contarProductos = async () => {
      const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const { data } = await query.graph({ entity: "product", fields: ["id"], filters: { handle: HANDLES } })
      return data.length
    }

    describe("/admin/catalog-import", () => {
      it("GET plantilla responde 200 con el xlsx", async () => {
        const response = await api.get("/admin/catalog-import/plantilla", { headers, responseType: "arraybuffer" })
        expect(response.status).toEqual(200)
        expect(response.headers["content-type"]).toContain(
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        expect(response.headers["content-disposition"]).toEqual(
          'attachment; filename="plantilla-catalogo-saint-drip.xlsx"'
        )
      })

      it("POST validar responde 200 con el reporte y no escribe", async () => {
        const response = await api.post(
          "/admin/catalog-import/validar",
          { archivo_base64, fotos: NOMBRES_FOTOS },
          { headers }
        )
        expect(response.status).toEqual(200)
        expect(response.data).toEqual(
          expect.objectContaining({ valido: true, productos: 3, variantes: 8, fotos_faltantes: [] })
        )
        expect(await contarProductos()).toEqual(0)
      })

      it("POST importar crea productos, variantes, precios e inventario", async () => {
        const response = await api.post(
          "/admin/catalog-import/importar",
          { archivo_base64, fotos: fotosConUrl },
          { headers }
        )
        expect(response.status).toEqual(200)
        expect(response.data.creados).toEqual(3)

        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data: perfumes } = await query.graph({
          entity: "product",
          fields: ["status", "metadata"],
          filters: { handle: "sd-perfume-noir-100" },
        })
        expect(perfumes[0].status).toEqual("draft")
        expect(perfumes[0].metadata?.solo_terrestre).toEqual(true)

        const { data: almacenes } = await query.graph({
          entity: "stock_location",
          fields: ["id"],
          filters: { name: SEED.stockLocation },
        })
        const { data: variantes } = await query.graph({
          entity: "product_variant",
          fields: [
            "sku",
            "prices.amount",
            "prices.currency_code",
            "inventory_items.inventory.location_levels.location_id",
            "inventory_items.inventory.location_levels.stocked_quantity",
          ],
          filters: { sku: "SD-HOOD-NEG-M" },
        })
        const variante = variantes[0] as any
        const nivel = variante.inventory_items[0].inventory.location_levels.find(
          (l: { location_id: string }) => l.location_id === almacenes[0].id
        )
        expect(nivel.stocked_quantity).toEqual(8)
        expect(variante.prices).toEqual(
          expect.arrayContaining([expect.objectContaining({ amount: 1299, currency_code: "mxn" })])
        )
      })

      it("un segundo POST importar responde 422 con E_HANDLE_EXISTE", async () => {
        const cuerpo = { archivo_base64, fotos: fotosConUrl }
        const primero = await api.post("/admin/catalog-import/importar", cuerpo, { headers })
        expect(primero.status).toEqual(200)

        const segundo = await api
          .post("/admin/catalog-import/importar", cuerpo, { headers })
          .catch((e: any) => e.response)
        expect(segundo.status).toEqual(422)
        expect(segundo.data.errores).toEqual(
          expect.arrayContaining([expect.objectContaining({ codigo: "E_HANDLE_EXISTE" })])
        )
        expect(await contarProductos()).toEqual(3)
      })

      it("POST validar sin token responde 401", async () => {
        const response = await api
          .post("/admin/catalog-import/validar", { archivo_base64, fotos: NOMBRES_FOTOS })
          .catch((e: any) => e.response)
        expect(response.status).toEqual(401)
      })
    })
  },
})
