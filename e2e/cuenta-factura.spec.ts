import { expect, request as playwrightRequest, test, type Page } from "@playwright/test"
import type { APIRequestContext } from "@playwright/test"
import { BACKEND_URL, importarFixture, tokenAdmin } from "./helpers/admin"

// Cuenta del cliente (paso 17): registro, dirección, compra SPEI autenticada, captura y solicitud de CFDI.
const UUID_MOCK = "00000000-0000-4000-8000-000000000001"
const EMAIL = `e2e+cuenta-${Date.now()}@saintdrip.local`
const PASSWORD = "Cuenta-e2e-2026"
const DIRECCION = {
  nombre: "Cliente",
  apellido: "Cuenta",
  calle: "Centro 1",
  ciudad: "Huajuapan de León",
  estado: "Oaxaca",
  cp: "69000",
  telefono: "9531720664",
}

// Captura el pago de un pedido por la Admin API (equivale a confirmar la transferencia SPEI). Vive en el spec
// para dejar el paso 17 en 5 archivos (§9 regla 1) con el proxy del PDF.
async function capturarPagoDelPedido(request: APIRequestContext, orderId: string): Promise<void> {
  const headers = { Authorization: `Bearer ${await tokenAdmin(request)}` }
  const detalle = await request.get(`${BACKEND_URL}/admin/orders/${orderId}?fields=payment_collections.payments.id`, {
    headers,
  })
  if (!detalle.ok()) throw new Error(`GET /admin/orders/${orderId} falló: ${detalle.status()} ${await detalle.text()}`)
  const { order } = await detalle.json()
  const pagoId: string | undefined = order.payment_collections?.[0]?.payments?.[0]?.id
  if (!pagoId) throw new Error(`El pedido ${orderId} no tiene pagos`)
  const captura = await request.post(`${BACKEND_URL}/admin/payments/${pagoId}/capture`, { headers, data: {} })
  if (!captura.ok()) throw new Error(`POST /admin/payments/${pagoId}/capture falló: ${captura.status()} ${await captura.text()}`)
}

const existeHoodie = async () => {
  const request = await playwrightRequest.newContext()
  const headers = { Authorization: `Bearer ${await tokenAdmin(request)}` }
  const r = await request.get(`${BACKEND_URL}/admin/products?handle=sd-hoodie-oversize-negro`, { headers })
  const { products } = await r.json()
  await request.dispose()
  return products.length > 0
}

// D13: el PDP puede venir de la caché de catálogo (≤ 60 s); se recarga hasta que el carrito acepte la línea.
const agregarHoodieM = async (page: Page) => {
  const limite = Date.now() + 90_000
  for (;;) {
    await page.goto("/mx/products/sd-hoodie-oversize-negro")
    try {
      await page.getByTestId("option-button").filter({ hasText: /^M$/ }).click({ timeout: 10_000 })
      await expect(page.getByRole("radio", { name: "M", exact: true })).toBeChecked()
      const boton = page.getByTestId("add-product-button").first()
      await expect(boton).toBeEnabled({ timeout: 10_000 })
      await boton.click()
      await expect(page.getByTestId("nav-cart-link").filter({ hasText: "(1)" }).first()).toBeVisible({ timeout: 10_000 })
      return
    } catch (e) {
      if (Date.now() > limite) throw e
      await page.waitForTimeout(5_000)
    }
  }
}

