# Épica 03 — Tienda y lanzamiento

> Épica autocontenida del bundle `blueprints/saint-drip/`. Un agente sin contexto la completa sin abrir
> `blueprint.md`. Las tareas son las mismas que en `tasks.json` (mismos ids, criterios, comandos y tags).

## Stack (resumen — no cambiar)

- Node.js 24.22.3 (`.nvmrc`), npm 11.19.1, un proyecto npm por app con `--prefix` (sin workspaces).
- Backend `apps/backend`: Medusa 2.23.0 (Postgres 17.12, Redis 7.4.12 vía `docker-compose.yml`), Jest 29 (del scaffold) + `@medusajs/test-utils` 2.23.0.
- Storefront `apps/storefront`: Next.js 16.3.8 Starter de Medusa (versiones del starter), Tailwind con los tokens de diseño.
- Integraciones con modo `mock` determinista: Stripe (tarjeta) · SPEI propio (Stripe) · PayPal propio · Envia.com propio · FacturAPI · Resend.
- Montos en unidades mayores (`1299` = $1,299.00 MXN), IVA incluido; centavos solo al llamar a Stripe.
- E2E: Playwright 1.65.1 + axe (`playwright.config.ts` levanta backend :9000 y storefront :8000).

## Reglas de ejecución

1. Todos los comandos corren desde la **raíz del proyecto** (bash; en Windows, Git Bash). Antes de cada tarea: `npm run services:up`.
2. Orden fijo por tarea: **Do → Done when → Verify → Checkpoint**. Una tarea está `done` solo si **cada** línea de Verify sale con 0, igual que las de las tareas anteriores.
3. Si una tarea falla y no ves la causa: `git reset --hard <tag de la tarea anterior>` y reintenta. Nunca se salta una tarea.
4. No construyas nada de la lista de Non-Goals: USD/internacional, cupones, devoluciones automáticas, actualizar productos por Excel, otro almacén activo, Mercado Pago/OXXO, guardar datos bancarios, modo oscuro.
5. Variables: `apps/backend/.env` (copiado de `.env.example`), `apps/backend/.env.test` para Jest y `apps/storefront/.env.local` (lo crea `scripts/write-storefront-env.mjs`). Todos los integradores quedan en `mock`; ninguna tarea necesita credenciales reales.
6. Los archivos del workspace (configs, seed, scripts y fixtures) ya están en la raíz desde Bootstrap: no los recrees.

## Árbol relevante

```
saint-drip/
  docker-compose.yml  playwright.config.ts  package.json  .nvmrc  .gitignore
  scripts/{merge-scaffold,write-storefront-env,with-server,store-check}.mjs
  e2e/{fixtures/,helpers/admin.ts,*.spec.ts}
  apps/backend/{medusa-config.ts,jest.config.js,tsconfig.json,.env.example,.env.test,instrumentation.ts}
  apps/backend/integration-tests/{setup.js,http/*.spec.ts}
  apps/backend/src/{scripts,lib,workflows,api,admin,modules,jobs,subscribers}/
  apps/storefront/{scripts/check-tokens.mjs,tailwind.config.js,src/}
  blueprints/saint-drip/   ← este bundle
```


## Tareas de esta épica

E3-T1, E3-T2, E3-T6, E3-T7, E3-T3, E3-T4, E3-T5 — pasos 14 a 20 del blueprint (E3-T6 y E3-T7 salieron de dividir el paso 15; los ids no se renumeran).


---

## E3-T1 — Paso 14: Sistema de diseño en el storefront

**Depende de:** E1-T1 · **Checkpoint:** `step-14-diseno`

**Files**
- `apps/storefront/src/styles/globals.css`
- `apps/storefront/tailwind.config.js`
- `apps/storefront/src/app/layout.tsx`
- `apps/storefront/src/modules/common/components/whatsapp-button/index.tsx`
- `apps/storefront/scripts/check-tokens.mjs`

**Do**

