import AxeBuilder from "@axe-core/playwright"
import { expect, request as playwrightRequest, test } from "@playwright/test"
import { BACKEND_URL, importarFixture, tokenAdmin } from "./helpers/admin"

// Auditoría automática WCAG 2.2 AA (blueprint §15 y paso 15).
const PAGINAS = ["/mx", "/mx/store", "/mx/products/sd-hoodie-oversize-negro"]

// Este archivo corre antes que catalogo.spec.ts (orden alfabético): garantiza que el catálogo del fixture exista.
test.beforeAll(async () => {
  const request = await playwrightRequest.newContext()
  const headers = { Authorization: `Bearer ${await tokenAdmin(request)}` }
  const lista = await request.get(`${BACKEND_URL}/admin/products?handle=sd-hoodie-oversize-negro`, { headers })
  const { products } = await lista.json()
  if (products.length === 0) await importarFixture(request)
  await request.dispose()
})

for (const ruta of PAGINAS) {
  test(`axe: ${ruta} sin violaciones WCAG 2.2 AA`, async ({ page }) => {
    await page.goto(ruta)
    await page.waitForLoadState("networkidle")

    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze()

    const resumen = violations.map((v) => ({
      id: v.id,
      impacto: v.impact,
      nodos: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
    }))
    expect(resumen, JSON.stringify(resumen, null, 2)).toEqual([])
  })
}
