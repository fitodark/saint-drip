import AxeBuilder from "@axe-core/playwright"
import { expect, request as playwrightRequest, test, type Page } from "@playwright/test"
import { BACKEND_URL, importarFixture, tokenAdmin } from "./helpers/admin"

// Blueprint §15 y §20.1: recorrido del flujo de compra solo con teclado (Tab, Shift+Tab, Enter, Espacio,
// flechas). En cada parada exige foco visible de 2px (regla del storefront) y nombre accesible; al cambiar
// de paso del checkout el foco va al título del paso; axe revisa carrito y checkout con WCAG 2.2 AA.

type Parada = { desc: string; nombre: string; contorno: number; transparente: boolean }

const parada = async (page: Page): Promise<Parada | null> => {
  const datos = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body || el.tagName.toLowerCase() === "nextjs-portal") return null
    const s = getComputedStyle(el)
    const tid = el.getAttribute("data-testid")
    return {
      desc: `${el.tagName.toLowerCase()}${tid ? "#" + tid : ""}`,
      contorno: s.outlineStyle === "none" ? 0 : parseFloat(s.outlineWidth),
      transparente: /rgba\([^)]*,\s*0\)|transparent/.test(s.outlineColor),
    }
  })
  if (!datos) return null
  const snap = await page.locator(":focus").ariaSnapshot().catch(() => "")
  const nombre = snap.split("\n")[0].match(/"(.+)"/)?.[1] ?? ""
  return { ...datos, nombre, desc: `${datos.desc} "${nombre}"` }
}

const vistas: string[] = []

// Pulsa Tab (o Shift+Tab) hasta que la parada cumpla `quiero`; cada parada debe tener foco visible y nombre.
const tabHasta = async (page: Page, quiero: RegExp, max = 40, atras = false) => {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(atras ? "Shift+Tab" : "Tab")
    const p = await parada(page)
    if (!p) continue
    vistas.push(`${page.url()} ${p.desc}`)
    expect.soft(p.contorno >= 2 && !p.transparente, `foco visible de 2px en ${p.desc} (${page.url()})`).toBe(true)
    expect.soft(p.nombre, `nombre accesible de ${p.desc} (${page.url()})`).not.toBe("")
    if (quiero.test(p.desc)) return
  }
  throw new Error(`Con ${max} Tabs no se llegó a ${quiero} en ${page.url()}; últimas: ${vistas.slice(-max).join(" | ")}`)
}

const enfocado = (page: Page) => page.evaluate(() => document.activeElement?.textContent?.trim() ?? "")

const axe = async (page: Page, donde: string) => {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()
  const resumen = violations.map((v) => ({ id: v.id, nodos: v.nodes.slice(0, 5).map((n) => n.target.join(" ")) }))
  expect.soft(resumen, `axe en ${donde}: ${JSON.stringify(resumen)}`).toEqual([])
}

test.beforeAll(async () => {
  const request = await playwrightRequest.newContext()
  const headers = { Authorization: `Bearer ${await tokenAdmin(request)}` }
  const r = await request.get(`${BACKEND_URL}/admin/products?handle=sd-hoodie-oversize-negro`, { headers })
  if ((await r.json()).products.length === 0) await importarFixture(request)
  await request.dispose()
})