test.describe.serial("Cuenta: dirección y solicitud de factura", () => {
  test.beforeAll(async () => {
    if (!(await existeHoodie())) {
      const request = await playwrightRequest.newContext()
      await importarFixture(request)
      await request.dispose()
    }
  })

  test("un cliente registrado compra con SPEI y obtiene su CFDI", async ({ page }) => {
    test.setTimeout(300_000)

    // 1. Registro en /mx/account
    await page.goto("/mx/account")
    await page.getByRole("button", { name: "Join us" }).click()
    await page.getByTestId("first-name-input").fill(DIRECCION.nombre)
    await page.getByTestId("last-name-input").fill(DIRECCION.apellido)
    await page.getByTestId("email-input").fill(EMAIL)
    await page.getByTestId("phone-input").fill(DIRECCION.telefono)
    await page.getByTestId("password-input").fill(PASSWORD)
    await page.getByRole("button", { name: "Join", exact: true }).click()
    await expect(page.getByTestId("account-nav").first()).toBeVisible({ timeout: 30_000 })

    // 1b. Dirección guardada en /mx/account/addresses
    await page.goto("/mx/account/addresses")
    await page.getByTestId("add-address-button").click()
    const modal = page.getByTestId("add-address-modal")
    await modal.getByTestId("first-name-input").fill(DIRECCION.nombre)
    await modal.getByTestId("last-name-input").fill(DIRECCION.apellido)
    await modal.getByTestId("address-1-input").fill(DIRECCION.calle)
    await modal.getByTestId("postal-code-input").fill(DIRECCION.cp)
    await modal.getByTestId("city-input").fill(DIRECCION.ciudad)
    await modal.getByTestId("state-input").fill(DIRECCION.estado)
    await modal.getByTestId("country-select").selectOption("mx")
    await modal.getByTestId("phone-input").fill(DIRECCION.telefono)
    await modal.getByTestId("save-button").click()
    const tarjeta = page.getByTestId("address-container").filter({ hasText: DIRECCION.cp })
    await expect(tarjeta.first()).toBeVisible({ timeout: 30_000 })
    await expect(tarjeta.first()).toContainText("Huajuapan")

    // 2. Compra del hoodie con SPEI, autenticado
    await agregarHoodieM(page)
    await page.goto("/mx/checkout?step=address")
    await page.getByTestId("shipping-first-name-input").fill(DIRECCION.nombre)
    await page.getByTestId("shipping-last-name-input").fill(DIRECCION.apellido)
    await page.getByTestId("shipping-address-input").fill(DIRECCION.calle)
    await page.getByTestId("shipping-postal-code-input").fill(DIRECCION.cp)
    await page.getByTestId("shipping-city-input").fill(DIRECCION.ciudad)
    await page.getByTestId("shipping-country-select").selectOption("mx")
    await page.getByTestId("shipping-province-input").fill(DIRECCION.estado)
    await page.getByTestId("shipping-email-input").fill(EMAIL)
    await page.getByTestId("shipping-phone-input").fill(DIRECCION.telefono)
    await page.getByTestId("submit-address-button").click()

    const terrestre = page.getByTestId("delivery-option-radio").filter({ hasText: "Envío terrestre" })
    await expect(terrestre).toContainText("149", { timeout: 30_000 })
    await terrestre.click()
    await page.getByTestId("submit-delivery-option-button").click()
    await page.getByText("Transferencia SPEI", { exact: true }).click()
    await page.getByTestId("submit-payment-button").click()
    await page.getByRole("button", { name: "Generar referencia SPEI" }).click()
    await page.waitForURL(/\/mx\/order\/[^/]+\/confirmed/, { timeout: 60_000 })
    const orderId = page.url().match(/\/order\/([^/]+)\/confirmed/)![1]

    // 3. Captura del pago por la Admin API
    const request = await playwrightRequest.newContext()
    await capturarPagoDelPedido(request, orderId)
    await request.dispose()

    // 4. El pedido aparece en la cuenta y se solicita la factura desde su detalle
    await page.goto("/mx/account/orders")
    await expect(page.getByTestId("order-card").first()).toBeVisible({ timeout: 30_000 })
    await page.goto(`/mx/account/orders/details/${orderId}`)
    const formulario = page.getByTestId("invoice-request")
    await formulario.getByLabel("RFC").fill("XAXX010101000")
    await formulario.getByLabel("Razón social").fill("PUBLICO EN GENERAL")
    await formulario.getByLabel("Régimen fiscal").selectOption("616")
    await formulario.getByLabel("Código postal").fill("69000")
    await formulario.getByLabel("Uso del CFDI").selectOption("S01")
    await formulario.getByRole("button", { name: "Solicitar factura" }).click()

    // 5. Factura emitida con el uuid del mock; un segundo envío muestra E_YA_FACTURADO
    await expect(page.getByTestId("invoice-issued")).toContainText("Factura emitida", { timeout: 30_000 })
    await expect(page.getByTestId("invoice-issued")).toContainText(UUID_MOCK)

    // D17: "Descargar PDF" pasa por el proxy del storefront con la sesión del cliente (page.request comparte cookies).
    const enlace = page.getByTestId("invoice-issued").getByRole("link", { name: "Descargar PDF" })
    const href = await enlace.getAttribute("href")
    expect(href).toMatch(/^\/api\/invoices\/[^/]+\/pdf$/)
    const pdf = await page.request.get(href!)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()["content-type"]).toContain("application/pdf")
    expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF")

    await formulario.getByRole("button", { name: "Solicitar factura" }).click()
    await expect(formulario.getByRole("alert")).toContainText("Este pedido ya tiene una factura", { timeout: 30_000 })
  })
})
