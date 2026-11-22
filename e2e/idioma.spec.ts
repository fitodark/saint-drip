import { expect, request as playwrightRequest, test, type Page } from "@playwright/test"
import { BACKEND_URL, iniciarSesionAdmin, importarFixture, tokenAdmin } from "./helpers/admin"
import { sinIngles } from "./helpers/idioma"

// D21 y D22: la tienda se muestra solo en español de México; el admin abre en español por defecto
// y cada admin puede cambiarlo a inglés en su perfil.

const PUBLICAS = [
  "/mx",
  "/mx/store",
  "/mx/products/sd-hoodie-oversize-negro",
  "/mx/search?q=hoodie",
  "/mx/shipping",
  "/mx/returns",
  "/mx/terms",
  "/mx/privacy",
  "/mx/contact",
  "/mx/esta-pagina-no-existe",
]

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

test.describe.serial("Idioma", () => {
  test.beforeAll(async () => {
    if (!(await existeHoodie())) {
      const request = await playwrightRequest.newContext()
      await importarFixture(request)
      await request.dispose()
    }
  })

  test("la tienda se muestra completa en español de México", async ({ page }) => {
    test.setTimeout(300_000)
    for (const ruta of PUBLICAS) {
      await page.goto(ruta)
      await page.waitForLoadState("networkidle")
      await sinIngles(page, ruta)
    }

    // Menú lateral abierto
    await page.goto("/mx")
    await page.getByTestId("nav-menu-button").click()
    await expect(page.getByTestId("store-link")).toHaveText("Tienda")
    await sinIngles(page, "/mx (menú)")

    // Carrito y checkout
    await agregarHoodieM(page)
    await page.goto("/mx/cart")
    await expect(page.getByTestId("checkout-button")).toBeVisible({ timeout: 30_000 })
    await sinIngles(page, "/mx/cart")
    await page.goto("/mx/checkout?step=address")
    await expect(page.getByTestId("shipping-first-name-input")).toBeVisible({ timeout: 30_000 })
    await sinIngles(page, "/mx/checkout")

    // Inicio de sesión, registro y cuenta
    await page.goto("/mx/account")
    await sinIngles(page, "/mx/account (inicio de sesión)")
    await page.getByRole("button", { name: "Crear cuenta" }).click()
    await sinIngles(page, "/mx/account (registro)")
    await page.getByTestId("first-name-input").fill("Cliente")
    await page.getByTestId("last-name-input").fill("Idioma")
    await page.getByTestId("email-input").fill(`e2e+idioma-${Date.now()}@saintdrip.local`)
    await page.getByTestId("phone-input").fill("9531720664")
    await page.getByTestId("password-input").fill("idioma-e2e-1")
    await page.getByRole("button", { name: "Crear cuenta" }).click()
    await expect(page.getByTestId("account-nav").first()).toBeVisible({ timeout: 30_000 })
    for (const ruta of ["/mx/account", "/mx/account/profile", "/mx/account/addresses", "/mx/account/orders"]) {
      await page.goto(ruta)
      await expect(page.getByTestId("account-nav").first()).toBeVisible({ timeout: 30_000 })
      await sinIngles(page, ruta)
    }
  })

  test("el admin abre en español y cada admin puede cambiarlo a inglés", async ({ page }) => {
    test.setTimeout(240_000)
    await iniciarSesionAdmin(page)

    await page.goto(`${BACKEND_URL}/app/orders`)
    await expect(page.getByRole("heading", { name: "Pedidos" })).toBeVisible({ timeout: 90_000 })
    await expect(page.getByRole("link", { name: "Carga masiva" })).toBeVisible()

    // El admin elige English en Perfil → Editar → Idioma.
    await page.goto(`${BACKEND_URL}/app/settings/profile/edit`)
    const formulario = page.getByRole("dialog")
    await formulario.getByRole("combobox").first().click()
    await page.getByRole("option", { name: "English", exact: true }).click()
    await formulario.getByRole("button", { name: "Guardar" }).click()

    await page.goto(`${BACKEND_URL}/app/orders`)
    await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible({ timeout: 90_000 })
    await page.goto(`${BACKEND_URL}/app/carga-masiva`)
    await expect(page.getByRole("heading", { name: "Bulk upload" })).toBeVisible({ timeout: 90_000 })
    await expect(page.getByRole("button", { name: "Validate" })).toBeVisible()

    // Un navegador nuevo (otro admin) sigue abriendo en español.
    const otro = await page.context().browser()!.newContext()
    const pagina = await otro.newPage()
    await iniciarSesionAdmin(pagina)
    await pagina.goto(`${BACKEND_URL}/app/carga-masiva`)
    await expect(pagina.getByRole("heading", { name: "Carga masiva" })).toBeVisible({ timeout: 90_000 })
    await otro.close()
  })
})
