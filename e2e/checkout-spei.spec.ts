import { expect, request as playwrightRequest, test, type Page } from "@playwright/test"
import { BACKEND_URL, importarFixture, tokenAdmin } from "./helpers/admin"
import { sinIngles } from "./helpers/idioma"

// Checkout México (paso 16): invitado con Envío terrestre + SPEI (mock) y regla solo_terrestre en el envío.
const DIRECCION = {
  email: "e2e+spei@saintdrip.local",
  nombre: "Cliente",
  apellido: "Prueba",
  calle: "Centro 1",
  ciudad: "Huajuapan de León",
  estado: "Oaxaca",
  cp: "69000",
  telefono: "9531720664",
}

const adminHeaders = async () => {
  const request = await playwrightRequest.newContext()
  const headers = { Authorization: `Bearer ${await tokenAdmin(request)}` }
  return { request, headers }
}

const productoPorHandle = async (handle: string) => {
  const { request, headers } = await adminHeaders()
  const respuesta = await request.get(`${BACKEND_URL}/admin/products?handle=${handle}`, { headers })
  const { products } = await respuesta.json()
  await request.dispose()
  return products[0] as { id: string; status: string } | undefined
}

// D13: el PDP del starter cachea sus datos con revalidate = 60 (§6: "la revalidación es la del starter").
// Los E2E de los pasos 5 y 15 borran y reimportan el fixture, que cambia los ids de variante, así que la
// primera visita puede traer la versión cacheada. Se recarga el PDP hasta que el carrito acepte la línea.
const agregarAlCarrito = async (page: Page, handle: string, opcion?: string) => {
  const limite = Date.now() + 90_000
  for (let intento = 1; ; intento++) {
    await page.goto(`/mx/products/${handle}`)
    const boton = page.getByTestId("add-product-button").first()
    try {
      if (opcion) {
        // Las tallas son radios accesibles: se pulsa su label (data-testid="option-button") con el texto exacto.
        await page.getByTestId("option-button").filter({ hasText: new RegExp("^" + opcion + "$") }).click({ timeout: 10_000 })
        await expect(page.getByRole("radio", { name: opcion, exact: true })).toBeChecked()
      }
      await expect(boton).toBeEnabled({ timeout: 10_000 })
      await boton.click()
      // El contador del carrito confirma que la línea se agregó.
      await expect(page.getByTestId("nav-cart-link").filter({ hasText: "(1)" }).first()).toBeVisible({ timeout: 10_000 })
      return
    } catch (e) {
      if (Date.now() > limite) throw e
      await page.waitForTimeout(5_000)
    }
  }
}

const capturarDireccion = async (page: Page) => {
  await page.goto("/mx/checkout?step=address")
  await page.getByTestId("shipping-first-name-input").fill(DIRECCION.nombre)
  await page.getByTestId("shipping-last-name-input").fill(DIRECCION.apellido)
  await page.getByTestId("shipping-address-input").fill(DIRECCION.calle)
  await page.getByTestId("shipping-postal-code-input").fill(DIRECCION.cp)
  await page.getByTestId("shipping-city-input").fill(DIRECCION.ciudad)
  await page.getByTestId("shipping-country-select").selectOption("mx")
  await page.getByTestId("shipping-province-input").fill(DIRECCION.estado)
  await page.getByTestId("shipping-email-input").fill(DIRECCION.email)
  await page.getByTestId("shipping-phone-input").fill(DIRECCION.telefono)
  await page.getByTestId("submit-address-button").click()
  await expect(page.getByTestId("delivery-options-container")).toBeVisible({ timeout: 30_000 })
}

test.describe.serial("Checkout México", () => {
  test.beforeAll(async () => {
    if (!(await productoPorHandle("sd-hoodie-oversize-negro"))) {
      const request = await playwrightRequest.newContext()
      await importarFixture(request)
      await request.dispose()
    }
  })

  test("un invitado paga el hoodie M con Envío terrestre y SPEI y ve la CLABE", async ({ page }) => {
    test.setTimeout(240_000)
    await agregarAlCarrito(page, "sd-hoodie-oversize-negro", "M")

    // D20: cupones son Non-Goal de v1 (§1); ni el carrito ni el checkout ofrecen código de descuento.
    await page.goto("/mx/cart")
    await expect(page.getByTestId("checkout-button")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId("add-discount-button")).toHaveCount(0)

    await capturarDireccion(page)
    await expect(page.getByTestId("add-discount-button")).toHaveCount(0)

    const terrestre = page.getByTestId("delivery-option-radio").filter({ hasText: "Envío terrestre" })
    await expect(terrestre).toContainText("149", { timeout: 30_000 })
    await sinIngles(page, "checkout: envío")
    await terrestre.click()
    await page.getByTestId("submit-delivery-option-button").click()

    await page.getByText("Transferencia SPEI", { exact: true }).click()
    await sinIngles(page, "checkout: pago")
    await page.getByTestId("submit-payment-button").click()

    await page.getByRole("button", { name: "Generar referencia SPEI" }).click()

    await page.waitForURL(/\/mx\/order\/[^/]+\/confirmed/, { timeout: 60_000 })
    const instrucciones = page.getByTestId("spei-instructions")
    await expect(instrucciones).toContainText("CLABE")
    await expect(instrucciones).toContainText("000000000000000001")
    await expect(page.getByTestId("order-complete-container")).toContainText("$1,448.00")
    await sinIngles(page, "confirmación del pedido")
  })

  test("un carrito con un producto solo_terrestre no ofrece Envío express", async ({ page }) => {
    test.setTimeout(240_000)
    const perfume = await productoPorHandle("sd-perfume-noir-100")
    expect(perfume, "el fixture trae el perfume").toBeTruthy()
    if (perfume!.status !== "published") {
      const { request, headers } = await adminHeaders()
      const r = await request.post(`${BACKEND_URL}/admin/products/${perfume!.id}`, {
        headers,
        data: { status: "published" },
      })
      expect(r.ok()).toBeTruthy()
      await request.dispose()
    }

    await agregarAlCarrito(page, "sd-perfume-noir-100")
    await capturarDireccion(page)

    const opciones = page.getByTestId("delivery-option-radio")
    await expect(opciones.filter({ hasText: "Envío terrestre" })).toContainText("149", { timeout: 30_000 })
    await expect(opciones.filter({ hasText: "Envío express" })).toHaveCount(0)
  })
})
