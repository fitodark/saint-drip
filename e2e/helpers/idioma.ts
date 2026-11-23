import { expect, type Page } from "@playwright/test"

// D21: textos del starter de Medusa en inglés que no deben reaparecer en la tienda.
export const INGLES =
  /\b(Add to cart|Go to checkout|Summary|Shipping|Delivery|Payment|Sign in|Log out|Join us|Page not found|Search products|Account|Cart|Profile|Orders|Addresses|Welcome back|Quantity|Out of stock|In stock|Select|Continue|Back|Store|Powered by|All rights reserved|Customer service|Privacy policy|Terms of service|Return policy|Menu|Search|Categories|Collections|Contact|View all|Related products|Product Information|Medusa Store|Variant|Country|Mexico|Hello|Signed in|Overview|First name|Last name|Postal code|Phone|Password|Thank you|Order|Review|Place order|your|the|and|with)\b/

const textoVisible = (page: Page) =>
  page.evaluate(() => {
    const atributos = Array.from(document.querySelectorAll("[aria-label],[placeholder],[title],img[alt]"))
      .map((e) => ["aria-label", "placeholder", "title", "alt"].map((a) => e.getAttribute(a) ?? "").join(" "))
      .join(" ")
    return `${document.body.innerText} ${atributos} ${document.title}`
  })

// Falla si la página no declara es-MX o si su texto visible (incluidos aria-label, placeholder, title y alt) trae inglés.
export async function sinIngles(page: Page, ruta: string): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", "es-MX")
  const texto = await textoVisible(page)
  expect(texto.match(INGLES)?.[0] ?? null, `texto en inglés en ${ruta}`).toBeNull()
}
