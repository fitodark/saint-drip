import { expect, request as playwrightRequest, test } from "@playwright/test"
import { BACKEND_URL, importarFixture, tokenAdmin } from "./helpers/admin"

// Paso 16: un cambio del admin llega al PDP en 90 s como máximo. Sin `revalidate: 60` en los fetch de catálogo,
// Next sirve la página con la caché de un año y el título nuevo nunca aparece.
const HANDLE = "sd-hoodie-oversize-negro"
const PDP = `/mx/products/${HANDLE}`

test("un cambio de título en el admin aparece en el PDP en 90 s como máximo", async ({ page }) => {
  test.setTimeout(240_000)
  const request = await playwrightRequest.newContext()
  const headers = { Authorization: `Bearer ${await tokenAdmin(request)}` }
  const buscarHoodie = async () => {
    const lista = await request.get(`${BACKEND_URL}/admin/products?handle=${HANDLE}&fields=id,title`, { headers })
    const { products } = await lista.json()
    return products[0] as { id: string; title: string } | undefined
  }
  let hoodie = await buscarHoodie()
  if (!hoodie) {
    await importarFixture(request)
    hoodie = await buscarHoodie()
  }
  if (!hoodie) throw new Error(`No existe el producto ${HANDLE}`)
  const tituloOriginal = hoodie.title
  const tituloNuevo = `${tituloOriginal} ${Date.now()}`

  // 1. Poblar la caché con el título original.
  await page.goto(PDP)
  await expect(page.getByTestId("product-title").first()).toHaveText(tituloOriginal, { timeout: 90_000 })

  try {
    // 2. Cambiar el título por la Admin API.
    const cambio = await request.post(`${BACKEND_URL}/admin/products/${hoodie.id}`, {
      headers,
      data: { title: tituloNuevo },
    })
    expect(cambio.ok()).toBe(true)

    // 3. El PDP muestra el título nuevo en 90 s como máximo.
    await expect(async () => {
      await page.goto(PDP)
      await expect(page.getByTestId("product-title").first()).toHaveText(tituloNuevo, { timeout: 5_000 })
    }).toPass({ timeout: 90_000, intervals: [5_000] })
  } finally {
    // 4. Restaurar el título original.
    await request.post(`${BACKEND_URL}/admin/products/${hoodie.id}`, { headers, data: { title: tituloOriginal } })
    await request.dispose()
  }
})
