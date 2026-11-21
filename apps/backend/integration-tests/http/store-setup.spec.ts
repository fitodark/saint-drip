import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import seedSaintDrip, { SEED } from "../../src/scripts/seed-saint-drip"

jest.setTimeout(240 * 1000)

// Sin `inApp`: la opción no existe en @medusajs/test-utils 2.23.0 (desviación D2).
medusaIntegrationTestRunner({
  env: {},
  testSuite: ({ getContainer }) => {
    describe("seed-saint-drip", () => {
      it("es idempotente: dos ejecuciones dejan una sola configuración", async () => {
        const container = getContainer()
        await seedSaintDrip({ container, args: [] } as any)
        await seedSaintDrip({ container, args: [] } as any)

        const query = container.resolve(ContainerRegistrationKeys.QUERY)

        const { data: regions } = await query.graph({
          entity: "region",
          fields: ["id", "name", "currency_code"],
          filters: { name: SEED.region },
        })
        expect(regions).toHaveLength(1)
        expect(regions[0].currency_code).toEqual("mxn")

        const handles = SEED.categories.map((c) => c.handle)
        const { data: categories } = await query.graph({
          entity: "product_category",
          fields: ["id", "handle"],
          filters: { handle: handles },
        })
        expect(categories.map((c: { handle: string }) => c.handle).sort()).toEqual([...handles].sort())

        const { data: locations } = await query.graph({
          entity: "stock_location",
          fields: ["id", "name"],
          filters: { name: SEED.stockLocation },
        })
        expect(locations).toHaveLength(1)

        const { data: users } = await query.graph({
          entity: "user",
          fields: ["id", "email"],
          filters: { email: SEED.adminEmail },
        })
        expect(users).toHaveLength(1)

        const { data: keys } = await query.graph({
          entity: "api_key",
          fields: ["id", "title", "type"],
          filters: { title: SEED.publishableKeyTitle, type: "publishable" },
        })
        expect(keys).toHaveLength(1)
      })
    })
  },
})
