import path from "path"
import { expect, request as playwrightRequest, test } from "@playwright/test"
import {
  BACKEND_URL,
  borrarProductosFixture,
  EXCEL_VALIDO,
  fotosFixture,
  iniciarSesionAdmin,
  tokenAdmin,
} from "./helpers/admin"

const EXCEL_CON_ERRORES = path.join(
  __dirname,
  "..",
  "apps/backend/src/lib/catalog-import/__fixtures__/plantilla-con-errores.xlsx"
)
const PAGINA = `${BACKEND_URL}/app/carga-masiva`

test.describe.serial("Carga masiva en el admin", () => {
  test.beforeAll(async () => {
    const request = await playwrightRequest.newContext()
    await borrarProductosFixture(request)
    await request.dispose()
  })

  test.beforeEach(async ({ page }) => {
    await iniciarSesionAdmin(page)
    await page.goto(PAGINA)
    await expect(page.getByRole("heading", { name: "Carga masiva" })).toBeVisible({ timeout: 90_000 })
  })

  test("Descargar plantilla baja plantilla-catalogo-saint-drip.xlsx", async ({ page }) => {
    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Descargar plantilla" }).click(),
    ])
    expect(descarga.suggestedFilename()).toBe("plantilla-catalogo-saint-drip.xlsx")
  })

  test("un Excel con errores muestra 6 filas y no deja importar", async ({ page }) => {
    await page.getByLabel("Archivo Excel (.xlsx)").setInputFiles(EXCEL_CON_ERRORES)
    await page.getByRole("button", { name: "Validar" }).click()

    const tabla = page.locator("table").filter({ has: page.getByRole("columnheader", { name: "Columna" }) })
    await expect(tabla.locator("tbody tr")).toHaveCount(6)
    await expect(page.getByRole("button", { name: "Importar" })).toBeDisabled()
  })

  test("un Excel válido con sus 4 fotos se valida e importa", async ({ page }) => {
    await page.getByLabel("Archivo Excel (.xlsx)").setInputFiles(EXCEL_VALIDO)
    await page.getByLabel("Fotos (.jpg)").setInputFiles(fotosFixture())
    await page.getByRole("button", { name: "Validar" }).click()
    await expect(page.getByText("3 productos · 8 variantes")).toBeVisible()

    await page.getByRole("button", { name: "Importar" }).click()
    await expect(page.getByText("3 productos creados")).toBeVisible({ timeout: 60_000 })

    const request = await playwrightRequest.newContext()
    const headers = { Authorization: `Bearer ${await tokenAdmin(request)}` }
    const respuesta = await request.get(
      `${BACKEND_URL}/admin/products?handle=sd-hoodie-oversize-negro&fields=id,handle,*images`,
      { headers }
    )
    expect(respuesta.ok()).toBeTruthy()
    const { products } = await respuesta.json()
    expect(products).toHaveLength(1)
    expect(products[0].images).toHaveLength(2)
    await request.dispose()
  })
})
