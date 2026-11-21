# Épica 02 — Pagos, envíos, facturación y correos

> Épica autocontenida del bundle `blueprints/saint-drip/`. Un agente sin contexto la completa sin abrir
> `blueprint.md`. Las tareas son las mismas que en `tasks.json` (mismos ids, criterios, comandos y tags).

## Stack (resumen — no cambiar)

- Node.js 24.22.3 (`.nvmrc`), npm 11.19.1, un proyecto npm por app con `--prefix` (sin workspaces).
- Backend `apps/backend`: Medusa 2.23.0 (Postgres 17.9, Redis 7.4.9 vía `docker-compose.yml`), Jest 29 (del scaffold) + `@medusajs/test-utils` 2.23.0.
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
  apps/backend/{medusa-config.ts,jest.config.js,.env.example,.env.test,instrumentation.ts}
  apps/backend/integration-tests/{setup.js,http/*.spec.ts}
  apps/backend/src/{scripts,lib,workflows,api,admin,modules,jobs,subscribers}/
  apps/storefront/{scripts/check-tokens.mjs,tailwind.config.js,src/}
  blueprints/saint-drip/   ← este bundle
```


## Tareas de esta épica

E2-T1, E2-T2, E2-T3, E2-T4, E2-T5, E2-T6, E2-T7, E2-T8 — pasos 6 a 13 del blueprint.


---

## E2-T1 — Paso 6: Proveedor de pago SPEI

**Depende de:** E1-T2 · **Checkpoint:** `step-06-spei`

**Files**
- `apps/backend/src/modules/spei-payment/service.ts`
- `apps/backend/src/modules/spei-payment/index.ts`
- `apps/backend/src/modules/spei-payment/__tests__/spei.unit.spec.ts`
- `apps/backend/medusa-config.ts`

**Do**

- `apps/backend/src/modules/spei-payment/service.ts`: `class SpeiPaymentService extends AbstractPaymentProvider<Options>` con `static identifier = "spei"`.
  - **Opciones:** `{ mode: "mock" | "live"; apiKey?: string; webhookSecret?: string; expiresHours: number }`. El constructor recibe `(container, options)` y crea `new Stripe(options.apiKey)` solo en `live`. Un segundo parámetro opcional `deps?: { stripe?: StripeLike }` permite inyectar un doble en los tests.
  - **`initiatePayment({ amount, currency_code, context, data })`:**
    - En `live`: `stripe.customers.create({ email })`, con el email de `context.customer.email` o, si no hay, de `data.email`. Después `stripe.paymentIntents.create({ amount: Math.round(Number(amount) * 100), currency: "mxn", customer, payment_method_types: ["customer_balance"], payment_method_data: { type: "customer_balance" }, payment_method_options: { customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "mx_bank_transfer" } } }, confirm: true, metadata: { session_id: data.session_id } })`.
    - Devuelve `{ id: pi.id, data: { payment_intent_id, clabe, banco, referencia, monto, vence_en } }`. Toma `clabe` y `banco` de `next_action.display_bank_transfer_instructions.financial_addresses[0].spei.{clabe,bank_name}`, `referencia` de `…display_bank_transfer_instructions.reference` y `vence_en` = ahora + `expiresHours` en ISO.
    - En `mock`: `clabe "000000000000000001"`, `banco "BANCO DE PRUEBAS"`, `referencia "SD-MOCK-REF"` y `payment_intent_id` = `"pi_mock_" + data.session_id`.
  - **`authorizePayment`:** devuelve `{ status: "authorized", data }`. Las instrucciones ya se emitieron; el dinero se captura con el webhook.
  - **`capturePayment`:**
    - En `live`: `paymentIntents.retrieve`. Si `status !== "succeeded"`, lanza `MedusaError(NOT_ALLOWED, "La transferencia SPEI aún no se recibe")`.
    - En `mock`: devuelve `data`.
  - **`cancelPayment`:** `paymentIntents.cancel` en `live`; en `mock` no hace nada.
  - **`refundPayment`:** lanza `MedusaError(NOT_ALLOWED, "El reembolso SPEI se hace por transferencia manual (blueprint §14)")`.
  - **`getPaymentStatus`:** según el estado del PI: `succeeded` → `captured`, `canceled` → `canceled` y cualquier otro → `authorized`.
  - **`retrievePayment`, `updatePayment` y `deletePayment`:** son triviales.
  - **`getWebhookActionAndData`:** se comporta según §5. En `mock` devuelve `{ action: "not_supported" }`.
- `apps/backend/src/modules/spei-payment/index.ts`: `export default ModuleProvider(Modules.PAYMENT, { services: [SpeiPaymentService] })`.
- `apps/backend/src/modules/spei-payment/__tests__/spei.unit.spec.ts` (instancia el servicio con un `stripe` doble hecho de `jest.fn()`), 5 casos:
  1. En `live`, `initiatePayment({ amount: 1448, … })` llama `paymentIntents.create` con `amount: 144800` y `payment_method_options.customer_balance.bank_transfer.type === "mx_bank_transfer"`, y devuelve la `clabe` del doble.
  2. En `mock` devuelve la CLABE `000000000000000001`.
  3. Si `constructEvent` lanza un error → acción `failed`.
  4. Un evento `payment_intent.succeeded` con `amount_received: 144800` → `{ action: "captured", data: { session_id, amount: 1448 } }`.
  5. `capturePayment` con un PI en `requires_action` lanza `NOT_ALLOWED`.
- `apps/backend/medusa-config.ts`: agrega en `payment.options.providers`, sin condición, `{ resolve: "./src/modules/spei-payment", id: "spei", options: { mode: process.env.SPEI_MODE === "live" ? "live" : "mock", apiKey: process.env.STRIPE_API_KEY, webhookSecret: process.env.SPEI_WEBHOOK_SECRET, expiresHours: 72 } }`.

**Acceptance**
1. WHEN `initiatePayment` recibe 1448 MXN en modo live THE SYSTEM SHALL crear el PaymentIntent con `amount: 144800`, `mx_bank_transfer` y devolver CLABE, banco y referencia (test unitario).
2. WHEN llega un webhook `payment_intent.succeeded` con firma válida THE SYSTEM SHALL devolver la acción `captured` con `amount: 1448`; con firma inválida, `failed`.
3. WHEN se intenta capturar un PI que no está `succeeded` THE SYSTEM SHALL lanzar `NOT_ALLOWED`.
4. WHEN el seed corre después de registrar el proveedor THE SYSTEM SHALL ofrecer `pp_spei_spei` en la región México por la Store API.

**Verify**
```bash
npm --prefix apps/backend run test:unit -- src/modules/spei-payment                # expect: exit 0, 5 passed
npm --prefix apps/backend run typecheck                                            # expect: exit 0
npm --prefix apps/backend run seed                                                 # expect: exit 0 — liga el proveedor a la región
node scripts/with-server.mjs "npm --prefix apps/backend run dev" http://localhost:9000/health OK 240 -- node scripts/store-check.mjs payment-provider pp_spei_spei   # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 6: proveedor de pago spei"
git tag step-06-spei
```


---

## E2-T2 — Paso 7: Proveedor de pago PayPal

**Depende de:** E1-T2 · **Checkpoint:** `step-07-paypal`

**Files**
- `apps/backend/src/modules/paypal-payment/gateway.ts`
- `apps/backend/src/modules/paypal-payment/service.ts`
- `apps/backend/src/modules/paypal-payment/index.ts`
- `apps/backend/src/modules/paypal-payment/__tests__/paypal.unit.spec.ts`
- `apps/backend/medusa-config.ts`

**Do**

- `apps/backend/src/modules/paypal-payment/gateway.ts`: `export interface PayPalGateway { crearOrden(montoMxn: string, sessionId: string): Promise<{ id: string }>; estadoOrden(id: string): Promise<"CREATED" | "APPROVED" | "COMPLETED" | "VOIDED" | string>; capturarOrden(id: string): Promise<{ captureId: string; status: string }>; reembolsar(captureId: string, montoMxn: string): Promise<{ id: string }>; verificarWebhook(headers: Record<string, string>, body: unknown): Promise<boolean> }`.
  - **`crearPayPalGateway(opts)`** implementa la interfaz con `@paypal/paypal-server-sdk`:
    - cliente: `new Client({ clientCredentialsAuthCredentials: { oAuthClientId, oAuthClientSecret }, environment: env === "live" ? Environment.Production : Environment.Sandbox })`;
    - `new OrdersController(client)`: `createOrder({ body: { intent: CheckoutPaymentIntent.Capture, purchaseUnits: [{ amount: { currencyCode: "MXN", value }, customId: sessionId }] } })`, `getOrder({ id })` y `captureOrder({ id })`;
    - `new PaymentsController(client).refundCapturedPayment({ captureId, body: { amount: { currencyCode: "MXN", value } } })`.
  - **`verificarWebhook`** hace `POST {base}/v1/notifications/verify-webhook-signature` con `fetch`, usando el token OAuth del mismo cliente, y devuelve `verification_status === "SUCCESS"`. `base` es `https://api-m.paypal.com` en live o `https://api-m.sandbox.paypal.com` en sandbox.
  - **`crearPayPalGatewayMock()`:** `crearOrden` → `{ id: "PAYPAL-MOCK-ORDER" }`, `estadoOrden` → `"APPROVED"` y `capturarOrden` → `{ captureId: "PAYPAL-MOCK-CAPTURE", status: "COMPLETED" }`.
- `apps/backend/src/modules/paypal-payment/service.ts`: `static identifier = "paypal"`, con opciones `{ environment: "mock" | "sandbox" | "live"; clientId?; clientSecret?; webhookId? }`. El gateway se inyecta por un segundo parámetro opcional, igual que en SPEI.
  - **`initiatePayment`:** `crearOrden(Number(amount).toFixed(2), data.session_id)` → `{ id, data: { paypal_order_id } }`.
  - **`authorizePayment`:**
    - si el estado es `APPROVED`, `capturarOrden`; si responde `COMPLETED`, devuelve `{ status: "captured", data: { …, capture_id } }`;
    - si el estado es `CREATED` → `{ status: "pending" }`;
    - cualquier otro → `{ status: "error" }`.
  - **`refundPayment`:** `reembolsar(capture_id, monto)`.
  - **`getWebhookActionAndData`:** si `verificarWebhook` es falso → `failed`. `PAYMENT.CAPTURE.COMPLETED` → `captured` con `session_id = resource.custom_id` y `amount = Number(resource.amount.value)`. Cualquier otro evento → `not_supported`.
- `apps/backend/src/modules/paypal-payment/index.ts`: `ModuleProvider(Modules.PAYMENT, { services: [PayPalPaymentService] })`.
- `apps/backend/src/modules/paypal-payment/__tests__/paypal.unit.spec.ts`, 5 casos con un gateway doble:
  1. `initiatePayment({ amount: 1448 })` llama `crearOrden("1448.00", …)`.
  2. Una orden `APPROVED` → `captured` con `capture_id`.
  3. Una orden `CREATED` → `pending`.
  4. Un webhook con firma inválida → `failed`.
  5. `PAYMENT.CAPTURE.COMPLETED` con `amount.value "1448.00"` → `captured` con `amount: 1448`.
- `apps/backend/medusa-config.ts`: agrega `{ resolve: "./src/modules/paypal-payment", id: "paypal", options: { environment: process.env.PAYPAL_ENVIRONMENT ?? "mock", clientId: process.env.PAYPAL_CLIENT_ID, clientSecret: process.env.PAYPAL_CLIENT_SECRET, webhookId: process.env.PAYPAL_WEBHOOK_ID } }`.

**Acceptance**
1. WHEN `initiatePayment` recibe 1448 THE SYSTEM SHALL crear la orden de PayPal con el valor `"1448.00"` MXN.
2. WHEN la orden está `APPROVED` THE SYSTEM SHALL capturarla y devolver `captured`; WHEN está `CREATED` THE SYSTEM SHALL devolver `pending`.
3. WHEN llega un webhook cuya firma PayPal no verifica THE SYSTEM SHALL devolver `failed` sin capturar.
4. WHEN el seed corre THE SYSTEM SHALL ofrecer `pp_paypal_paypal` en la región México.

**Verify**
```bash
npm --prefix apps/backend run test:unit -- src/modules/paypal-payment              # expect: exit 0, 5 passed
npm --prefix apps/backend run typecheck                                            # expect: exit 0
npm --prefix apps/backend run seed                                                 # expect: exit 0
node scripts/with-server.mjs "npm --prefix apps/backend run dev" http://localhost:9000/health OK 240 -- node scripts/store-check.mjs payment-provider pp_paypal_paypal   # expect: exit 0
npm --prefix apps/backend run test:unit -- src/modules/spei-payment                # expect: exit 0 — el paso 6 sigue verde
```

**Checkpoint**
```bash
git add -A && git commit -m "step 7: proveedor de pago paypal"
git tag step-07-paypal
```


---

## E2-T3 — Paso 8: Proveedor de envíos Envia.com

**Depende de:** E1-T2 · **Checkpoint:** `step-08-envia`

**Files**
- `apps/backend/src/modules/envia-fulfillment/gateway.ts`
- `apps/backend/src/modules/envia-fulfillment/service.ts`
- `apps/backend/src/modules/envia-fulfillment/index.ts`
- `apps/backend/src/modules/envia-fulfillment/__tests__/envia.unit.spec.ts`
- `apps/backend/medusa-config.ts`

**Do**

- `apps/backend/src/modules/envia-fulfillment/gateway.ts`: `export interface EnviaGateway { cotizar(req: { origenCp: string; destinoCp: string; destinoEstado: string; pesoKg: number; largoCm: number; anchoCm: number; altoCm: number }): Promise<{ carrier: string; servicio: string; tipo: "terrestre" | "express"; total: number; dias: string }[]>; generarGuia(req: { …cotización elegida…, destino: Direccion }): Promise<{ tracking: string; carrier: string; etiquetaUrl: string; rastreoUrl: string }>; cancelarGuia(tracking: string, carrier: string): Promise<void> }`.
  - **`crearEnviaGateway({ token, environment })`** la implementa con `fetch` contra `https://api.envia.com` (producción) o `https://api-test.envia.com` (sandbox): `POST /ship/rate/`, `POST /ship/generate/` y `POST /ship/cancel/`, con `Authorization: Bearer {token}` y los cuerpos que documenta https://docs.envia.com. Clasifica como `express` los servicios aéreos o al día siguiente según el campo de tipo de servicio de Envia; el resto queda como `terrestre`.
  - **`crearEnviaGatewayMock()`:** `cotizar` devuelve `[{ carrier: "mock", servicio: "ground", tipo: "terrestre", total: 149, dias: "3-5" }, { carrier: "mock", servicio: "express", tipo: "express", total: 249, dias: "1-2" }]` y `generarGuia` devuelve `{ tracking: "MOCK123456", carrier: "mock", etiquetaUrl: "http://localhost:9000/static/guia-mock.pdf", rastreoUrl: "https://envia.com/rastreo?label=MOCK123456" }`.
- `apps/backend/src/modules/envia-fulfillment/service.ts`: `class EnviaFulfillmentService extends AbstractFulfillmentProviderService`, `static identifier = "envia"`, con opciones `{ environment: "mock" | "sandbox" | "production"; token?: string; origenCp: string }`.
  - **`getFulfillmentOptions()`:** devuelve `[{ id: "envia-terrestre", name: "Envío terrestre" }, { id: "envia-express", name: "Envío express" }]`, los mismos ids que `SEED.enviaOptions`.
  - **`validateOption` y `validateFulfillmentData`:** validan que `data.id` esté entre esos ids.
  - **`canCalculate`:** devuelve `true`.
  - **`calculatePrice(optionData, data, context)`:**
    - Si `optionData.id === "envia-express"` y algún `context.items[].variant.product.metadata.solo_terrestre === true`, lanza `MedusaError(NOT_ALLOWED, "Este pedido contiene productos que solo pueden enviarse por tierra")`.
    - Si no, cotiza un paquete: peso = suma de `variant.weight × quantity` en kg, y medidas = máximo de largo y ancho y suma de alto.
    - Elige la tarifa más barata del `tipo` pedido y devuelve `{ calculated_amount: total, is_calculated_price_tax_inclusive: true }`.
    - Si no hay tarifas de ese tipo, lanza `MedusaError(NOT_FOUND, "Sin tarifas de Envia para este código postal")`.
    - En `sandbox` o `production` sin `token`, lanza `MedusaError(INVALID_DATA, "ENVIA_API_TOKEN no configurado")`.
  - **`createFulfillment`:** `generarGuia` → `{ data: { tracking, carrier }, labels: [{ tracking_number, tracking_url, label_url }] }`.
  - **`cancelFulfillment`:** `cancelarGuia`.
- `apps/backend/src/modules/envia-fulfillment/index.ts`: `ModuleProvider(Modules.FULFILLMENT, { services: [EnviaFulfillmentService] })`.
- `apps/backend/src/modules/envia-fulfillment/__tests__/envia.unit.spec.ts`, 5 casos:
  1. En `mock`, terrestre → 149.
  2. Express con un item `solo_terrestre` → lanza el mensaje exacto.
  3. Con un gateway doble que devuelve 3 tarifas terrestres (210, 180, 199) → 180.
  4. `createFulfillment` → `labels[0].tracking_number === "MOCK123456"`.
  5. `production` sin token → lanza `ENVIA_API_TOKEN no configurado`.
- `apps/backend/medusa-config.ts`: agrega en `fulfillment.options.providers` `{ resolve: "./src/modules/envia-fulfillment", id: "envia", options: { environment: process.env.ENVIA_ENVIRONMENT ?? "mock", token: process.env.ENVIA_API_TOKEN, origenCp: "69000" } }`.

**Acceptance**
1. WHEN se cotiza terrestre en modo mock THE SYSTEM SHALL devolver 149 MXN IVA incluido.
2. WHEN el carrito tiene un producto `solo_terrestre` y se cotiza express THE SYSTEM SHALL lanzar "Este pedido contiene productos que solo pueden enviarse por tierra".
3. WHEN Envia devuelve varias tarifas terrestres THE SYSTEM SHALL elegir la más barata (180 entre 210/180/199).
4. WHEN se genera el fulfillment THE SYSTEM SHALL devolver una etiqueta con número de rastreo.
5. WHEN el seed corre con el proveedor registrado THE SYSTEM SHALL exponer "Envío terrestre" como opción de envío para un carrito de la región México.

**Verify**
```bash
npm --prefix apps/backend run test:unit -- src/modules/envia-fulfillment           # expect: exit 0, 5 passed
npm --prefix apps/backend run typecheck                                            # expect: exit 0
npm --prefix apps/backend run seed                                                 # expect: exit 0 — crea las 2 opciones de envío
node scripts/with-server.mjs "npm --prefix apps/backend run dev" http://localhost:9000/health OK 240 -- node scripts/store-check.mjs shipping-option "Envío terrestre"   # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 8: proveedor de envios envia"
git tag step-08-envia
```


---

## E2-T4 — Paso 9: Módulo CFDI (modelo y gateway FacturAPI)

**Depende de:** E1-T2 · **Checkpoint:** `step-09-cfdi-modulo`

**Files**
- `apps/backend/src/modules/facturapi/models/cfdi-invoice.ts`
- `apps/backend/src/modules/facturapi/gateway.ts`
- `apps/backend/src/modules/facturapi/service.ts`
- `apps/backend/src/modules/facturapi/index.ts`
- `apps/backend/medusa-config.ts`
- `apps/backend/src/modules/facturapi/migrations/*`

**Do**

- `apps/backend/src/modules/facturapi/models/cfdi-invoice.ts`: exactamente el schema de §4.
- `apps/backend/src/modules/facturapi/gateway.ts`: `export interface FacturapiGateway { timbrar(cfdi: CfdiEntrada): Promise<{ id: string; uuid: string; total: number }>; pdf(id: string): Promise<Buffer> }`, donde `CfdiEntrada = { receptor: { rfc; razon_social; regimen_fiscal; codigo_postal }; uso_cfdi: string; items: { descripcion: string; precio: number; cantidad: number }[]; global?: { periodicidad: "month"; mes: string; anio: number } }`. Los precios llevan IVA 16 % incluido.
  - **`crearFacturapiGateway(key)`** usa `new Facturapi(key)` y `facturapi.invoices.create`, con customer `{ legal_name, tax_id, tax_system, address: { zip } }`, `use`, `items: [{ quantity, product: { description, product_key: "01010101", price, tax_included: true } }]`, `payment_form: "03"` y el campo `global` cuando aplica. `pdf` usa `facturapi.invoices.downloadPdf`.
  - **`crearFacturapiGatewayMock()`:** devuelve `{ id: "facturapi_mock_<n>", uuid: "00000000-0000-4000-8000-000000000001", total }` y un PDF de 4 bytes `%PDF`.
- `apps/backend/src/modules/facturapi/service.ts`: `class FacturapiModuleService extends MedusaService({ CfdiInvoice })`. El constructor lee las opciones `{ mode, key }` y elige el gateway. Expone `gateway()`.
- `apps/backend/src/modules/facturapi/index.ts`: `export const FACTURAPI_MODULE = "facturapi"; export default Module(FACTURAPI_MODULE, { service: FacturapiModuleService })`.
- `apps/backend/medusa-config.ts`: agrega en `modules` `{ resolve: "./src/modules/facturapi", options: { mode: process.env.FACTURAPI_MODE === "live" ? "live" : "mock", key: process.env.FACTURAPI_KEY } }`.
- Genera la migración con `npm --prefix apps/backend run db:generate -- facturapi`. El archivo lo nombra la herramienta y queda bajo `src/modules/facturapi/migrations/`. Aplícala con `db:migrate`.

**Acceptance**
1. WHEN `npm --prefix apps/backend run db:migrate` corre THE SYSTEM SHALL salir con 0 y la tabla `cfdi_invoice` SHALL existir.
2. WHEN se inspecciona `cfdi_invoice` THE SYSTEM SHALL tener los índices únicos parciales sobre `order_id` y `period`.
3. WHEN `npm --prefix apps/backend run build` corre THE SYSTEM SHALL salir con 0 con el módulo registrado.

**Verify**
```bash
test -n "$(ls apps/backend/src/modules/facturapi/migrations/*.ts 2>/dev/null)"     # expect: exit 0 — db:generate emitió una migración
npm --prefix apps/backend run db:migrate                                           # expect: exit 0
test "$(docker compose exec -T postgres psql -U medusa -d saint_drip -tAc "select to_regclass('public.cfdi_invoice') is not null")" = t   # expect: exit 0
test "$(docker compose exec -T postgres psql -U medusa -d saint_drip -tAc "select count(*) from pg_indexes where tablename = 'cfdi_invoice' and indexdef like '%UNIQUE%' and (indexdef like '%(order_id)%' or indexdef like '%(period)%')")" = 2   # expect: exit 0 — los dos índices únicos de §4
npm --prefix apps/backend run typecheck && npm --prefix apps/backend run build     # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 9: modulo cfdi"
git tag step-09-cfdi-modulo
```


---

## E2-T5 — Paso 10: Solicitud de factura del cliente

**Depende de:** E2-T1, E2-T4 · **Checkpoint:** `step-10-cfdi-solicitud`

**Files**
- `apps/backend/src/lib/cfdi/reglas.ts`
- `apps/backend/src/api/store/invoices/route.ts`
- `apps/backend/src/api/store/invoices/[id]/pdf/route.ts`
- `apps/backend/src/api/middlewares.ts`
- `apps/backend/integration-tests/http/invoices.spec.ts`

**Do**

- `apps/backend/src/lib/cfdi/reglas.ts` (puro, sin `@medusajs/*`):
  - `export function periodoDe(fecha: Date): string`: `YYYY-MM` en America/Mexico_City, con `Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" })`.
  - `export function validarSolicitud(p: { pedido: { customer_id: string | null; created_at: Date; pago_capturado: boolean; ya_facturado: boolean }; cliente_id: string; ahora: Date }): null | { status: number; codigo: string; mensaje: string }`. Revisa en este orden: `E_NO_ES_TU_PEDIDO` 403, `E_YA_FACTURADO` 409, `E_PAGO_PENDIENTE` 422 y `E_FUERA_DE_PERIODO` 422, que aplica si `periodoDe(created_at) !== periodoDe(ahora)`.
- `apps/backend/src/api/store/invoices/route.ts`: `POST` según §5.
  - Valida el body con zod.
  - Lee el pedido con `query.graph({ entity: "order", fields: ["id","customer_id","created_at","total","items.title","items.quantity","items.total","payment_collections.status"], filters: { id } })`. `pago_capturado` = alguna `payment_collection.status` igual a `completed`.
  - Revisa si ya existe un CFDI individual del pedido y aplica `validarSolicitud`.
  - Timbra con un item por línea del pedido (`precio = item.total / item.quantity`) y guarda `cfdi_invoice` con `kind: "individual"`, `order_ids: { ids: [id] }` y `rfc`.
  - Responde 201 `{ id, uuid }`. Un error del gateway se traduce a 502 `E_PAC`.
- `apps/backend/src/api/store/invoices/[id]/pdf/route.ts`: `GET` busca la factura y comprueba que el pedido sea del cliente autenticado (si no, 403 `E_NO_ES_TU_PEDIDO`). Devuelve el PDF con `Content-Type: application/pdf`.
- `apps/backend/src/api/middlewares.ts`: agrega al mismo arreglo `routes` la entrada `{ matcher: "/store/invoices*", middlewares: [authenticate("customer", ["session", "bearer"])] }`, con `authenticate` importado de `@medusajs/framework/http` en el import existente, junto a `configureStoreSearch` y `defineMiddlewares`. Las entradas de `/store/search` y `/admin/catalog-import/*` no cambian.
- `apps/backend/integration-tests/http/invoices.spec.ts`:
  - **Preparación:** seed. Registrar un cliente con `POST /auth/customer/emailpass/register` y `POST /store/customers` (header `x-publishable-api-key` con la llave del seed). Crear su pedido con el workflow `createOrderWorkflow` de `@medusajs/medusa/core-flows`, a nombre de ese cliente, en la región México, con una línea de 1299 y `created_at` = hoy. Marcar el pago como capturado creando y capturando una payment collection con el proveedor `pp_system_default`.
  - **Casos:**
    1. `POST /store/invoices` con RFC `XAXX010101000` → 201 y uuid `00000000-0000-4000-8000-000000000001`.
    2. Repetir la solicitud → 409 `E_YA_FACTURADO`.
    3. Otro cliente sobre ese pedido → 403 `E_NO_ES_TU_PEDIDO`.
    4. Un pedido sin pago capturado → 422 `E_PAGO_PENDIENTE`.
    5. Sin autenticación → 401.

**Acceptance**
1. WHEN el dueño de un pedido pagado del mes solicita su CFDI THE SYSTEM SHALL responder 201 con el uuid y guardar exactamente 1 `cfdi_invoice` con `kind='individual'`.
2. WHEN se solicita por segunda vez THE SYSTEM SHALL responder 409 `E_YA_FACTURADO`.
3. WHEN otro cliente lo solicita THE SYSTEM SHALL responder 403 `E_NO_ES_TU_PEDIDO`.
4. WHEN el pago no está capturado THE SYSTEM SHALL responder 422 `E_PAGO_PENDIENTE`.
5. WHEN la petición no está autenticada THE SYSTEM SHALL responder 401.

**Verify**
```bash
npm --prefix apps/backend run typecheck                                            # expect: exit 0
npm --prefix apps/backend run test:integration:http -- integration-tests/http/invoices.spec.ts   # expect: exit 0, 5 passed
npm --prefix apps/backend run test:integration:http -- integration-tests/http/catalog-import.spec.ts   # expect: exit 0 — middlewares editado sin romper el paso 4
```

**Checkpoint**
```bash
git add -A && git commit -m "step 10: solicitud de factura del cliente"
git tag step-10-cfdi-solicitud
```


---

## E2-T6 — Paso 11: Factura global mensual automática

**Depende de:** E2-T5 · **Checkpoint:** `step-11-cfdi-global`

**Files**
- `apps/backend/src/lib/cfdi/reglas.ts`
- `apps/backend/src/jobs/factura-global.ts`
- `apps/backend/src/lib/cfdi/__tests__/reglas.unit.spec.ts`

**Do**

- `apps/backend/src/lib/cfdi/reglas.ts`: agrega `export function periodoAnterior(ahora: Date): { periodo: string; mes: string; anio: number }` (mes anterior en America/Mexico_City; `mes` con dos dígitos) y `export function construirFacturaGlobal(pedidos: { id: string; display_id: number; total: number }[], periodo: { mes: string; anio: number }): CfdiEntrada | null`.
  - Si no hay pedidos, devuelve `null`.
  - El receptor es `{ rfc: "XAXX010101000", razon_social: "PUBLICO EN GENERAL", regimen_fiscal: "616", codigo_postal: "69000" }` con `uso_cfdi: "S01"`.
  - Lleva un item por pedido: `descripcion: "Venta pedido #" + display_id`, `precio: total` y `cantidad: 1`.
  - El campo global es `{ periodicidad: "month", mes, anio }`.
- `apps/backend/src/jobs/factura-global.ts`:
  - `export const config = { name: "factura-global", schedule: "0 9 1 * *" }`, que equivale al día 1 a las 03:00 en Ciudad de México (UTC−6, sin horario de verano desde 2022).
  - El handler calcula `periodoAnterior(new Date())`. Si ya existe un `cfdi_invoice` `global` de ese periodo, registra `factura-global: ya existe <periodo>` y termina.
  - Si no, busca los pedidos del periodo con pago capturado que no estén en ningún `cfdi_invoice.order_ids.ids`, timbra y guarda con `kind: "global"`, `period`, `order_ids`, `rfc: "XAXX010101000"` y `total` = suma.
  - Por último registra `factura-global: <periodo> <n> pedidos`.
- `apps/backend/src/lib/cfdi/__tests__/reglas.unit.spec.ts`, 6 casos:
  1. `periodoDe(new Date("2026-12-01T05:30:00Z")) === "2026-11"`: aún es 30 de noviembre en CDMX.
  2. `periodoAnterior(new Date("2027-01-01T09:00:00Z"))` → `{ periodo: "2026-12", mes: "12", anio: 2026 }`.
  3. `construirFacturaGlobal([], …) === null`.
  4. Dos pedidos de 1299 y 899 → 2 items, receptor `XAXX010101000` y `global.mes "11"`.
  5. `validarSolicitud` sobre un pedido ajeno → 403.
  6. Un pedido del mes anterior → `E_FUERA_DE_PERIODO`.

**Acceptance**
1. WHEN `periodoDe` recibe `2026-12-01T05:30:00Z` THE SYSTEM SHALL devolver `2026-11` (hora de Ciudad de México).
2. WHEN `periodoAnterior` corre el 1 de enero de 2027 THE SYSTEM SHALL devolver `2026-12`, mes `12`, año 2026.
3. WHEN `construirFacturaGlobal` recibe cero pedidos THE SYSTEM SHALL devolver `null` (el job no timbra nada).
4. WHEN recibe 2 pedidos THE SYSTEM SHALL producir un CFDI a `XAXX010101000` con 2 conceptos y periodicidad mensual.
5. WHEN `npm --prefix apps/backend run build` corre THE SYSTEM SHALL incluir el job `factura-global` y salir con 0.

**Verify**
```bash
npm --prefix apps/backend run test:unit -- src/lib/cfdi                            # expect: exit 0, 6 passed
npm --prefix apps/backend run typecheck && npm --prefix apps/backend run build     # expect: exit 0
grep -q '"0 9 1 \* \*"' apps/backend/src/jobs/factura-global.ts                    # expect: exit 0 — cron mensual
```

**Checkpoint**
```bash
git add -A && git commit -m "step 11: factura global mensual"
git tag step-11-cfdi-global
```


---

## E2-T7 — Paso 12: Correos transaccionales con Resend

**Depende de:** E1-T2 · **Checkpoint:** `step-12-correos`

**Files**
- `apps/backend/src/lib/emails/templates.ts`
- `apps/backend/src/modules/resend-notification/service.ts`
- `apps/backend/src/modules/resend-notification/index.ts`
- `apps/backend/medusa-config.ts`
- `apps/backend/src/lib/emails/__tests__/templates.unit.spec.ts`

**Do**

- `apps/backend/src/lib/emails/templates.ts` (puro). Funciones que devuelven `{ subject: string; html: string; text: string }`, con montos formateados por `new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" })`:
  - `confirmacionPedido({ display_id, email, total, items: { titulo, variante, cantidad, total }[], urlPedido, spei?: { clabe, banco, referencia, vence_en } })`. El asunto es `Recibimos tu pedido #<display_id>` y, si hay `spei`, el cuerpo incluye un bloque con CLABE, banco, referencia y "Paga antes de <fecha>".
  - `envioGenerado({ display_id, carrier, tracking, rastreoUrl })`, con asunto `Tu pedido #<display_id> va en camino`.
  - `facturaEmitida({ display_id, uuid, urlPdf })`, con asunto `Tu factura del pedido #<display_id>`.
- `apps/backend/src/modules/resend-notification/service.ts`: `class ResendNotificationService extends AbstractNotificationProviderService`, `static identifier = "resend"`, con opciones `{ apiKey; from }`. `send({ to, content: { subject, html, text } })` llama `new Resend(apiKey).emails.send({ from, to, subject, html, text })`; si responde `error`, lanza `MedusaError(UNEXPECTED_STATE, error.message)`.
- `apps/backend/src/modules/resend-notification/index.ts`: `ModuleProvider(Modules.NOTIFICATION, { services: [ResendNotificationService] })`.
- `apps/backend/medusa-config.ts`: en `notification.options.providers`, usa `process.env.RESEND_API_KEY ? { resolve: "./src/modules/resend-notification", id: "resend", options: { channels: ["email"], apiKey: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM } } : <el provider local actual>`. Siempre hay exactamente un proveedor para el canal `email`.
- `apps/backend/src/lib/emails/__tests__/templates.unit.spec.ts`, 5 casos:
  1. `confirmacionPedido` con total 1448 contiene `$1,448.00`, el `urlPedido` y el asunto `Recibimos tu pedido #12`.
  2. Con `spei` contiene la CLABE `000000000000000001` y la referencia.
  3. Sin `spei` no contiene la palabra `CLABE`.
  4. `envioGenerado` contiene el tracking y el `rastreoUrl`.
  5. `facturaEmitida` contiene el uuid.

**Acceptance**
1. WHEN se arma la confirmación de un pedido de 1448 MXN THE SYSTEM SHALL incluir `$1,448.00`, el link al pedido y el asunto con el número de pedido.
2. WHEN el pedido es SPEI THE SYSTEM SHALL incluir CLABE y referencia; WHEN no lo es THE SYSTEM SHALL omitir la palabra CLABE.
3. WHEN se arma el correo de envío THE SYSTEM SHALL incluir número de rastreo y URL de rastreo.
4. WHEN `RESEND_API_KEY` no está definido THE SYSTEM SHALL usar el proveedor local y el backend SHALL arrancar (el gate de `/health` sigue verde).

**Verify**
```bash
npm --prefix apps/backend run test:unit -- src/lib/emails                          # expect: exit 0, 5 passed
npm --prefix apps/backend run typecheck                                            # expect: exit 0
node scripts/with-server.mjs "npm --prefix apps/backend run dev" http://localhost:9000/health OK 240   # expect: exit 0 — sin RESEND_API_KEY arranca con notification-local
```

**Checkpoint**
```bash
git add -A && git commit -m "step 12: correos transaccionales"
git tag step-12-correos
```


---

## E2-T8 — Paso 13: Suscriptores de pedido y envío

**Depende de:** E2-T7 · **Checkpoint:** `step-13-suscriptores`

**Files**
- `apps/backend/src/subscribers/order-placed.ts`
- `apps/backend/src/subscribers/shipment-created.ts`
- `apps/backend/src/subscribers/__tests__/subscribers.unit.spec.ts`

**Do**

- `apps/backend/src/subscribers/order-placed.ts`:
  - `export default async function orderPlacedHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>)` con `export const config: SubscriberConfig = { event: "order.placed" }`.
  - Lee el pedido con `query.graph` (campos `display_id`, `email`, `total`, `items.*` y `payment_collections.payments.provider_id`/`data`).
  - Si el proveedor es `pp_spei_spei`, pasa `spei` desde `payment.data`.
  - Llama `notificationModule.createNotifications({ to: email, channel: "email", template: "confirmacion-pedido", content: confirmacionPedido({ …, urlPedido: STOREFRONT_URL + "/mx/order/" + id + "/confirmed" }) })`.
- `apps/backend/src/subscribers/shipment-created.ts`: evento `shipment.created` con `data.id` del fulfillment. Lee el fulfillment con `labels` y su pedido, y envía `envioGenerado`.
- `apps/backend/src/subscribers/__tests__/subscribers.unit.spec.ts`. Prueba los handlers con un `container` doble cuyo `resolve` devuelve un `query.graph` falso y un `createNotifications` hecho con `jest.fn()`. 3 casos:
  1. Pedido SPEI → `createNotifications` recibe `template "confirmacion-pedido"` y un `content.html` que contiene la CLABE.
  2. Pedido con tarjeta → el html no contiene `CLABE`.
  3. `shipment.created` → `template "envio-generado"` con el tracking `MOCK123456`.

**Acceptance**
1. WHEN se emite `order.placed` para un pedido SPEI THE SYSTEM SHALL enviar exactamente 1 notificación por el canal `email` con plantilla `confirmacion-pedido` que contiene la CLABE.
2. WHEN el pedido se pagó con tarjeta THE SYSTEM SHALL enviar la confirmación sin bloque SPEI.
3. WHEN se emite `shipment.created` THE SYSTEM SHALL enviar `envio-generado` con el número de rastreo de la etiqueta.

**Verify**
```bash
npm --prefix apps/backend run test:unit -- src/subscribers                         # expect: exit 0, 3 passed
npm --prefix apps/backend run typecheck && npm --prefix apps/backend run build     # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 13: suscriptores de pedido y envio"
git tag step-13-suscriptores
```


---

## Epic acceptance

La épica está completa cuando las tareas E2-T1, E2-T2, E2-T3, E2-T4, E2-T5, E2-T6, E2-T7, E2-T8 están `done` en `tasks.json` y `git tag -l 'step-*'` lista los tags de los pasos 1 a 13.