- `apps/storefront/src/styles/globals.css`: agrega al inicio un bloque `:root { … }` con **todos** los tokens de §7 (`--color-primary` … `--color-success`), `--font-display` y `--font-body` como variables que asigna `next/font`, el radio `--radius: 0px` y el bloque de `prefers-reduced-motion` de §7. Es el **único** archivo del storefront que puede contener literales hex.
- `apps/storefront/tailwind.config.js`: dentro de `theme.extend`, agrega `colors: { primary: "var(--color-primary)", "primary-fg": "var(--color-primary-fg)", background: "var(--color-background)", surface: "var(--color-surface)", border: "var(--color-border)", "border-strong": "var(--color-border-strong)", fg: "var(--color-fg)", "fg-muted": "var(--color-fg-muted)", accent: "var(--color-accent)", destructive: "var(--color-destructive)", success: "var(--color-success)" }`, `fontFamily: { display: ["var(--font-display)", "system-ui", "sans-serif"], sans: ["var(--font-body)", "system-ui", "sans-serif"] }` y `borderRadius: { none: "0px", DEFAULT: "0px" }`.
- `apps/storefront/src/app/layout.tsx`: carga Archivo e Inter según §7, aplica `className={`${display.variable} ${body.variable}`}` en `<html lang="es-MX">`, pone `bg-background text-fg font-sans` en `<body>` y renderiza `<WhatsAppButton />` después de `{children}`.
- `apps/storefront/src/modules/common/components/whatsapp-button/index.tsx`:
  - Es un `<a>` fijo abajo a la derecha que apunta a `https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER}?text=` + `encodeURIComponent("Hola, tengo una duda sobre mi compra en Saint Drip")`.
  - Lleva `aria-label="¿Dudas? Escríbenos por WhatsApp"`, `target="_blank"` y `rel="noopener noreferrer"`.
  - Mide 56×56 px y es circular, con fondo `bg-primary` y un ícono SVG `aria-hidden` en `text-primary-fg`.
  - Si `NEXT_PUBLIC_WHATSAPP_NUMBER` está vacío, no renderiza nada.
- `apps/storefront/scripts/check-tokens.mjs`: recorre `apps/storefront/src/**/*.{ts,tsx,css}` excepto `src/styles/globals.css`. Termina con 1 y lista `archivo:línea` si encuentra `#[0-9a-fA-F]{3,8}\b` dentro de un string o de una clase `[#…]`; si no, termina con 0. Ignora las líneas con `// tokens-ok`, para los ids de anclas como `href="#main"`.
- Corrige los literales hex que el starter tenga en `src/` hasta que `check-tokens` pase. Reemplázalos por las clases de tokens, sin cambiar ningún comportamiento.

**Acceptance**
1. WHEN `node apps/storefront/scripts/check-tokens.mjs` corre THE SYSTEM SHALL salir con 0 (cero hex fuera de `globals.css`).
2. WHEN se construye el storefront con el backend arriba THE SYSTEM SHALL salir con 0.
3. WHEN se pide `/mx` THE SYSTEM SHALL servir un HTML con `lang="es-MX"` y un enlace `https://wa.me/529531720664` con `aria-label` "¿Dudas? Escríbenos por WhatsApp".
4. WHEN `npm --prefix apps/storefront run typecheck` corre THE SYSTEM SHALL salir con 0.

**Verify**
```bash
node apps/storefront/scripts/check-tokens.mjs                                      # expect: exit 0
npm --prefix apps/storefront run typecheck                                         # expect: exit 0
node scripts/with-server.mjs "npm --prefix apps/backend run dev" http://localhost:9000/health OK 240 -- npm --prefix apps/storefront run build   # expect: exit 0
node scripts/with-server.mjs "npm --prefix apps/backend run dev" http://localhost:9000/health OK 240 -- node scripts/with-server.mjs "npm --prefix apps/storefront run dev" http://localhost:8000/mx 'lang="es-MX"' 300 -- node scripts/store-check.mjs html /mx https://wa.me/529531720664   # expect: exit 0 — backend y storefront anidados; el storefront sirve lang y el enlace de WhatsApp
```

**Checkpoint**
```bash
git add -A && git commit -m "step 14: sistema de diseno del storefront"
git tag step-14-diseno
```


---

## E3-T2 — Paso 15: Inicio por categorías y PDP con JSON-LD

**Depende de:** E1-T5, E2-T3, E3-T1 · **Checkpoint:** `step-15-catalogo`