test("el flujo de compra se completa solo con teclado", async ({ page }) => {
  test.setTimeout(300_000)

  // Inicio: el primer Tab es "Saltar al contenido" y lleva el foco al contenido.
  await page.goto("/mx")
  await page.waitForLoadState("networkidle")
  await tabHasta(page, /"Saltar al contenido"/, 1)
  await page.keyboard.press("Enter")
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("contenido")

  // Menú lateral: Enter abre, Escape cierra y devuelve el foco al botón.
  await page.goto("/mx")
  await page.waitForLoadState("networkidle")
  await tabHasta(page, /nav-menu-button/, 5)
  await page.keyboard.press("Enter")
  await tabHasta(page, /store-link/, 5)
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("store-link")).toBeHidden()
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe("nav-menu-button")

  // Tienda → PDP del hoodie: la talla se elige con flechas dentro del grupo de radios.
  await page.goto("/mx/store")
  await page.waitForLoadState("networkidle")
  await tabHasta(page, /"Hoodie Oversize Negro/, 80)
  await page.keyboard.press("Enter")
  await page.waitForURL(/sd-hoodie-oversize-negro/)
  await page.waitForLoadState("networkidle")
  await tabHasta(page, /^input "/, 30)
  const talla = page.getByRole("radio", { name: "M", exact: true })
  for (let i = 0; i < 8 && !(await talla.evaluate((e) => e === document.activeElement)); i++) {
    await page.keyboard.press("ArrowRight")
  }
  await page.keyboard.press("Space")
  await expect(talla).toBeChecked()
  await tabHasta(page, /add-product-button/, 10)
  await page.keyboard.press("Enter")
  await expect(page.getByTestId("nav-cart-link").filter({ hasText: "(1)" }).first()).toBeVisible({ timeout: 15_000 })

  // Carrito
  await page.goto("/mx/cart")
  await page.waitForLoadState("networkidle")
  await axe(page, "carrito")
  await tabHasta(page, /checkout-button/, 40)
  await page.keyboard.press("Enter")
  await page.waitForURL(/checkout/)
  await page.waitForLoadState("networkidle")

  // Dirección
  await axe(page, "checkout: dirección")
  const campos: [RegExp, string][] = [
    [/shipping-first-name/, "Cliente"],
    [/shipping-last-name/, "Teclado"],
    [/shipping-address-input/, "Centro 1"],
    [/shipping-postal-code/, "69000"],
    [/shipping-city/, "Huajuapan de León"],
  ]
  for (const [re, valor] of campos) {
    await tabHasta(page, re, 10)
    await page.keyboard.type(valor)
  }
  await tabHasta(page, /shipping-country-select/, 5)
  await page.keyboard.press("m")
  await expect(page.getByTestId("shipping-country-select")).toHaveValue("mx")
  await tabHasta(page, /shipping-province/, 5)
  await page.keyboard.type("Oaxaca")
  await tabHasta(page, /shipping-email/, 5)
  await page.keyboard.type(`e2e+teclado-${Date.now()}@saintdrip.local`)
  await tabHasta(page, /shipping-phone/, 5)
  await page.keyboard.type("9531720664")
  await tabHasta(page, /submit-address-button/, 5)
  await page.keyboard.press("Enter")

  // Envío: el foco llega al título del paso; la opción se elige con Espacio.
  await expect(page.getByTestId("delivery-options-container")).toBeVisible({ timeout: 30_000 })
  await expect.poll(() => enfocado(page)).toBe("Envío")
  await axe(page, "checkout: envío")
  await tabHasta(page, /delivery-option-radio "Envío terrestre/, 10)
  await page.keyboard.press("Space")
  await expect(page.getByRole("radio", { name: /Envío terrestre/ })).toBeChecked()
  await expect(page.getByTestId("submit-delivery-option-button")).toBeEnabled({ timeout: 30_000 })
  await tabHasta(page, /submit-delivery-option-button/, 10)
  await page.keyboard.press("Enter")

  // Pago: SPEI con flechas dentro del grupo.
  await expect.poll(() => enfocado(page), { timeout: 30_000 }).toBe("Pago")
  await axe(page, "checkout: pago")
  await tabHasta(page, /span "/, 10)
  const spei = page.getByRole("radio", { name: "Transferencia SPEI" })
  for (let i = 0; i < 6 && !(await spei.evaluate((e) => e === document.activeElement)); i++) {
    await page.keyboard.press("ArrowDown")
  }
  await expect(spei).toBeChecked()
  await expect(page.getByTestId("submit-payment-button")).toBeEnabled({ timeout: 30_000 })
  await tabHasta(page, /submit-payment-button/, 10)
  await page.keyboard.press("Enter")

  // Revisión y pedido
  await expect.poll(() => enfocado(page), { timeout: 30_000 }).toBe("Revisión")
  await tabHasta(page, /submit-order-button/, 10)
  await page.keyboard.press("Enter")
  await page.waitForURL(/\/order\/[^/]+\/confirmed/, { timeout: 60_000 })
  await expect(page.getByTestId("spei-instructions")).toContainText("CLABE")
  await page.waitForLoadState("networkidle")
  await axe(page, "confirmación")

  test.info().annotations.push({ type: "paradas", description: String(vistas.length) })
})
