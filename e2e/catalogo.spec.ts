import { expect, request as playwrightRequest, test } from "@playwright/test"
import { BACKEND_URL, borrarProductosFixture, importarFixture, tokenAdmin } from "./helpers/admin"

const PDP_HOODIE = "/mx/products/sd-hoodie-oversize-negro"
const PDP_PERFUME = "/mx/products/sd-perfume-noir-100"

test.describe.serial("Catálogo: inicio por categorías y PDP", () => {
  test.beforeAll(async () => {
    const request = await playwrightRequest.newContext()
    await borrarProductosFixture(request)
    await importarFixture(request)
    await request.dispose()
  })

  test("el PDP del hoodie sin JavaScript trae el precio y el JSON-LD Product", async ({ browser }) => {
    const contexto = await browser.newContext({ javaScriptEnabled: false })
    const page = await contexto.newPage()
    await page.goto(PDP_HOODIE)

    expect(await page.content()).toContain("$1,299.00")

    const bloques = await page.locator('script[type="application/ld+json"]').allTextContents()
    const datos = bloques.map((b) => JSON.parse(b))
    // D12: un solo bloque de producto en el PDP (sin el ProductGroup del starter).
    expect(datos.filter((d) => d["@type"] === "Product" || d["@type"] === "ProductGroup")).toHaveLength(1)
    const producto = datos.find((d) => d["@type"] === "Product" && d.offers)
    expect(producto, "JSON-LD @type Product con offers").toBeTruthy()
    expect(producto.offers.price).toBe("1299.00")
    expect(producto.offers.priceCurrency).toBe("MXN")
    expect(producto.brand).toEqual({ "@type": "Brand", name: "Saint Drip" })
    await contexto.close()
  })

  test("el inicio muestra ROPA y TENIS y omite las categorías sin productos publicados", async ({ page }) => {
    // D13: los carriles salen de la caché de catálogo (≤ 60 s); tras reimportar el fixture se recarga hasta 90 s.
    await expect(async () => {
      await page.goto("/mx")
      await expect(page.getByRole("heading", { level: 1, name: "Exclusividad en cada prenda" })).toBeVisible()
      await expect(page.getByRole("heading", { level: 2, name: "ROPA" })).toBeVisible()
      await expect(page.getByRole("heading", { level: 2, name: "TENIS" })).toBeVisible()
      // El perfume del fixture es borrador: su categoría no tiene productos publicados.
      await expect(page.getByRole("heading", { level: 2, name: "PERFUMES" })).toHaveCount(0)
    }).toPass({ timeout: 90_000, intervals: [5_000] })
  })

  test("un producto solo_terrestre publicado muestra la insignia en su PDP", async ({ page }) => {
    const request = await playwrightRequest.newContext()
    const headers = { Authorization: `Bearer ${await tokenAdmin(request)}` }
    const lista = await request.get(`${BACKEND_URL}/admin/products?handle=sd-perfume-noir-100`, { headers })
    const { products } = await lista.json()
    const publicar = await request.post(`${BACKEND_URL}/admin/products/${products[0].id}`, {
      headers,
      data: { status: "published" },
    })
    expect(publicar.ok()).toBeTruthy()
    await request.dispose()

    // D13: el PDP del perfume pudo quedar en caché como borrador; se recarga hasta 90 s.
    await expect(async () => {
      await page.goto(PDP_PERFUME)
      await expect(page.getByText("Solo envío terrestre")).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 90_000, intervals: [5_000] })
  })
})