**Files**
- `apps/storefront/src/modules/home/components/category-rails/index.tsx`
- `apps/storefront/src/app/[countryCode]/(main)/page.tsx`
- `apps/storefront/src/modules/products/templates/index.tsx`
- `apps/storefront/src/app/[countryCode]/(main)/products/[handle]/page.tsx`
- `e2e/catalogo.spec.ts`

**Do**

- `apps/storefront/src/modules/home/components/category-rails/index.tsx` (componente de servidor):
  - Pide las categorías con `listCategories()` del starter y se queda con los handles `ropa`, `tenis`, `joyeria`, `perfumes` y `accesorios`, en ese orden.
  - Por cada una pide hasta 8 productos con `listProducts({ countryCode, queryParams: { category_id: [id], limit: 8 } })`.
  - Renderiza una `<section aria-labelledby="cat-<handle>">` con `<h2 id="cat-<handle>">` cuyo texto es `categoria.name.toUpperCase()` ("ROPA", "TENIS"…), la grilla de `ProductPreview` del starter y un enlace "Ver todo" a `/mx/categories/<handle>`.
  - Omite las categorías sin productos.
- `apps/storefront/src/app/[countryCode]/(main)/page.tsx`: un hero con `<h1>` "Exclusividad en cada prenda" y el enlace "Ver catálogo" a `/mx/store`, seguido de `<CategoryRails countryCode={countryCode} />`. Reemplaza las colecciones destacadas del starter.
- `apps/storefront/src/modules/products/templates/index.tsx` (plantilla de servidor del starter) recibe dos agregados:
  - un `<script type="application/ld+json">` con `@type: "Product"`, `name`, `sku` de la primera variante, `image` (URLs), `brand: { "@type": "Brand", name: "Saint Drip" }` y `offers: { "@type": "Offer", priceCurrency: "MXN", price: <precio calculado de la variante más barata con 2 decimales, p. ej. "1299.00">, availability: "https://schema.org/InStock" si alguna variante tiene inventario, si no "https://schema.org/OutOfStock", url }`, serializado con `JSON.stringify(...).replace(/</g, "\\u003c")`;
  - la insignia "Solo envío terrestre" (`bg-accent text-fg`) cuando `product.metadata?.solo_terrestre === true`.
- `apps/storefront/src/app/[countryCode]/(main)/products/[handle]/page.tsx` (del starter): ya publica un JSON-LD `ProductGroup` (`buildProductStructuredData` + `toJsonLd`). Quita ese bloque y conserva las meta OG y `getPricedVariants`. El único JSON-LD del producto es el de la plantilla.
- `e2e/catalogo.spec.ts`:
  - `beforeAll`: `borrarProductosFixture` y después `importarFixture` (paso 5).
  - Con un contexto `javaScriptEnabled: false`, `/mx/products/sd-hoodie-oversize-negro` contiene `$1,299.00`. Su HTML tiene exactamente un bloque JSON-LD `Product` o `ProductGroup`, y ese bloque, una vez parseado, tiene `offers.price === "1299.00"` y `offers.priceCurrency === "MXN"`.
  - `/mx` tiene un `h2` "ROPA" y otro "TENIS" (los productos publicados; el perfume es borrador y no aparece).
  - Al publicar el perfume por la Admin API (`POST /admin/products/:id { status: "published" }`), `/mx/products/sd-perfume-noir-100` muestra "Solo envío terrestre".
  - Las comprobaciones del inicio y de la insignia recargan con `expect(...).toPass({ timeout: 90_000 })`, porque los carriles y el PDP salen de la caché de catálogo, que el paso 16 deja en 60 s como máximo.

**Acceptance**
1. WHEN se pide el PDP del hoodie sin JavaScript THE SYSTEM SHALL contener `$1,299.00` en el HTML y un JSON-LD `Product` con `offers.price` `"1299.00"` en `MXN`.
2. WHEN se pide `/mx` THE SYSTEM SHALL mostrar una sección por categoría con productos publicados (ROPA y TENIS con el fixture) y omitir las vacías.
3. WHEN un producto tiene `metadata.solo_terrestre = true` THE SYSTEM SHALL mostrar "Solo envío terrestre" en su PDP.
4. WHEN se inspecciona el HTML del PDP THE SYSTEM SHALL contener exactamente un bloque JSON-LD de producto (`Product` o `ProductGroup`).

