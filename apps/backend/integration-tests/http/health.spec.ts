import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  env: {},
  testSuite: ({ api }) => {
    describe("GET /health", () => {
      it("responde 200", async () => {
        const response = await api.get("/health")
        expect(response.status).toEqual(200)
      })
    })
  },
})
