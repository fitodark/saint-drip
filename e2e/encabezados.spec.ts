import { expect, test } from "@playwright/test"

// Blueprint §14: el storefront responde con los encabezados de seguridad en todas sus rutas.
const ESPERADOS: Record<string, string | RegExp> = {
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "content-security-policy-report-only": /frame-ancestors 'none'/,
}

test("el storefront envía los encabezados de seguridad", async ({ request }) => {
  for (const ruta of ["/mx", "/mx/products/sd-hoodie-oversize-negro", "/mx/esta-pagina-no-existe"]) {
    const respuesta = await request.get(ruta)
    const encabezados = respuesta.headers()
    for (const [nombre, valor] of Object.entries(ESPERADOS)) {
      if (typeof valor === "string") expect(encabezados[nombre], `${ruta} ${nombre}`).toBe(valor)
      else expect(encabezados[nombre], `${ruta} ${nombre}`).toMatch(valor)
    }
    expect(encabezados["content-security-policy"], `${ruta} sin CSP bloqueante`).toBeUndefined()
  }
})