**Verify**
```bash
npm --prefix apps/storefront run typecheck                                         # expect: exit 0
node apps/storefront/scripts/check-tokens.mjs                                      # expect: exit 0 — el paso 14 sigue verde
npm run test:e2e -- e2e/catalogo.spec.ts                                           # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 15: inicio por categorias y pdp"
git tag step-15-catalogo
```


---

## E3-T6 — Paso 16: Caché de catálogo de 60 s

**Depende de:** E3-T2 · **Checkpoint:** `step-16-cache-catalogo`

**Files**
- `apps/storefront/src/lib/data/products.ts`
- `apps/storefront/src/lib/data/categories.ts`
- `e2e/cache-catalogo.spec.ts`

**Do**

- Los fetch de catálogo del starter usan `cache: "force-cache"` sin `next.revalidate` y sin tags, salvo cuando existe la cookie `_medusa_cache_id`, así que Next los guarda un año (`revalidate: 31536000` en la caché de fetch). Los cambios del admin y de la carga masiva no se verían en el inicio, la PLP ni el PDP, aunque la página declare `revalidate = 60`.
- `apps/storefront/src/lib/data/products.ts` (`"use server"`): agrega después de los imports `const CATALOGO_REVALIDATE_S = 60`, sin `export` porque un archivo `"use server"` solo exporta funciones async, y `revalidate: CATALOGO_REVALIDATE_S` al objeto `next` de `listProducts`.
- `apps/storefront/src/lib/data/categories.ts`: la misma constante y `revalidate: CATALOGO_REVALIDATE_S` en el objeto `next` de `listCategories` y de `getCategoryByHandle`.
- No cambies `cache`, las etiquetas ni el carrito, el checkout o la cuenta, que siguen sin caché (§6).
- `e2e/cache-catalogo.spec.ts`: busca el hoodie (`sd-hoodie-oversize-negro`) por la Admin API e importa el fixture con `importarFixture` si no existe. Abre su PDP y espera el título original en `data-testid="product-title"`, lo que deja la página en caché. Cambia el título con `POST /admin/products/:id { title: "<original> <Date.now()>" }` y recarga el PDP dentro de `expect(...).toPass({ timeout: 90_000, intervals: [5_000] })` hasta ver el título nuevo. En un `finally` restaura el título original. `test.setTimeout(240_000)`. Sin el `revalidate`, la caché de un año sirve el título viejo y la prueba falla.

**Acceptance**
1. WHEN se leen `products.ts` y `categories.ts` THE SYSTEM SHALL fijar `revalidate: CATALOGO_REVALIDATE_S` (60) en los tres fetch de catálogo: uno en `products.ts` y dos en `categories.ts`.
2. WHEN el título del hoodie cambia por `POST /admin/products/:id` después de que su PDP ya está en caché THE SYSTEM SHALL mostrar el título nuevo en `data-testid="product-title"` del PDP en 90 s como máximo (`e2e/cache-catalogo.spec.ts`).

**Verify**
```bash
npm --prefix apps/storefront run typecheck                                         # expect: exit 0
test "$(grep -c 'revalidate: CATALOGO_REVALIDATE_S' apps/storefront/src/lib/data/products.ts)" -ge 1 && test "$(grep -c 'revalidate: CATALOGO_REVALIDATE_S' apps/storefront/src/lib/data/categories.ts)" -ge 2   # expect: exit 0
npm run test:e2e -- e2e/cache-catalogo.spec.ts                                     # expect: exit 0 — el cambio del admin llega al PDP en ≤ 90 s
npm run test:e2e -- e2e/catalogo.spec.ts                                           # expect: exit 0 — el paso 15 sigue verde
```

**Checkpoint**
```bash
git add -A && git commit -m "step 16: cache de catalogo de 60 s"
git tag step-16-cache-catalogo
```


---

## E3-T7 — Paso 17: Accesibilidad WCAG 2.2 AA

**Depende de:** E3-T2 · **Checkpoint:** `step-17-a11y`

**Files**
- `apps/storefront/src/styles/globals.css`
- `apps/storefront/src/modules/layout/components/medusa-cta/index.tsx`
- `apps/storefront/src/modules/layout/components/cart-dropdown/index.tsx`
- `apps/storefront/src/modules/products/components/product-tabs/accordion.tsx`
- `e2e/a11y.spec.ts`

**Do**

- `e2e/a11y.spec.ts`: en `beforeAll` importa el fixture si el hoodie no existe (corre antes que `catalogo.spec.ts` por orden alfabético). Después ejecuta `new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21aa","wcag22aa"]).analyze()` sobre `/mx`, `/mx/store` y `/mx/products/sd-hoodie-oversize-negro`, y afirma `violations` = `[]` en cada una.
- Con el starter de `create-medusa-app` 2.23.0 hacen falta estas cuatro correcciones:
  - `apps/storefront/src/styles/globals.css`: `--fg-muted: var(--color-fg-muted);` en el `:root`. El gris muted de `@medusajs/ui` (`#71717A`) no llega a 4.5:1 sobre `--color-background` (`color-contrast`).
  - `apps/storefront/src/modules/layout/components/medusa-cta/index.tsx`: `aria-label="Medusa"` y `aria-label="Next.js"` en los dos enlaces de íconos (`link-name`).
  - `apps/storefront/src/modules/layout/components/cart-dropdown/index.tsx`: quitar el `PopoverButton` que envuelve el enlace del carrito (`nested-interactive`). El panel es `static` y abre por hover, así que no hace falta.
  - `apps/storefront/src/modules/products/components/product-tabs/accordion.tsx`: `aria-label={title}` en el `AccordionPrimitive.Trigger` (`button-name`).
- Si axe reporta algo más, detente y repórtalo como defecto del blueprint: las cuatro correcciones de arriba son las únicas que este paso toca.

**Acceptance**
1. WHEN axe analiza `/mx`, `/mx/store` y el PDP con las etiquetas WCAG 2.2 AA THE SYSTEM SHALL reportar 0 violaciones.
2. WHEN `node apps/storefront/scripts/check-tokens.mjs` corre después de editar `globals.css` THE SYSTEM SHALL salir con 0.

**Verify**
```bash
npm --prefix apps/storefront run typecheck                                         # expect: exit 0
node apps/storefront/scripts/check-tokens.mjs                                      # expect: exit 0
npm run test:e2e -- e2e/a11y.spec.ts                                               # expect: exit 0, 0 failed
npm run test:e2e -- e2e/catalogo.spec.ts                                           # expect: exit 0 — el paso 15 sigue verde
```

**Checkpoint**
```bash
git add -A && git commit -m "step 17: accesibilidad wcag 2.2 aa"
git tag step-17-a11y
```


---

## E3-T3 — Paso 18: Checkout México: SPEI, PayPal, tarjeta y Envia

**Depende de:** E2-T1, E2-T2, E2-T3, E3-T2, E3-T6 · **Checkpoint:** `step-18-checkout`

**Files**
- `apps/storefront/src/lib/constants.tsx`
- `apps/storefront/src/modules/checkout/components/payment-button/index.tsx`
- `apps/storefront/src/modules/order/templates/order-completed-template.tsx`
- `apps/storefront/src/modules/checkout/components/shipping/index.tsx`
- `e2e/checkout-spei.spec.ts`

**Do**

- `apps/storefront/src/lib/constants.tsx`: en el mapa de proveedores del starter (`paymentInfoMap`), agrega `pp_spei_spei: { title: "Transferencia SPEI", icon: <ícono> }` y `pp_paypal_paypal: { title: "PayPal", icon: <ícono> }`, y renombra `pp_stripe_stripe` a "Tarjeta de crédito o débito". Agrega `export const isSpei = (id?: string) => id === "pp_spei_spei"` y `isPaypal` con el mismo patrón.
- `apps/storefront/src/modules/checkout/components/payment-button/index.tsx` (componente de cliente del starter) recibe dos ramas nuevas. La rama de Stripe del starter no cambia.
  - **`isSpei`:** un botón "Generar referencia SPEI" que llama `placeOrder()`.
  - **`isPaypal`:** un componente interno `PayPalPaymentButton` en el mismo archivo, que envuelve el botón en `PayPalScriptProvider` (de `@paypal/react-paypal-js`) con `{ clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID, currency: "MXN", intent: "capture" }`.
    - Dentro va `PayPalButtons` con `createOrder={() => session.data.paypal_order_id}` y un `onApprove` que llama `placeOrder()`. Medusa autoriza y captura con el proveedor.
    - Si `NEXT_PUBLIC_PAYPAL_CLIENT_ID` está vacío (modo mock), en su lugar hay un botón "Pagar con PayPal (prueba)" que llama `placeOrder()`.
- `apps/storefront/src/modules/order/templates/order-completed-template.tsx`: debajo del resumen, si el pago del pedido es `pp_spei_spei`, agrega un bloque con:
  - `<h2>Paga con transferencia SPEI</h2>`;
  - la CLABE en fuente mono con el texto `CLABE`, además de banco, referencia y monto formateado, tomados de `order.payment_collections[0].payments[0].data`;
  - "Paga antes de <vence_en en es-MX>".
- `apps/storefront/src/modules/checkout/components/shipping/index.tsx`: la opción calculada cuyo cálculo devuelve error se oculta (ver §6). Si fallan todas, se muestra "No hay envíos disponibles para este código postal."
- `e2e/checkout-spei.spec.ts`:
  - `beforeAll`: `importarFixture` si el hoodie no existe.
  - Como invitado: `/mx/products/sd-hoodie-oversize-negro`, elegir talla `M` y "Agregar al carrito". En `/mx/checkout`, capturar email `e2e+spei@saintdrip.local`, nombre, la dirección "Centro 1, Huajuapan de León, Oaxaca, 69000, México" y teléfono.
  - El PDP puede venir de la caché de catálogo (60 s como máximo) con ids de variante de un fixture ya reimportado. Si el carrito no sube a `(1)`, se recarga el PDP durante 90 s como máximo. Las tallas son radios accesibles: se pulsa su `label` (`data-testid="option-button"`) con el texto exacto.
  - Elegir "Envío terrestre", luego "Transferencia SPEI", y pulsar "Generar referencia SPEI".
  - En la confirmación: visible `CLABE` y `000000000000000001`, y el texto `$1,448.00` (1299 + 149).
  - En un segundo carrito, con el perfume publicado, la opción "Envío express" no aparece.

**Acceptance**
1. WHEN un invitado compra el hoodie M con Envío terrestre y SPEI (mock) THE SYSTEM SHALL crear el pedido y mostrar en la confirmación la CLABE `000000000000000001` y el total `$1,448.00`.
2. WHEN el carrito contiene un producto `solo_terrestre` THE SYSTEM SHALL ofrecer "Envío terrestre" y no "Envío express".
3. WHEN el paso de pago carga THE SYSTEM SHALL listar "Tarjeta de crédito o débito" (si `STRIPE_API_KEY` está definido), "Transferencia SPEI" y "PayPal".
4. WHEN `npm --prefix apps/storefront run typecheck` corre THE SYSTEM SHALL salir con 0.

**Verify**
```bash
npm --prefix apps/storefront run typecheck                                         # expect: exit 0
node apps/storefront/scripts/check-tokens.mjs                                      # expect: exit 0
npm run test:e2e -- e2e/checkout-spei.spec.ts                                      # expect: exit 0, 0 failed
npm run test:e2e -- e2e/catalogo.spec.ts                                           # expect: exit 0 — el paso 15 sigue verde
```

**Checkpoint**
```bash
git add -A && git commit -m "step 18: checkout mexico"
git tag step-18-checkout
```


---

## E3-T4 — Paso 19: Cuenta: solicitar factura

**Depende de:** E2-T5, E3-T3 · **Checkpoint:** `step-19-cuenta`

**Files**
- `apps/storefront/src/modules/order/components/invoice-request/index.tsx`
- `apps/storefront/src/lib/data/invoices.ts`
- `apps/storefront/src/modules/order/templates/order-details-template.tsx`
- `e2e/cuenta-factura.spec.ts`
- `apps/storefront/src/app/api/invoices/[id]/pdf/route.ts`

**Do**

- `apps/storefront/src/modules/order/components/invoice-request/index.tsx` (cliente con server action):
  - Formulario "Solicitar factura" con campos etiquetados `RFC`, `Razón social`, `Régimen fiscal` (select con 601, 603, 605, 606, 612, 616, 621, 626), `Código postal` y `Uso del CFDI` (select con G01, G03, S01).
  - Hace `POST /store/invoices` con una server action `solicitarFactura` en `apps/storefront/src/lib/data/invoices.ts` (`fetch` con `getAuthHeaders()` y `x-publishable-api-key`). Devuelve `{ ok, id, uuid }` o `{ ok: false, codigo, mensaje }`. No usa `sdk.client.fetch`, porque su `FetchError` solo conserva `message` y las rutas propias responden `{ codigo, mensaje }`.
  - Si sale bien, muestra `Factura emitida` y el uuid, con el enlace "Descargar PDF" a `/api/invoices/<id>/pdf`. Es un proxy del storefront, `apps/storefront/src/app/api/invoices/[id]/pdf/route.ts`, que lee la sesión con `getAuthHeaders()` y reenvía a `/store/invoices/<id>/pdf` con la llave publicable. Hace falta porque la cookie `_medusa_jwt` es del dominio del storefront y no viaja al backend. Devuelve `application/pdf` con `Cache-Control: private, no-store`. Si falla, muestra el `mensaje` en `role="alert"`.
  - Mientras envía, el botón dice "Timbrando…".
- `apps/storefront/src/modules/order/templates/order-details-template.tsx`: renderiza `<InvoiceRequest orderId={order.id} />` debajo del resumen del pedido.
- `e2e/cuenta-factura.spec.ts`:
  1. Registrar en `/mx/account` el cliente `e2e+cuenta-<timestamp>@saintdrip.local` y guardar una dirección en `/mx/account/addresses` (Huajuapan, 69000).
  2. Comprar el hoodie con SPEI como en el paso 18, con el usuario autenticado.
  3. Capturar el pago con la Admin API: `GET /admin/orders/:id?fields=payment_collections.payments.id` y luego `POST /admin/payments/:id/capture`. La función `capturarPagoDelPedido(request, orderId)` vive en el propio spec.
  4. En `/mx/account/orders` debe aparecer el pedido. En su detalle, llenar RFC `XAXX010101000`, razón social, régimen 616, CP 69000 y uso S01, y enviar.
  5. Esperar `Factura emitida` y el uuid `00000000-0000-4000-8000-000000000001`. El enlace "Descargar PDF" responde 200 `application/pdf` y el cuerpo empieza con `%PDF` (con `page.request`, que comparte la sesión). Un segundo envío muestra el mensaje de `E_YA_FACTURADO`.

**Acceptance**
1. WHEN un cliente registrado guarda una dirección THE SYSTEM SHALL listarla en `/mx/account/addresses`.
2. WHEN el cliente abre el detalle de su pedido pagado y envía el formulario THE SYSTEM SHALL mostrar `Factura emitida` con el uuid devuelto por FacturAPI (mock).
3. WHEN el cliente vuelve a enviarlo THE SYSTEM SHALL mostrar el mensaje de factura ya emitida en un `role="alert"`.
4. WHEN `npm --prefix apps/storefront run typecheck` corre THE SYSTEM SHALL salir con 0.

**Verify**
```bash
npm --prefix apps/storefront run typecheck                                         # expect: exit 0
npm run test:e2e -- e2e/cuenta-factura.spec.ts                                     # expect: exit 0, 0 failed
npm run test:e2e -- e2e/checkout-spei.spec.ts                                      # expect: exit 0 — el paso 18 sigue verde
```

**Checkpoint**
```bash
git add -A && git commit -m "step 19: cuenta y solicitud de factura"
git tag step-19-cuenta
```


---

## E3-T5 — Paso 20: Endurecimiento: Sentry, vencimiento SPEI, conciliación y CI

**Depende de:** E2-T1, E2-T8, E3-T7, E3-T4 · **Checkpoint:** `step-20-endurecimiento`

**Files**
- `apps/backend/instrumentation.ts`
- `apps/backend/src/lib/reconciliacion.ts`
- `apps/backend/src/jobs/cancelar-spei-vencidos.ts`
- `apps/backend/src/lib/__tests__/reconciliacion.unit.spec.ts`
- `.github/workflows/ci.yml`

**Do**

- `apps/backend/instrumentation.ts` (existe en el scaffold; reemplaza su contenido completo): `export function register() { if (!process.env.SENTRY_DSN) return; Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV, tracesSampleRate: 0.1, dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, databaseQueryData: false } }) }`, con `import * as Sentry from "@sentry/node"`. En `@sentry/node` 11 no existe `sendDefaultPii`: `dataCollection` lo reemplaza, y sus valores por defecto recolectan todo. Medusa carga `instrumentation.ts` desde la raíz del backend al arrancar.
- `apps/backend/src/lib/reconciliacion.ts` (puro):
  - `export function speiVencidos(pagos: { order_id: string; provider_id: string; captured: boolean; vence_en: string }[], ahora: Date): string[]` devuelve los `order_id` SPEI no capturados con `vence_en < ahora`.
  - `export function pedidosSinPago(pedidos: { id: string; created_at: Date; tiene_pago_capturado: boolean; proveedor: string }[], ahora: Date): string[]` devuelve los pedidos con tarjeta o PayPal sin pago capturado después de 1 hora.
- `apps/backend/src/jobs/cancelar-spei-vencidos.ts`:
  - `config = { name: "cancelar-spei-vencidos", schedule: "0 * * * *" }`.
  - Usa `speiVencidos` y ejecuta `cancelOrderWorkflow` por cada pedido, lo que libera la reserva de inventario. Registra `spei.vencido <order_id>` por pedido.
  - En la misma corrida registra `reconciliacion: <n> pedidos sin pago` usando `pedidosSinPago`; Sentry captura ese mensaje cuando n > 0.
- `apps/backend/src/lib/__tests__/reconciliacion.unit.spec.ts`, 4 casos:
  1. Un SPEI vencido no capturado se incluye.
  2. Un SPEI vencido pero capturado se excluye.
  3. Un SPEI no vencido se excluye.
  4. Un pedido con tarjeta sin pago después de 2 h se incluye en `pedidosSinPago`.
- `.github/workflows/ci.yml`. Al hacer push o PR a `main`, corre en `ubuntu-latest` con Node `24.22.3` (`actions/setup-node` con `node-version-file: .nvmrc`):
  - **Servicios:** `postgres:17.12-alpine` (usuario y password `medusa`, base `saint_drip`, puerto 5432, con health-cmd `pg_isready`) y `redis:7.4.12-alpine` en el 6379.
  - **Pasos:** `cp apps/backend/.env.example apps/backend/.env`, `npm ci`, `npm --prefix apps/backend ci`, `npm --prefix apps/storefront ci` y `npx playwright install --with-deps chromium`.
  - **Después:** `npm --prefix apps/backend run db:migrate`, `npm --prefix apps/backend run seed`, `node scripts/write-storefront-env.mjs` y los comandos del gate global de §20.1 en ese orden.

**Acceptance**
1. WHEN un pago SPEI no capturado tiene `vence_en` en el pasado THE SYSTEM SHALL incluir su pedido en `speiVencidos`; WHEN está capturado o no vencido THE SYSTEM SHALL excluirlo.
2. WHEN un pedido con tarjeta lleva más de 1 h sin pago capturado THE SYSTEM SHALL reportarlo en `pedidosSinPago`.
3. WHEN `SENTRY_DSN` no está definido THE SYSTEM SHALL arrancar sin inicializar Sentry (el `/health` sigue OK).
4. WHEN el gate global de §20.1 corre en local THE SYSTEM SHALL salir con 0 en cada línea.

**Verify**
```bash
npm --prefix apps/backend run test:unit -- src/lib/__tests__/reconciliacion.unit.spec.ts   # expect: exit 0, 4 passed
npm --prefix apps/backend run typecheck && npm --prefix apps/backend run build     # expect: exit 0
test -f .github/workflows/ci.yml && grep -q 'postgres:17.12-alpine' .github/workflows/ci.yml   # expect: exit 0
npm --prefix apps/backend run test:unit                                            # expect: exit 0, 0 failed — todos los unit
npm --prefix apps/backend run test:integration:http                                # expect: exit 0, 0 failed — todos los http
npm run test:e2e                                                                   # expect: exit 0, 0 failed — todos los E2E
```

**Checkpoint**
```bash
git add -A && git commit -m "step 20: endurecimiento y ci"
git tag step-20-endurecimiento
```


---

## Epic acceptance

La épica está completa cuando las tareas E3-T1, E3-T2, E3-T6, E3-T7, E3-T3, E3-T4, E3-T5 están `done` en `tasks.json` y `git tag -l 'step-*'` lista los tags de los pasos 1 a 20.
