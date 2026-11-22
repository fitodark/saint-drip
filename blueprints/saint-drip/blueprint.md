# Saint Drip — Tienda en línea — Blueprint

> Generado por The Architect el 2026-11-21
> Shape: E-commerce Storefront · `knowledge/shapes/ecommerce-storefront.md`
> Runtime track: TypeScript / Node.js · `knowledge/runtime-tracks/ts-node.md` (con desviaciones documentadas en §20.3)
> Emission mode: bundle (20 pasos)
> Blueprint version: 1
> Versions last verified: 2026-11-21 (/architect-refresh con stack-researcher en vivo) — ver §11 para la procedencia de cada paquete

---

## 1. Project Overview & Non-Goals

### Vision
Saint Drip es una marca de moda urbana de Huajuapan de León (Oaxaca) que vende ropa, tenis, joyería,
perfumes y accesorios. Hoy vende con un catálogo estático y toma pedidos por WhatsApp. Este proyecto
la convierte en una **tienda en línea con checkout real para toda la República Mexicana**: el cliente
navega por categoría, elige talla, número, mililitros o medida, y paga con **tarjeta (Stripe),
transferencia SPEI con CLABE de referencia (Stripe) o PayPal**. El pedido baja a un admin donde el
equipo gestiona catálogo, inventario, envíos (Envia.com genera guías), clientes, pagos y facturas
CFDI 4.0 (FacturAPI, incluida la factura global mensual automática).

El motor es **Medusa v2 (MIT, gratuito)** y no se construye desde cero: carrito, inventario por variante
y por almacén, regiones, clientes y admin ya existen. Lo que este blueprint añade es lo que México exige
y Medusa no trae: SPEI, PayPal, Envia.com, CFDI y una **carga masiva de catálogo con un Excel más
fotos** desde el admin.

### Users
| Persona | What they come to do | Frequency |
|---|---|---|
| Comprador (invitado o con cuenta) | Ver productos por categoría, elegir variante, pagar y rastrear su pedido; pedir factura | Semanal |
| Operador de la tienda (admin) | Cargar catálogo por Excel, ajustar existencias, surtir y generar guías, revisar pagos SPEI | Diario |
| Dueño / contador | Revisar ventas, facturas individuales y la factura global del mes | Mensual |

### Goals — v1 scope
1. La página principal muestra los productos agrupados por las 5 categorías y cada producto tiene su página de detalle con galería y selector de variante.
2. El checkout cobra en MXN con tarjeta, SPEI o PayPal; cada método es un proveedor de pago de Medusa, de modo que agregar otro es registrar un proveedor nuevo y no tocar el checkout.
3. El envío se cotiza en vivo con Envia.com (terrestre y express), y los productos marcados `solo_terrestre` nunca se ofrecen por express.
4. El admin carga productos nuevos en lote con un Excel (plantilla descargable) más fotos JPG nombradas `{handle}-{n}.jpg`, con validación previa fila por fila.
5. El cliente con cuenta guarda direcciones, ve su historial de pedidos y solicita su CFDI. El sistema timbra cada mes, de forma automática, la factura global de las ventas no facturadas.
6. El modelo de inventario ya soporta varios almacenes; en v1 opera uno ("Almacén Principal").

### Non-Goals — explicitly out of scope for v1
| Not building | Why not now | Revisit when |
|---|---|---|
| Cobro en USD y envíos internacionales | Exige una región nueva, tarifas internacionales y aduana; ~50 pedidos/mes nacionales no lo justifican | Más del 5 % de visitas o consultas vienen del extranjero |
| Descuentos, cupones y promociones | Las reglas de combinación son otra superficie de errores de dinero | La marca planea su primera campaña con código |
| Devoluciones automatizadas (RMA) y reembolsos SPEI automáticos | Con 50 pedidos/mes una devolución manual cuesta minutos; un reembolso SPEI requiere datos bancarios del cliente | Más de 5 devoluciones al mes |
| Actualizar productos existentes por Excel | La carga masiva v1 solo CREA; actualizar precios o existencias en lote exige conciliación y bloqueo | El catálogo pase de 300 SKUs o se hagan cambios de precio por temporada |
| Más de un almacén activo | El modelo ya lo soporta (stock locations); operar dos exige reglas de surtido | Se abra un segundo punto físico |
| Mercado Pago, OXXO y meses sin intereses | Tres proveedores ya cubren el brief; cada uno es un proveedor más que probar | Los datos de abandono muestren que el cliente pide OXXO |
| Guardar tarjetas o datos bancarios del cliente | Pedido explícito del cliente; Stripe y PayPal tokenizan | Nunca en esta plataforma: sería trabajo de Stripe Link |
| Modo oscuro, app móvil y marketplace | Ningún dato los pide; cada uno duplica superficie | Petición explícita de la marca |

**The builder must not implement anything in this table**, even if it seems like a small addition
while working on an adjacent step. If a step appears to require a non-goal, that is a blueprint
defect — stop and report it rather than expanding scope.

### Success metrics
| Metric | Target | How measured |
|---|---|---|
| Pedidos pagados en línea | ≥ 50/mes al tercer mes de lanzamiento | `select count(*) from "order" o join order_payment_collection opc on opc.order_id=o.id join payment_collection pc on pc.id=opc.payment_collection_id where pc.status='completed' and o.created_at >= date_trunc('month', now())` |
| Conversión checkout iniciado → pedido | ≥ 45 % | Carritos con `email` no nulo frente a pedidos creados en el mes (consulta en §16) |
| Pedidos SPEI vencidos sin pago | ≤ 20 % de los SPEI | Job `cancelar-spei-vencidos` (paso 20) registra cada cancelación en el log `spei.vencido` |
| Ventas sin CFDI al cierre de mes | 0 | Job `factura-global` (paso 11) registra `facturas_globales` en el log y en la tabla `cfdi_invoice` |

---

## 2. Tech Stack

**Runtime track: TypeScript / Node.js.** This table names *choices*, not versions. Every version pin
lives in Section 11 and nowhere else.

| Layer | Choice | Why this, over what |
|---|---|---|
| Language / runtime | TypeScript en Node.js 24 LTS | Un solo lenguaje del backend al storefront, que es el que el equipo conoce. Se descartó PHP (WooCommerce) |
| Commerce engine | **Medusa v2** (servidor + worker) | Gratuito (MIT), con catálogo, variantes, inventario multi-almacén, regiones, clientes, pedidos y admin ya hechos. Shopify se descartó: Shopify Payments no está confirmado para México y una pasarela externa suma un 2 % por venta sobre su propia comisión. WooCommerce y Saleor también se descartaron |
| Storefront framework | **Next.js 16 con el Next.js Starter oficial de Medusa** | Ya trae carrito, checkout, cuenta, Stripe Elements, sitemap y `llms.txt` conectados al SDK de Medusa. Se conservan sus versiones de Next y Tailwind 3 (§20.3 #3) |
| Styling | Tailwind CSS (la versión que trae el starter) con tokens CSS de §7 | Es el mecanismo del starter. Meter un segundo mecanismo sería la combinación prohibida de `stack-compatibility` |
| Component layer | Componentes del starter + `@medusajs/ui` en el admin | El admin de Medusa ya usa `@medusajs/ui`; la página de carga masiva se ve nativa |
| Database | PostgreSQL 17 | Transaccional: inventario, pedidos y pagos. Medusa exige Postgres |
| ORM / data access | El de Medusa (MikroORM vía DML `model.define`) y sus migraciones | Medusa es dueño del esquema. Agregar Drizzle o Prisma daría dos sistemas de migración sobre una base, que es una combinación conocida como mala |
| Auth | Módulo Auth de Medusa (`emailpass`) para clientes y admins | Un solo dueño de la sesión. Invitado primero, cuenta opcional |
| Background work | Worker de Medusa (`MEDUSA_WORKER_MODE=worker`) con Redis: event bus, workflow engine, locking; jobs programados | Medusa ya separa servidor y worker; los jobs mensuales y horarios corren ahí |
| Payments | Stripe (tarjeta, proveedor oficial) · **SPEI propio** sobre transferencias MX de Stripe · **PayPal propio** con el SDK de servidor de PayPal | El plugin de PayPal de la comunidad exige Medusa 2.13.6 como peer exacto (§11), así que es incompatible con 2.23.0 |
| Shipping | **Proveedor de fulfillment propio para Envia.com** | Cotización en vivo, guía y rastreo de DHL, Estafeta, FedEx y otras con una sola API |
| Invoicing | **FacturAPI** (SDK oficial) dentro de un módulo propio `facturapi` | Timbrado CFDI 4.0, PDF/XML y factura global sin tener PAC propio |
| File storage | Cloudflare R2 a través de `@medusajs/medusa/file-s3` (en local, `file-local`) | R2 es compatible con S3 y no cobra egress; las fotos de producto son el tráfico más pesado |
| Email / notifications | Módulo Notification de Medusa: `notification-local` en desarrollo y proveedor propio **Resend** en producción | Resend es barato y su SDK es mínimo; las plantillas viven en código y se prueban |
| Hosting | Storefront en **Vercel**. Medusa servidor + worker, Postgres y Redis en **Railway** | Medusa es un proceso de larga vida y no cabe en serverless (fila "long-lived process + request-scoped host" de `stack-compatibility`) |
| Errors | Sentry (`@sentry/node`) en el backend | Un checkout que falla en silencio es dinero que no se ve |
| Package manager | **npm** (el que trae Node 24), un proyecto por app con `--prefix` | Medusa documenta su despliegue con `npm install` dentro de `.medusa/server`. Se descartó pnpm (§20.3 #4) |

### Compatibility check
Revisado contra `knowledge/stack-compatibility.md`: **ninguna de las filas de combinaciones malas
aplica** con estas decisiones:
- **Long-lived process + request-scoped host:** Medusa corre en contenedores de Railway; Vercel solo sirve el storefront.
- **Two migration systems:** solo Medusa migra y no hay ORM adicional.
- **Two identity providers:** solo el módulo Auth de Medusa.
- **A second HTTP framework inside a full-stack framework:** el storefront no monta otro servidor.
- **Utility-CSS + runtime CSS-in-JS:** solo Tailwind.

La fila del linter con parser propio de CSS frente a las at-rules de Tailwind tampoco aplica, porque
este blueprint no manda linter ni formateador (§20.3 #5).

---

## 3. Directory Structure

```
saint-drip/                                   # raíz del proyecto = raíz del repo git
  .gitignore                                  # workspace (§19.6) — existe antes del primer commit
  .nvmrc                                      # workspace — 24.22.3
  package.json                                # workspace — servicios locales + Playwright; sin workspaces npm
  package-lock.json                           # generado por `npm install` (Bootstrap)
  docker-compose.yml                          # workspace — Postgres + Redis con healthcheck
  playwright.config.ts                        # workspace — E2E (levanta backend 9000 + storefront 8000)
  CLAUDE.md  AGENTS.md  .claude/              # workspace — configuración del agente (§19)
  docs/plantilla-catalogo-saint-drip.xlsx     # workspace — plantilla de ejemplo para el equipo
  scripts/
    merge-scaffold.mjs                        # workspace — mezcla la salida de create-medusa-app sin pisar archivos
    write-storefront-env.mjs                  # workspace — escribe la llave publicable en apps/storefront/.env.local
    with-server.mjs                           # workspace — levanta un servidor, espera la URL, corre un chequeo, lo apaga
    store-check.mjs                           # workspace — verifica proveedores de pago / opciones de envío vía Store API
  e2e/
    fixtures/plantilla-valida.xlsx            # workspace — copia del fixture válido
    fixtures/fotos/*.jpg                      # workspace — 4 JPG de prueba nombrados {handle}-{n}.jpg
    helpers/admin.ts                          # paso 5 — sesión de admin, borrar/importar productos del fixture
    carga-masiva.spec.ts                      # paso 5
    a11y.spec.ts                              # paso 17
    cache-catalogo.spec.ts                    # paso 16
    catalogo.spec.ts                          # paso 15
    checkout-spei.spec.ts                     # paso 18
    cuenta-factura.spec.ts                    # paso 19
  .github/workflows/ci.yml                    # paso 20
  apps/
    backend/                                  # Medusa 2.23.0 (scaffold create-medusa-app)
      medusa-config.ts                        # scaffold; reescrito completo en paso 2; editado en 6,7,8,9,12
      instrumentation.ts                      # scaffold; reemplazado en paso 20 — Sentry
      jest.config.js                          # workspace
      tsconfig.json                           # workspace — types jest/node y exclude src/admin (§19.6)
      .env.example  .env.test  .gitignore     # workspace
      integration-tests/setup.js              # workspace
      integration-tests/http/
        health.spec.ts                        # paso 1
        store-setup.spec.ts                   # paso 2
        catalog-import.spec.ts                # paso 4
        invoices.spec.ts                      # paso 10; editado en 13 (correo factura-emitida)
      src/
        scripts/seed-saint-drip.ts            # workspace — configuración idempotente de la tienda
        scripts/print-publishable-key.ts      # workspace
        lib/env.ts                            # paso 2 — validación de variables en producción
        lib/__tests__/env.unit.spec.ts        # paso 2
        lib/catalog-import/                   # paso 3 — lógica pura de la carga masiva (sin Medusa)
          columns.ts  parse.ts  validate.ts  photos.ts
          __fixtures__/plantilla-valida.xlsx  __fixtures__/plantilla-con-errores.xlsx   # workspace
          __tests__/catalog-import.unit.spec.ts
        workflows/import-catalog.ts           # paso 4
        api/middlewares.ts                    # scaffold (configura /store/search); editado en pasos 4 y 10
        api/admin/catalog-import/[accion]/route.ts   # paso 4
        api/store/invoices/route.ts           # paso 10; editado en 13 (correo factura-emitida)
        api/store/invoices/[id]/pdf/route.ts  # paso 10
        admin/tsconfig.json                   # scaffold — lo usa el script typecheck (tsc -p src/admin/tsconfig.json)
        admin/lib/sdk.ts                      # paso 5
        admin/routes/carga-masiva/page.tsx    # paso 5
        modules/spei-payment/                 # paso 6 — index.ts service.ts __tests__/spei.unit.spec.ts
        modules/paypal-payment/               # paso 7 — index.ts service.ts gateway.ts __tests__/paypal.unit.spec.ts
        modules/envia-fulfillment/            # paso 8 — index.ts service.ts gateway.ts __tests__/envia.unit.spec.ts
        modules/facturapi/                    # paso 9 — index.ts service.ts gateway.ts models/cfdi-invoice.ts migrations/ (generadas)
        lib/cfdi/reglas.ts                    # paso 10; editado en 11
        lib/cfdi/__tests__/reglas.unit.spec.ts   # paso 11
        jobs/factura-global.ts                # paso 11
        modules/resend-notification/          # paso 12 — index.ts service.ts
        lib/emails/templates.ts               # paso 12
        lib/emails/__tests__/templates.unit.spec.ts   # paso 12
        subscribers/order-placed.ts           # paso 13
        subscribers/shipment-created.ts       # paso 13
        subscribers/__tests__/subscribers.unit.spec.ts   # paso 13
        jobs/cancelar-spei-vencidos.ts        # paso 20
        lib/reconciliacion.ts                 # paso 20
        lib/__tests__/reconciliacion.unit.spec.ts   # paso 20
    storefront/                               # Next.js Starter de Medusa (scaffold --with-nextjs-starter)
      .env.example  .gitignore                # workspace
      AGENTS.md  CLAUDE.md                    # los genera `next dev` (Next 16) y los vuelve a crear; se commitean tal cual
      scripts/check-tokens.mjs                # paso 14
      tailwind.config.js                      # scaffold; editado en paso 14
      src/styles/globals.css                  # scaffold; editado en pasos 14 y 17 (--fg-muted)
      src/app/layout.tsx                      # scaffold; editado en paso 14
      src/modules/common/components/whatsapp-button/index.tsx   # paso 14
      src/app/[countryCode]/(main)/page.tsx   # scaffold; reescrito en paso 15
      src/modules/home/components/category-rails/index.tsx      # paso 15
      src/modules/products/templates/index.tsx                  # scaffold; editado en paso 15 (JSON-LD + insignia)
      src/app/[countryCode]/(main)/products/[handle]/page.tsx   # scaffold; editado en paso 15 (sin el JSON-LD ProductGroup)
      src/lib/data/products.ts  src/lib/data/categories.ts      # scaffold; editados en paso 16 (revalidate 60)
      src/modules/layout/components/medusa-cta/index.tsx        # scaffold; editado en paso 17 (aria-label)
      src/modules/layout/components/cart-dropdown/index.tsx     # scaffold; editado en paso 17 (sin PopoverButton)
      src/modules/products/components/product-tabs/accordion.tsx  # scaffold; editado en paso 17 (aria-label)
      src/lib/constants.tsx                   # scaffold; editado en paso 18
      src/modules/checkout/components/payment-button/index.tsx  # scaffold; editado en paso 18 (SPEI + PayPal)
      src/modules/checkout/components/shipping/index.tsx        # scaffold; editado en paso 18 (oculta opciones que fallan)
      src/modules/order/templates/order-completed-template.tsx  # scaffold; editado en paso 18 (instrucciones SPEI)
      src/modules/order/components/invoice-request/index.tsx    # paso 19
      src/lib/data/invoices.ts                # paso 19 — server action solicitarFactura (fetch; ver §20.3 #17)
      src/app/api/invoices/[id]/pdf/route.ts  # paso 19 — proxy del PDF del CFDI (reenvía la sesión del cliente)
      src/modules/order/templates/order-details-template.tsx    # scaffold; editado en paso 19
  blueprints/saint-drip/                      # este bundle (se commitea; ninguna herramienta lo recorre — §19.6)
```

**Boundary rules**
- `apps/backend/src/lib/**` es TypeScript puro: no importa `@medusajs/*` salvo tipos. Así lo prueban los tests unitarios sin base de datos y lo puede importar el admin (Vite).
- `apps/backend/src/modules/<x>/gateway.ts` es el **único** lugar que habla con la API externa (PayPal, Envia, FacturAPI). Los `service.ts` reciben el gateway por constructor para que los tests lo reemplacen. El SPEI usa el cliente `stripe` inyectado de la misma forma.
- Toda escritura de catálogo en la carga masiva pasa por `workflows/import-catalog.ts`; las rutas nunca llaman servicios de módulo para escribir.
- El storefront solo habla con Medusa por `@medusajs/js-sdk` (helpers del starter en `src/lib/data/*`), salvo las rutas propias (`/store/invoices*`), que usan `fetch` en la server action `apps/storefront/src/lib/data/invoices.ts` porque `FetchError` de `@medusajs/js-sdk` descarta `{ codigo, mensaje }` (§20.3 #17). Nunca lee la base de datos.
- Montos: Medusa v2 guarda importes en **unidades mayores** (`1299` = $1,299.00 MXN) con precisión BigNumber. La conversión a centavos ocurre **solo** dentro de `gateway.ts` o de `service.ts` del proveedor, justo antes de llamar a Stripe (`Math.round(Number(monto) * 100)`).
- Convención de imports: **NOT APPLICABLE**. Este blueprint no impone forma de especificadores ni alias; cada app conserva la configuración de su scaffold (ver §19.6, matriz de resolución).

---

## 4. Data Model

Medusa es dueño de las entidades de comercio (`product`, `product_variant`, `price`, `inventory_item`,
`inventory_level`, `stock_location`, `cart`, `order`, `payment_collection`, `payment`,
`fulfillment`, `customer`, `customer_address`, `region`, `tax_region`, `api_key`). Este blueprint **no
las redefine**. Usa estos campos y convenciones:

### Entities

**Producto (`product`, de Medusa)**. Contenedor de marketing; no es vendible por sí mismo.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| handle | text | unique | URL `/mx/products/{handle}`; viene de la columna `handle` del Excel |
| status | enum | `draft` \| `published` | Excel `estado`: `borrador` → draft, `publicado` → published |
| metadata.solo_terrestre | boolean | default false | Excel `solo_terrestre` (`SI`/`NO`). El proveedor Envia lo lee para bloquear express |
| categories | m:n | exactamente 1 por producto | Una de las 5 del seed: `ropa`, `tenis`, `joyeria`, `perfumes`, `accesorios` |
| images | 1:n | ordenadas por `n` de `{handle}-{n}.jpg` | La imagen 1 también es `thumbnail` |
| options | 1:n | exactamente 1 opción | Título según `tipo_opcion` (tabla de etiquetas en §5) |

**Variante (`product_variant`, de Medusa)**. **La unidad vendible**, una por fila del Excel.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| sku | text | unique | Excel `sku` |
| weight / length / width / height | int | > 0 | Excel `peso_g` (gramos), `largo_cm`, `ancho_cm`, `alto_cm`. Envia cotiza con ellos |
| manage_inventory | bool | true | Existencias por almacén en `inventory_level` |
| prices | 1:n | una en `mxn` | Unidades mayores (`1299`). La región México es IVA incluido |

**Nivel de inventario (`inventory_level`, de Medusa)**. Existencia de un SKU en una ubicación:
`stocked_quantity` (Excel `existencia`) y `reserved_quantity` (Medusa reserva al completar el carrito).
Hoy hay una sola ubicación, "Almacén Principal"; el modelo ya soporta N.

**Factura CFDI (`cfdi_invoice`, módulo propio `facturapi`, paso 9)**. Una fila por CFDI timbrado.

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | text | PK, prefijo `cfdi` | |
| kind | enum | `individual` \| `global`, not null | individual = pedida por el cliente; global = público en general del mes |
| order_id | text | nullable; unique cuando `kind='individual'` | Pedido facturado (solo individual) |
| period | text | nullable; unique cuando `kind='global'`; formato `YYYY-MM` | Mes de la factura global |
| order_ids | json | not null, default `[]` | Pedidos incluidos (global) o `[order_id]` (individual) |
| facturapi_id | text | unique, not null | Id del documento en FacturAPI |
| uuid | text | not null | Folio fiscal SAT |
| rfc | text | not null | RFC receptor (`XAXX010101000` en la global) |
| total | bigNumber | not null | Total del CFDI en MXN, unidades mayores |
| status | enum | `issued` \| `cancelled`, default `issued` | |
| created_at / updated_at / deleted_at | timestamptz | de Medusa | |

### Relationships
- `product —(1:n)→ product_variant`: Medusa hace cascada al borrar el producto. Un pedido histórico **nunca** depende del producto vivo porque Medusa guarda un snapshot (`order_line_item`).
- `product_variant —(1:1)→ inventory_item —(1:n)→ inventory_level —(n:1)→ stock_location`: lo gestiona Medusa.
- `cfdi_invoice —(n:1, lógico)→ order` por `order_id` / `order_ids`. **Sin FK ni link**: un CFDI timbrado es un documento fiscal y no se borra ni en cascada cuando cambia el pedido.

### Indexes
| Table | Index | Why |
|---|---|---|
| cfdi_invoice | unique (`order_id`) where `kind='individual' and deleted_at is null` | Un pedido se factura una sola vez (`E_YA_FACTURADO`) |
| cfdi_invoice | unique (`period`) where `kind='global' and deleted_at is null` | El job mensual es idempotente: un segundo intento choca con el índice |
| cfdi_invoice | unique (`facturapi_id`) | Conciliación con FacturAPI |

### Schema
```ts
// apps/backend/src/modules/facturapi/models/cfdi-invoice.ts  (paso 9)
import { model } from "@medusajs/framework/utils"

export const CfdiInvoice = model
  .define("cfdi_invoice", {
    id: model.id({ prefix: "cfdi" }).primaryKey(),
    kind: model.enum(["individual", "global"]),
    order_id: model.text().nullable(),
    period: model.text().nullable(),
    order_ids: model.json().default({ ids: [] }),
    facturapi_id: model.text().unique(),
    uuid: model.text(),
    rfc: model.text(),
    total: model.bigNumber(),
    status: model.enum(["issued", "cancelled"]).default("issued"),
  })
  .indexes([
    { on: ["order_id"], unique: true, where: "kind = 'individual' AND deleted_at IS NULL" },
    { on: ["period"], unique: true, where: "kind = 'global' AND deleted_at IS NULL" },
  ])
```
`order_ids` se guarda como `{ "ids": ["order_..."] }` porque el DML de Medusa tipa `json` como
objeto. La tabla de §4 lo describe como lista: esa lista es la propiedad `ids`.

### Migrations
- Solo Medusa migra. Las entidades propias se definen con DML. La migración se genera con `npm --prefix apps/backend run db:generate -- facturapi`: el nombre lo elige la herramienta y nunca se escribe a mano. Se aplica con `npm --prefix apps/backend run db:migrate`.
- Producción: `db:migrate` corre como **paso de deploy** (`predeploy`) en el servicio servidor, nunca al arrancar el worker. Las migraciones son expand-then-contract: nunca se elimina una columna en el mismo deploy que deja de usarla.

### Seed data
`apps/backend/src/scripts/seed-saint-drip.ts` (emitido en el workspace, idempotente) crea:
- el canal de venta "Tienda en línea";
- la tienda en MXN, con la moneda marcada `is_tax_inclusive: true`. Los precios de la carga masiva se crean por `currency_code`, sin regla de región, así que Medusa usa la preferencia de la moneda y no la de la región;
- la región "México" (`mxn`, país `mx`, IVA incluido) y la región fiscal MX con IVA 16 %;
- el almacén "Almacén Principal" (Huajuapan de León, CP 69000);
- el perfil de envío, el fulfillment set "Envíos México" con la zona "Toda la República";
- las opciones de envío de Envia, en cuanto el proveedor existe;
- la llave publicable "Storefront Saint Drip";
- las 5 categorías;
- el admin `admin@saintdrip.local` (contraseña `SEED_ADMIN_PASSWORD`).

También sincroniza los proveedores de pago de la región con todos los proveedores registrados. Comando:
`npm --prefix apps/backend run seed`. **No crea productos**: el catálogo entra por la carga masiva. Los scripts demo del scaffold (`src/migration-scripts/initial-data-seed.ts` y `src/scripts/seed-demo-products.ts`) no se copian (`merge-scaffold.mjs`), así que `db:migrate` no siembra la región Europe ni productos de ejemplo.

---

## 5. API Design

### Conventions
- Rutas propias: `/admin/catalog-import/:accion`, `/store/invoices`, `/store/invoices/:id/pdf`, más los webhooks que Medusa expone por proveedor en `/hooks/payment/{provider_id}` (`stripe_stripe`, `spei_spei`, `paypal_paypal`).
- Envoltorio de error de las rutas propias: `{ "codigo": "<CODIGO>", "mensaje": "<texto en español>" }` con el HTTP status de la tabla. Las rutas nativas de Medusa conservan su formato `{ type, message }`.
- Validación: zod importado de `@medusajs/framework/zod` (el mismo que usa Medusa), con esquemas al inicio de cada `route.ts`.
- Autenticación: `/admin/*` exige sesión o token de admin (Medusa la aplica por defecto). `/store/invoices*` exige cliente autenticado (middleware `authenticate("customer", ["session", "bearer"])` en `src/api/middlewares.ts`, paso 10). Las rutas store exigen además el header `x-publishable-api-key`.
- Límite de tamaño de body: 8 MB en `POST /admin/catalog-import/*` (el Excel viaja en base64).
- Idempotencia: los webhooks de pago pasan por el workflow de Medusa (`processPaymentWorkflow`), que deduplica por sesión de pago. La importación no es idempotente por diseño: el segundo intento con los mismos handles se rechaza con `E_HANDLE_EXISTE` y escribe cero filas.
- Rate limit: ninguno propio en v1. `/store/*` queda detrás del CDN de Vercel para lecturas; ver §14.

### Routes
| Method | Path | Description | Auth | Rate limit |
|---|---|---|---|---|
| GET | `/admin/catalog-import/plantilla` | Descarga la plantilla Excel vacía (`buildPlantilla()`) | admin | — |
| POST | `/admin/catalog-import/validar` | Valida Excel + nombres de fotos y devuelve el reporte; no escribe | admin | — |
| POST | `/admin/catalog-import/importar` | Revalida y crea productos, variantes, precios, inventario e imágenes | admin | — |
| POST | `/admin/uploads` | (nativa de Medusa) sube cada JPG y devuelve su URL | admin | — |
| POST | `/store/invoices` | El cliente solicita el CFDI de su pedido | customer | — |
| GET | `/store/invoices/:id/pdf` | Descarga el PDF del CFDI propio | customer | — |
| POST | `/hooks/payment/spei_spei` | Webhook de Stripe para PaymentIntents SPEI | firma Stripe | — |
| POST | `/hooks/payment/paypal_paypal` | Webhook de PayPal | firma PayPal | — |
| GET | `/health` | (nativa) responde `OK` | público | — |

### Critical endpoints — full detail

#### Carga masiva — contrato del Excel
Hoja `Productos`, fila 1 = encabezados **exactamente en este orden**: `handle, titulo, descripcion,
categoria, tipo_opcion, valor_opcion, sku, precio_mxn, existencia, peso_g, largo_cm, ancho_cm,
alto_cm, solo_terrestre, estado`. Una fila por variante, desde la fila 2. Las filas totalmente vacías
se ignoran. Cada celda se lee como texto recortado (`String(valor).trim()`; las celdas numéricas se
convierten con `String()`, el texto enriquecido se concatena y las vacías quedan como `""`).

| Columna | Regla | Código si falla |
|---|---|---|
| (encabezados) | Igual a la lista anterior, mismo orden | `E_COLUMNAS` (fila 1, columna = primer encabezado distinto) |
| (archivo) | Al menos 1 fila con datos | `E_SIN_FILAS` (fila 1, columna `handle`) |
| todas | No vacía | `E_REQUERIDO` |
| handle | `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 80 caracteres | `E_HANDLE` |
| categoria | `ropa` \| `tenis` \| `joyeria` \| `perfumes` \| `accesorios` | `E_CATEGORIA` |
| tipo_opcion | `talla_ropa` \| `talla_calzado` \| `contenido_ml` \| `medida` \| `unica` | `E_TIPO_OPCION` |
| valor_opcion | talla_ropa ∈ {XCH, CH, M, G, EG, EEG}; talla_calzado número de 22 a 31 en pasos de 0.5 (`25` o `25.5`); contenido_ml entero 1–1000; medida texto ≤ 20 caracteres; unica = `Única` | `E_VALOR_OPCION` |
| sku | `^[A-Z0-9-]{3,40}$`, único en el archivo (se marca la 2.ª aparición) | `E_SKU` / `E_SKU_DUPLICADO` |
| precio_mxn | `^\d{1,7}(\.\d{1,2})?$` y > 0 | `E_PRECIO` |
| existencia | `^\d{1,6}$` (entero ≥ 0) | `E_EXISTENCIA` |
| peso_g, largo_cm, ancho_cm, alto_cm | `^[1-9]\d{0,5}$` | `E_MEDIDA_PAQUETE` |
| solo_terrestre | `SI` \| `NO` | `E_SI_NO` |
| estado | `borrador` \| `publicado` | `E_ESTADO` |
| titulo, descripcion, categoria, tipo_opcion, solo_terrestre, estado | Iguales en todas las filas del mismo handle; se compara con la primera fila del handle y se marca la fila posterior, columna = primer campo distinto | `E_INCONSISTENTE` |
| handle + valor_opcion | No se repite dentro de un handle | `E_VARIANTE_DUPLICADA` |
| handle | No existe ya en la tienda | `E_HANDLE_EXISTE` (en cada fila de ese handle) |
| sku | No existe ya en la tienda | `E_SKU_EXISTE` |

Todas las fallas de una fila se reportan (no solo la primera), en orden de columna.
Cada error es `{ fila, columna, codigo, mensaje }`.

**Fotos:** nombres `^(.+)-(\d+)\.(jpg|jpeg)$` en minúsculas. El grupo 1 es el handle y el grupo 2 el
orden. Un handle del Excel sin fotos va a `fotos_faltantes`; una foto cuyo handle no está en el Excel
va a `fotos_sin_usar`. `valido` es `true` solo si `errores` y `fotos_faltantes` están vacíos.
`fotos_sin_usar` es un aviso y no bloquea.

**Etiquetas de opción:** talla_ropa → "Talla", talla_calzado → "Número", contenido_ml → "Contenido"
(el valor se guarda como `"{n} ml"`), medida → "Medida", unica → "Presentación".

#### `POST /admin/catalog-import/validar`
- Request: `{ "archivo_base64": string (xlsx, ≤ 6 MB decodificado), "fotos": string[] }`
- 200: `{ "valido": boolean, "productos": number, "variantes": number, "errores": ErrorFila[], "fotos_faltantes": string[], "fotos_sin_usar": string[] }`. `productos` y `variantes` cuentan lo que **se crearía** (handles distintos y filas) aunque haya errores.
- 400 `E_CUERPO`: body no cumple el esquema. 400 `E_EXCEL`: el archivo no abre como xlsx o no tiene hoja `Productos`. 401: sin sesión de admin.
- Efectos: ninguno (cero escrituras).

#### `POST /admin/catalog-import/importar`
- Request: `{ "archivo_base64": string, "fotos": { [nombreArchivo]: url } }`, donde las URLs son las que devolvió `POST /admin/uploads`.
- Revalida igual que `validar`, usando `Object.keys(fotos)` como lista de nombres. Si no es válido responde **422** con el mismo cuerpo de `validar` y **cero escrituras**.
- Si es válido ejecuta `importCatalogWorkflow` y responde 200 `{ "creados": number, "handles": string[] }`.
- Efectos, en un solo workflow (si un paso falla, la compensación revierte los productos creados): productos con categoría, canal "Tienda en línea", perfil de envío general, imágenes y thumbnail, opción, variantes con precio MXN y medidas, `metadata.solo_terrestre`; niveles de inventario en "Almacén Principal" con `stocked_quantity = existencia`.
- `GET /admin/catalog-import/plantilla` devuelve 200 con `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` y `Content-Disposition: attachment; filename="plantilla-catalogo-saint-drip.xlsx"`. Una `accion` desconocida responde 404 `E_ACCION`.

#### `POST /store/invoices`
- Request: `{ "order_id": string, "rfc": string (12–13, ^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$), "razon_social": string, "regimen_fiscal": string (3 dígitos), "codigo_postal": string (5 dígitos), "uso_cfdi": string (p. ej. "G03") }`
- 201: `{ "id": string, "uuid": string }`
- Errores:
  - 400 `E_CUERPO`: el body no cumple el esquema.
  - 403 `E_NO_ES_TU_PEDIDO`: el pedido no es del cliente autenticado.
  - 409 `E_YA_FACTURADO`: ya existe un CFDI individual para el pedido.
  - 422 `E_PAGO_PENDIENTE`: el pago no está capturado.
  - 422 `E_FUERA_DE_PERIODO`: el pedido no es del mes calendario en curso (America/Mexico_City), porque ya entró o entrará a la global.
  - 502 `E_PAC`: FacturAPI rechazó; el `mensaje` trae el texto de FacturAPI.
- Efectos: timbra con FacturAPI (`FACTURAPI_MODE=mock` devuelve un uuid fijo `00000000-0000-4000-8000-000000000001`), inserta `cfdi_invoice` con kind `individual` y envía el correo "factura emitida". El envío se agrega en el paso 13, cuando ya existe la plantilla del paso 12.

#### Webhook SPEI `POST /hooks/payment/spei_spei`
- Firma: `stripe.webhooks.constructEvent(rawBody, headers["stripe-signature"], SPEI_WEBHOOK_SECRET)`. Si falla, la acción es `failed` y no hay cambios.
- `payment_intent.succeeded` con `metadata.session_id` → acción `captured` con `amount = amount_received / 100`. Medusa captura el pago y el pedido pasa a pagado.
- Cualquier otro evento → `not_supported` (responde 200 para que Stripe no reintente durante días).

---

## 6. Frontend Architecture

### Routes
| Route | Page | Data source | Auth |
|---|---|---|---|
| `/mx` | Inicio: hero + un carril por cada una de las 5 categorías (hasta 8 productos) | server: `listProducts({ category_id })` por categoría | público |
| `/mx/categories/[...category]` | Lista por categoría (PLP) | server, del starter | público |
| `/mx/store` | Todo el catálogo | server, del starter | público |
| `/mx/products/[handle]` | Detalle (PDP): galería, selector de variante, JSON-LD, insignia "Solo envío terrestre" | server, del starter | público |
| `/mx/cart` | Carrito | dinámico, sin caché | público |
| `/mx/checkout` | Dirección → envío (Envia) → pago (tarjeta/SPEI/PayPal) → revisión | dinámico, sin caché | público (invitado o cuenta) |
| `/mx/order/[id]/confirmed` | Confirmación; con SPEI muestra CLABE, banco, referencia, monto y vencimiento | dinámico | público con el id |
| `/mx/account` (+ `/addresses`, `/orders`, `/orders/details/[id]`) | Cuenta: direcciones, historial y "Solicitar factura" | dinámico | customer |

### Rendering strategy
Es la del starter, con un solo ajuste (la vida de la caché de catálogo, abajo):
- Las páginas de catálogo (inicio, PLP y PDP) se renderizan en servidor con la caché de datos de Next y
  etiquetas por recurso (`next: { tags }` en `src/lib/data/*`). La revalidación es la del starter, más `next.revalidate = 60` en los fetch de catálogo de `src/lib/data/*` (paso 16). Sin eso, `force-cache` sin tags los guarda un año.
- Carrito, checkout, cuenta y confirmación leen cookies (`_medusa_cart_id`, `_medusa_jwt`) y por lo
  tanto son dinámicas. **Nunca** se cachean.
- Precio y disponibilidad salen en el HTML del servidor, y la prueba con JavaScript desactivado (paso 15) lo comprueba.

### Component hierarchy
```
app/[countryCode]/(main)/page.tsx (server)
  Hero (server) — "Exclusividad en cada prenda" + CTA "Ver catálogo"
  CategoryRails (server) — 5 × <section aria-labelledby> con ProductPreview[] del starter
app/[countryCode]/(main)/products/[handle]/page.tsx (server)
  ProductTemplate (server)
    ImageGallery (server)
    ProductInfo (server) + Badge "Solo envío terrestre" si metadata.solo_terrestre
    ProductActions (client) — selector de opción, "Agregar al carrito"
    <script type="application/ld+json"> (server, dentro de ProductTemplate)
layout.tsx (server) → WhatsAppButton (client, fijo abajo a la derecha)
checkout → PaymentButton (client) → { StripeButton | botón SPEI | PayPalPaymentButton }
order/confirmed → OrderCompletedTemplate (server) + bloque "Paga con transferencia SPEI" si el proveedor es pp_spei_spei
```

### State management
- El estado del servidor vive en la caché de datos de Next y en las server actions del starter (`src/lib/data/cart.ts`, etc.). No se agrega ninguna librería de estado global.
- Los formularios (factura, dirección) usan server actions con `useActionState`, como hace el starter.
- El carrito vive en el servidor (cookie con el id) y Medusa recalcula los totales en cada mutación; el cliente nunca envía precios.

### Loading, empty, and error states
| Superficie | Cargando | Vacío | Error |
|---|---|---|---|
| Carril de categoría | skeleton del starter (`SkeletonProductGrid`) | se oculta la sección completa | se oculta la sección y se registra en consola del servidor |
| PLP | skeleton del starter | "Pronto tendremos productos en esta categoría." | `error.tsx` del starter |
| Opciones de envío | spinner del starter | "No hay envíos disponibles para este código postal." | Las opciones cuyo cálculo falla se ocultan; si fallan todas se muestra el texto de vacío |
| Pago SPEI | botón con `isLoading` | — | mensaje del error en `ErrorMessage` del starter |
| Solicitar factura | botón deshabilitado + "Timbrando…" | — | texto del `mensaje` del API en `role="alert"` |
| Carga masiva (admin) | botón deshabilitado + "Validando…"/"Importando…" | "Selecciona el Excel y las fotos." | tabla de errores Fila / Columna / Error |

---

## 7. Design System

Dirección **minimal urbano** a partir de la identidad actual de Saint Drip (logo "SD", tagline
"Exclusividad en cada prenda"). No se pudieron leer los colores del catálogo actual, que se renderiza
en el cliente, así que la paleta se decidió aquí. `ui-ux-pro-max` no estaba instalado; los valores salen
de `knowledge/capabilities/styling.md`. Solo modo claro en v1 (el modo oscuro es Non-Goal).

### Colors
| Token | Light | Dark | Usage |
|---|---|---|---|
| `--color-primary` | #0A0A0A | NOT APPLICABLE — v1 solo claro | botones principales, links, header |
| `--color-primary-fg` | #F4F4F1 | — | texto sobre primary |
| `--color-background` | #F4F4F1 | — | página (blanco hueso) |
| `--color-surface` | #FFFFFF | — | tarjetas, paneles, drawer del carrito |
| `--color-border` | #D6D6D2 | — | separadores decorativos (no bordes de controles) |
| `--color-border-strong` | #8A8A84 | — | bordes de inputs, selects y botones secundarios |
| `--color-fg` | #0A0A0A | — | texto |
| `--color-fg-muted` | #6B6B66 | — | texto secundario, precios tachados |
| `--color-accent` | #C6FF3D | — | **solo** etiquetas "Nuevo", foco del CTA y fondo de insignias; el texto encima siempre es `--color-fg` |
| `--color-destructive` | #B91C30 | — | errores, "Agotado" |
| `--color-success` | #17803F | — | confirmaciones |

**Contrast** (medido con la fórmula WCAG 2.x el 2026-11-21):
- `--color-fg` sobre `--color-background`: **17.97:1**.
- `--color-fg-muted` sobre `--color-background`: **4.86:1**, AA para texto normal.
- `--color-fg` sobre `--color-accent`: **16.76:1**.
- `--color-border-strong` sobre `--color-background`: **3.15:1**, cumple 3:1 para límites de componentes.
- `--color-destructive`: **5.82:1**. `--color-success`: **4.54:1**.

`#1F9D55` (3.17:1) y `#D7263D` (4.50:1, al límite) se descartaron por eso.

### Typography
| Role | Family | Size / line-height | Weight | Tracking |
|---|---|---|---|---|
| Display | Archivo (eje `wdth` 125, expandida) — mayúsculas | 3rem / 1.0 (móvil 2.25rem) | 800 | 0.04em |
| Heading | Archivo (`wdth` 125) — mayúsculas | h2 1.5rem/1.15 · h3 1.125rem/1.2 | 700 | 0.06em |
| Body | Inter | 1rem / 1.6 · small 0.875rem / 1.5 | 400 (500 en precios) | 0 |
| Mono | ui-monospace, SFMono-Regular, Menlo, monospace | 0.875rem / 1.5 | 400 | 0 — CLABE y referencia SPEI |

**Font loading:** `next/font/google` en `src/app/layout.tsx`: `Archivo({ subsets: ["latin"], axes:
["wdth"], variable: "--font-display", display: "swap" })` e `Inter({ subsets: ["latin"], variable:
"--font-body", display: "swap" })`. Las fuentes se alojan en el propio despliegue (Next las descarga en
el build). Fallback: `system-ui, -apple-system, "Segoe UI", sans-serif`.

### Spacing, radius, elevation
- Espaciado: base 4px. Escala 4, 8, 12, 16, 24, 32, 48, 64, 96 px (las clases Tailwind `1 2 3 4 6 8 12 16 24`).
- Radio: **0px** en todo (botones, inputs, tarjetas, imágenes). La única excepción es el botón de WhatsApp (círculo, 9999px).
- Sombras: ninguna en tarjetas. El drawer y los modales usan `0 8px 24px rgba(10,10,10,0.12)`.
- Ancho máximo del contenido: 1440px. Breakpoints: 640, 768, 1024, 1280px (los de Tailwind).
- Grid de producto: 2 columnas en móvil, 3 desde 768px, 4 desde 1280px. Imágenes 4:5 a sangre y bordes de 1px `--color-border`.

### Motion
| Interacción | Duración | Easing |
|---|---|---|
| Cambio a la 2.ª foto al pasar el cursor en la tarjeta | 200ms opacidad | `cubic-bezier(0.2, 0, 0, 1)` |
| Drawer del carrito | 200ms translateX | `cubic-bezier(0.2, 0, 0, 1)` |
| Botones (hover / press) | 120ms color · press `scale(0.98)` | `ease-out` |

Con `@media (prefers-reduced-motion: reduce)` todas las duraciones pasan a `0.01ms` en `globals.css`.

### Component style
Monocromo, plano y tipográfico. Negro tinta sobre hueso, títulos en mayúsculas anchas y fotos de
producto grandes que hacen todo el trabajo. El verde ácido es una chispa (insignias y foco) y nunca un
fondo de sección. Un componente nuevo encaja si se vería bien impreso en blanco y negro.

---

## 8. Authentication & Authorization

### Provider and rationale
Módulo Auth de Medusa con el proveedor `emailpass` para `customer` y `user` (admin). Medusa ya lo
integra con sesiones y JWT, y el starter ya trae el registro y el login. No hay un segundo proveedor
de identidad.

### Flows
- **Invitado:** compra con solo un email; el pedido queda asociado al email. Puede ver la confirmación con el id.
- **Registro:** `/mx/account` → formulario del starter → `POST /auth/customer/emailpass/register` y luego `POST /store/customers`, con sesión iniciada. Si el email ya existe se muestra el error del starter.
- **Login / logout:** los del starter (cookie `_medusa_jwt`, httpOnly).
- **Recuperar contraseña:** fuera de v1 en la UI; el admin puede restablecerla desde el panel. Ver §20.4.
- **Admin:** `/app` (admin de Medusa) con `emailpass`. El primer admin lo crea el seed; los demás se invitan desde Settings → Users.
- **Borrar cuenta:** a petición por WhatsApp/email. El admin elimina al cliente y Medusa conserva los pedidos (snapshot).

### Route protection
| Surface | Rule | Enforced where |
|---|---|---|
| `/admin/*` (incluye `/admin/catalog-import/*`) | usuario admin autenticado | Medusa, por defecto, para todo `/admin` |
| `/store/invoices`, `/store/invoices/*` | cliente autenticado | `apps/backend/src/api/middlewares.ts` (paso 10) con `authenticate("customer", ["session", "bearer"])` |
| Propiedad del pedido en `/store/invoices` | `order.customer_id === auth_context.actor_id` | `apps/backend/src/api/store/invoices/route.ts` (paso 10) |
| `/mx/account/*` | sesión de cliente | el starter redirige a login. Es cosmético: la regla real la aplica el backend |

**Enforcement rule:** authorization is checked server-side on every request. Client-side route
guards are cosmetic and never the only check. A hidden button is not a permission.

### Roles and permissions
| Role | Can | Cannot |
|---|---|---|
| Invitado | Navegar, comprar, ver su confirmación | Solicitar factura (requiere cuenta) |
| Cliente | Lo anterior + direcciones, historial, solicitar CFDI de sus pedidos del mes | Ver pedidos o facturas de otro cliente |
| Admin | Todo el admin de Medusa + carga masiva | — (v1 no tiene roles finos; todos los admins son operadores de confianza) |

### Sessions
Son las de Medusa:
- **Admin:** sesión en cookie `connect.sid` (httpOnly, `Secure` en producción y `SameSite=Lax`) firmada con `COOKIE_SECRET`.
- **Cliente:** JWT firmado con `JWT_SECRET` que el storefront guarda en la cookie httpOnly `_medusa_jwt` (lógica del starter).
- **CSRF:** las mutaciones del storefront pasan por server actions de Next (verificación de origen incluida) y el admin usa CORS restringido con `ADMIN_CORS`.

### Multi-tenancy / row-level isolation
NOT APPLICABLE — una sola tienda. El aislamiento entre clientes es por `customer_id` en cada ruta propia
y en las rutas `/store/customers/me/*` de Medusa.

---

## 9. BUILD ORDER

### The rules of a step
Rigen las reglas de la plantilla de The Architect, resumidas:
1. Un paso por sesión, con ≤ 5 archivos y 2–6 criterios.
2. Cada paso tiene **Do / Done when / Verify / Checkpoint**, en ese orden.
3. Todo comando de `Verify` sale de la **raíz del proyecto** y termina en 0 cuando el paso está bien.
4. Un paso no está terminado hasta que pasan sus verificaciones **y las de los pasos anteriores**.
5. Ante un fallo, `git reset --hard <tag del paso anterior>` y se reintenta; nunca se depura hacia adelante.
6. Nunca se salta un paso.
7. Ningún `Verify` depende del commit de su propio Checkpoint.

**Servicios:** todos los `Verify` asumen `npm run services:up` (Postgres + Redis de
`docker-compose.yml`). Bootstrap lo deja corriendo; si la máquina se reinició, ejecútalo de nuevo
antes del paso.

**Carga de variables:** los comandos de Medusa (`dev`, `build`, `seed`, `db:*`) se ejecutan con
`npm --prefix apps/backend …`, que fija el cwd en `apps/backend`. `medusa-config.ts` llama a
`loadEnv(NODE_ENV)` y lee `apps/backend/.env`. Jest lee `apps/backend/.env.test` vía `jest.config.js`.
`docker compose` lee `docker-compose.yml`, que no usa variables. Ningún comando necesita un `export`
previo.

### One step, one unit — the counting rule
20 pasos = 20 tareas en `tasks.json` = 20 bloques en `epics/`. Las épicas son
`01-fundacion-catalogo` (pasos 1–5), `02-pagos-envios-facturacion` (pasos 6–13) y
`03-tienda-lanzamiento` (pasos 14–20). El paso 15 original se dividió en 15, 16 y 17 para respetar la regla 1; sus tareas nuevas son E3-T6 y E3-T7 (los ids no se renumeran).

### Step map
| # | Step | Depends on | Touches | Gate |
|---|---|---|---|---|
| 1 | Arranque verificable del backend | — | `integration-tests/http/health.spec.ts` | `/health` = OK desde el dev server |
| 2 | Configuración de Medusa y validación de entorno | 1 | `medusa-config.ts`, `src/lib/env.ts`, 2 tests | seed idempotente probado en DB temporal |
| 3 | Librería de carga masiva (Excel + fotos) | 1 | `src/lib/catalog-import/*` | tests unitarios con los fixtures |
| 4 | API y workflow de importación | 2, 3 | workflow, ruta, middlewares, test | `importar` crea 3 productos; el 2.º intento → 422 |
| 5 | Página "Carga masiva" en el admin | 4 | `src/admin/*`, `e2e/carga-masiva.spec.ts` | E2E sube Excel + fotos e importa |
| 6 | Proveedor de pago SPEI | 2 | `modules/spei-payment/*` | unit + `pp_spei_spei` en la región |
| 7 | Proveedor de pago PayPal | 2 | `modules/paypal-payment/*` | unit + `pp_paypal_paypal` en la región |
| 8 | Proveedor de envíos Envia.com | 2 | `modules/envia-fulfillment/*` | unit + "Envío terrestre" en la Store API |
| 9 | Módulo CFDI (modelo y gateway FacturAPI) | 2 | `modules/facturapi/*` | migración crea `cfdi_invoice` |
| 10 | Solicitud de factura del cliente | 6, 9 | reglas, 2 rutas, middlewares, test | 201 / 409 / 403 / 422 |
| 11 | Factura global mensual automática | 10 | job, reglas, test | factura global idempotente por periodo |
| 12 | Correos transaccionales con Resend | 2 | `modules/resend-notification/*`, plantillas | plantillas con total y links |
| 13 | Suscriptores de pedido y envío | 10, 12 | 2 subscribers + test, correo factura-emitida en `/store/invoices` | envían la plantilla correcta y la factura avisa por correo |
| 14 | Sistema de diseño en el storefront | 1 | tailwind, globals, layout, WhatsApp, check-tokens | build + cero hex fuera de tokens |
| 15 | Inicio por categorías y PDP con JSON-LD | 5, 8, 14 | página de inicio, carriles, JSON-LD, PDP del starter, E2E | precio en HTML sin JS + un solo JSON-LD |
| 16 | Caché de catálogo de 60 s | 15 | `lib/data/products.ts`, `lib/data/categories.ts`, E2E de caché | un cambio del admin se ve en el PDP en ≤ 90 s |
| 17 | Accesibilidad WCAG 2.2 AA | 15 | globals, medusa-cta, cart-dropdown, accordion, E2E axe | 0 violaciones axe |
| 18 | Checkout México: SPEI, PayPal, tarjeta, Envia | 6, 7, 8, 15, 16 | constants, payment-button, PayPal, instrucciones SPEI, E2E | pedido SPEI muestra CLABE y total $1,448.00 |
| 19 | Cuenta: solicitar factura | 10, 18 | invoice-request, server action `lib/data/invoices.ts`, proxy del PDF, order-details, E2E | cliente obtiene el UUID en la UI |
| 20 | Endurecimiento: Sentry, vencimiento SPEI, conciliación, CI | 6, 13, 17, 19 | instrumentation, job, reconciliación, test, CI | gate global §20.1 |

---

#### Step 1 — Arranque verificable del backend

**Do**
Bootstrap (§10) ya hizo lo siguiente:
- creó el scaffold de Medusa 2.23.0 y del storefront;
- instaló las dependencias;
- levantó Postgres y Redis;
- migró y corrió el seed;
- escribió `apps/storefront/.env.local`.

Este paso prueba que el backend arranca y que la cadena de pruebas funciona. Crea
`apps/backend/integration-tests/http/health.spec.ts` con este contenido exacto:

```ts
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  env: {},
  testSuite: ({ api }) => {
    describe("GET /health", () => {
      it("responde 200", async () => {
        const response = await api.get("/health")
        expect(response.status).toEqual(200)
      })
    })
  },
})
```

**Done when**
- [ ] WHEN Bootstrap ha terminado THE SYSTEM SHALL tener `apps/backend/medusa-config.ts`, `apps/backend/src/scripts/seed-saint-drip.ts` y `apps/storefront/package.json` en disco.
- [ ] WHEN `npm --prefix apps/backend run typecheck` corre THE SYSTEM SHALL salir con 0, incluido el seed emitido por el workspace.
- [ ] WHEN `npm --prefix apps/backend run test:integration:http -- integration-tests/http/health.spec.ts` corre THE SYSTEM SHALL pasar con `GET /health` → 200 sobre una base temporal.
- [ ] WHEN el seed corre por segunda vez THE SYSTEM SHALL salir con 0 y dejar exactamente 1 región llamada "México".
- [ ] WHEN `npm --prefix apps/backend run dev` arranca THE SYSTEM SHALL responder `OK` en `http://localhost:9000/health` en menos de 240 s.

**Verify**
```bash
test -f apps/backend/medusa-config.ts && test -f apps/backend/src/scripts/seed-saint-drip.ts && test -f apps/storefront/package.json   # expect: exit 0
npm --prefix apps/backend run typecheck                                            # expect: exit 0
npm --prefix apps/backend run test:integration:http -- integration-tests/http/health.spec.ts   # expect: exit 0, 1 passed
npm --prefix apps/backend run seed                                                 # expect: exit 0 (2.ª ejecución; Bootstrap hizo la 1.ª)
test "$(docker compose exec -T postgres psql -U medusa -d saint_drip -tAc "select count(*) from region where name = 'México' and deleted_at is null")" = 1   # expect: exit 0 — una sola región
node scripts/with-server.mjs "npm --prefix apps/backend run dev" http://localhost:9000/health OK 240   # expect: exit 0 — el entry point corre y responde OK
```

**Checkpoint**
```bash
git add -A && git commit -m "step 1: arranque verificable del backend"
git tag step-01-arranque
```

---

#### Step 2 — Configuración de Medusa y validación de entorno

**Do**
1. Reemplaza `apps/backend/medusa-config.ts` completo por:
```ts
import { defineConfig, loadEnv } from "@medusajs/framework/utils"
import { assertProductionEnv } from "./src/lib/env"

loadEnv(process.env.NODE_ENV || "development", process.cwd())
if (process.env.NODE_ENV === "production") assertProductionEnv(process.env)

const redisUrl = process.env.REDIS_URL
// Tests run without Redis (in-memory event bus/workflows); dev and production use it.
const useRedis = Boolean(redisUrl) && process.env.NODE_ENV !== "test"
const backendUrl = process.env.MEDUSA_BACKEND_URL ?? "http://localhost:9000"

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: useRedis ? redisUrl : undefined,
    workerMode: (process.env.MEDUSA_WORKER_MODE as "shared" | "worker" | "server") || "shared",
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  admin: {
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
    backendUrl,
  },
  modules: [
    ...(useRedis
      ? [
          { resolve: "@medusajs/medusa/event-bus-redis", options: { redisUrl } },
          { resolve: "@medusajs/medusa/workflow-engine-redis", options: { redis: { redisUrl } } },
          {
            resolve: "@medusajs/medusa/locking",
            options: {
              providers: [
                { resolve: "@medusajs/medusa/locking-redis", id: "locking-redis", is_default: true, options: { redisUrl } },
              ],
            },
          },
        ]
      : []),
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          process.env.FILE_PROVIDER === "s3"
            ? {
                resolve: "@medusajs/medusa/file-s3",
                id: "s3",
                options: {
                  file_url: process.env.S3_FILE_URL,
                  access_key_id: process.env.S3_ACCESS_KEY_ID,
                  secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
                  region: process.env.S3_REGION,
                  bucket: process.env.S3_BUCKET,
                  endpoint: process.env.S3_ENDPOINT,
                },
              }
            : { resolve: "@medusajs/medusa/file-local", id: "local", options: { upload_dir: "static", backend_url: `${backendUrl}/static` } },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [{ resolve: "@medusajs/medusa/notification-local", id: "local", options: { channels: ["email"] } }],
      },
    },
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          ...(process.env.STRIPE_API_KEY
            ? [
                {
                  resolve: "@medusajs/medusa/payment-stripe",
                  id: "stripe",
                  options: { apiKey: process.env.STRIPE_API_KEY, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET },
                },
              ]
            : []),
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: { providers: [{ resolve: "@medusajs/medusa/fulfillment-manual", id: "manual" }] },
    },
  ],
})
```
   Si al arrancar `dev`, con Redis, el log dice que la opción del workflow engine es inválida, la clave
   correcta es la de https://docs.medusajs.com/resources/infrastructure-modules/workflow-engine/redis
   para 2.23.0. Usa esa clave y nada más. Es el único punto de este archivo que depende de la versión.
2. Crea `apps/backend/src/lib/env.ts` con la siguiente exportación y semántica:
   - `export const PRODUCTION_REQUIRED`, con estas variables: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `MEDUSA_BACKEND_URL`, `S3_FILE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_ENDPOINT`, `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `SPEI_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `ENVIA_API_TOKEN`, `FACTURAPI_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `STOREFRONT_URL`, `SENTRY_DSN`.
   - `export const PRODUCTION_VALUES = { FILE_PROVIDER: "s3", SPEI_MODE: "live", PAYPAL_ENVIRONMENT: "live", ENVIA_ENVIRONMENT: "production", FACTURAPI_MODE: "live" }`.
   - `export function missingProductionEnv(env: Record<string, string | undefined>): string[]` devuelve los nombres que faltan o están vacíos, más los de `PRODUCTION_VALUES` cuyo valor no coincide, más `JWT_SECRET` y `COOKIE_SECRET` si tienen menos de 32 caracteres.
   - `export function assertProductionEnv(env)` lanza `Error("Variables de producción faltantes o inválidas: " + lista.join(", "))` si la lista no está vacía.

   Solo `medusa-config.ts` la invoca, y solo con `NODE_ENV=production`; desarrollo y pruebas nunca la activan (§9 regla 9).
3. Crea `apps/backend/src/lib/__tests__/env.unit.spec.ts` con 3 casos:
   - `{}` incluye `STRIPE_API_KEY` y `SPEI_MODE`;
   - un entorno completo y válido devuelve `[]`;
   - `JWT_SECRET` de 10 caracteres hace que aparezca `JWT_SECRET`.
4. Crea `apps/backend/integration-tests/http/store-setup.spec.ts`: con `medusaIntegrationTestRunner({ env: {}, testSuite: ({ getContainer }) => … })`, llama dos veces `await seedSaintDrip({ container: getContainer(), args: [] } as any)` (import default de `../../src/scripts/seed-saint-drip`) y afirma:
   - 1 región "México" con `currency_code` `mxn`;
   - las 5 categorías por handle;
   - 1 stock location "Almacén Principal";
   - 1 usuario `admin@saintdrip.local`;
   - 1 llave publicable "Storefront Saint Drip".

**Done when**
- [ ] WHEN `missingProductionEnv({})` se evalúa THE SYSTEM SHALL incluir `STRIPE_API_KEY` y `SPEI_MODE`, y con el entorno completo devolver `[]` (test unitario).
- [ ] WHEN el seed corre dos veces sobre una base temporal THE SYSTEM SHALL dejar exactamente 1 región "México" en `mxn`, las 5 categorías, 1 almacén, 1 admin y 1 llave publicable.
- [ ] WHEN `npm --prefix apps/backend run build` corre THE SYSTEM SHALL salir con 0 y producir `apps/backend/.medusa/server`.
- [ ] WHEN el dev server arranca con `REDIS_URL` definido THE SYSTEM SHALL responder `OK` en `/health` (los módulos Redis cargan).
- [ ] WHEN `NODE_ENV` no es `production` THE SYSTEM SHALL arrancar sin las variables de producción (el gate del paso 1 sigue verde).

**Verify**
```bash
npm --prefix apps/backend run typecheck                                            # expect: exit 0
npm --prefix apps/backend run test:unit -- src/lib/__tests__/env.unit.spec.ts      # expect: exit 0, 3 passed
npm --prefix apps/backend run test:integration:http -- integration-tests/http/store-setup.spec.ts   # expect: exit 0
npm --prefix apps/backend run build && test -d apps/backend/.medusa/server         # expect: exit 0
node scripts/with-server.mjs "npm --prefix apps/backend run dev" http://localhost:9000/health OK 240   # expect: exit 0
npm --prefix apps/backend run test:integration:http -- integration-tests/http/health.spec.ts   # expect: exit 0 — el gate del paso 1 sigue verde
```

**Checkpoint**
```bash
git add -A && git commit -m "step 2: configuracion de medusa y entorno"
git tag step-02-config
```

---

#### Step 3 — Librería de carga masiva (Excel + fotos)

**Do**
Lógica pura en `apps/backend/src/lib/catalog-import/`, sin imports de `@medusajs/*`. La dependencia
es `exceljs`, ya instalado en Bootstrap. El contrato completo está en §5, *Carga masiva — contrato del
Excel*.
- `columns.ts`:
  - `export const COLUMNAS` (las 15 columnas en orden), `CATEGORIAS`, `TIPOS_OPCION`, `TALLAS_ROPA = ["XCH","CH","M","G","EG","EEG"]` y `ETIQUETA_OPCION` (talla_ropa→"Talla", talla_calzado→"Número", contenido_ml→"Contenido", medida→"Medida", unica→"Presentación");
  - `export async function buildPlantilla(): Promise<Buffer>`, que genera con exceljs un libro con las hojas `Instrucciones`, `Productos` (solo la fila de encabezados `COLUMNAS`, fondo `0A0A0A` y texto `F4F4F1`) y `Valores` (listas de categoria, tipo_opcion, solo_terrestre, estado y talla_ropa).
- `parse.ts`: `export async function leerExcel(buffer: Buffer): Promise<{ encabezados: string[]; filas: { fila: number; valores: Record<string, string> }[] }>`.
  - Lee la hoja `Productos`. Si no existe, lanza `Error("E_EXCEL")`.
  - Las celdas se normalizan según §5.
  - Las filas vacías se omiten. `fila` es el número de fila de Excel (la primera fila de datos es la 2).
- `validate.ts`: `export function validarCatalogo(input: { encabezados: string[]; filas: …; handlesExistentes?: Set<string>; skusExistentes?: Set<string> }): { valido: boolean; productos: ProductoImportado[]; errores: { fila: number; columna: string; codigo: string; mensaje: string }[] }`.
  - Aplica cada regla de la tabla de §5.
  - `ProductoImportado = { handle, titulo, descripcion, categoria, tipoOpcion, soloTerrestre: boolean, estado: "draft" | "published", variantes: { fila, valorOpcion, sku, precio: number, existencia: number, pesoG: number, largoCm: number, anchoCm: number, altoCm: number }[] }`.
  - `valido` aquí solo considera `errores`; las fotos se suman en la ruta.
- `photos.ts`: `export function emparejarFotos(handles: string[], nombres: string[]): { porHandle: Record<string, string[]>; faltantes: string[]; sinUsar: string[] }`, con nombres ordenados por `n` ascendente.
- `__tests__/catalog-import.unit.spec.ts` lee los fixtures de `__fixtures__/` con `fs.readFileSync(path.join(__dirname, "../__fixtures__/…"))` y cubre estos casos:
  1. **`plantilla-valida.xlsx`:** `errores` vacío y 3 productos con 8 variantes en total. `sd-hoodie-oversize-negro` tiene 4 variantes a precio 1299 y la variante `M` con existencia 8. `sd-perfume-noir-100` tiene `soloTerrestre: true` y `estado: "draft"`.
  2. **`plantilla-con-errores.xlsx`:** `errores` igual, en este orden, a estas tripletas `(fila, columna, codigo)`:
     `(3,"categoria","E_INCONSISTENTE")`, `(4,"sku","E_SKU_DUPLICADO")`, `(5,"precio_mxn","E_PRECIO")`,
     `(6,"categoria","E_CATEGORIA")`, `(7,"valor_opcion","E_VALOR_OPCION")`, `(8,"existencia","E_EXISTENCIA")`.
  3. **Handle existente:** `handlesExistentes = new Set(["sd-tenis-urban-blanco"])` sobre el fixture válido produce `E_HANDLE_EXISTE` en las filas 6, 7 y 8.
  4. **Encabezados alterados:** cambiar `encabezados[7]` a `"precio"` produce un solo error `E_COLUMNAS` con fila 1 y columna `precio_mxn`.
  5. **Variante repetida:** duplicar la fila de la talla `M` (mismo handle y valor, sku distinto) produce `E_VARIANTE_DUPLICADA`.
  6. **Fotos:** `emparejarFotos(["sd-hoodie-oversize-negro","sd-tenis-urban-blanco","sd-perfume-noir-100"], ["sd-hoodie-oversize-negro-2.jpg","sd-hoodie-oversize-negro-1.jpg","sd-tenis-urban-blanco-1.jpg","foto-suelta.jpg"])` devuelve `faltantes = ["sd-perfume-noir-100"]`, `sinUsar = ["foto-suelta.jpg"]` y las fotos del hoodie en el orden `["…-1.jpg","…-2.jpg"]`.
  7. **Plantilla generada:** `leerExcel(await buildPlantilla())` devuelve `encabezados` igual a `COLUMNAS` y `filas` vacío.

  Las filas del fixture con errores son: 2 válida, 3 categoría distinta al resto del handle, 4 sku repetido de la fila 2, 5 precio `12,50`, 6 categoría `zapatos`, 7 talla `XXXL` y 8 existencia `-1`.

**Done when**
- [ ] WHEN `validarCatalogo` procesa `plantilla-valida.xlsx` THE SYSTEM SHALL devolver cero errores y 3 productos con 8 variantes.
- [ ] WHEN `validarCatalogo` procesa `plantilla-con-errores.xlsx` THE SYSTEM SHALL devolver exactamente las 6 tripletas `(fila, columna, codigo)` listadas, en ese orden.
- [ ] WHEN un handle ya existe en la tienda THE SYSTEM SHALL marcar `E_HANDLE_EXISTE` en cada fila de ese handle.
- [ ] WHEN `emparejarFotos` recibe nombres desordenados y una foto ajena THE SYSTEM SHALL ordenar por `n`, listar el handle sin fotos en `faltantes` y la ajena en `sinUsar`.
- [ ] WHEN `buildPlantilla()` se lee de vuelta con `leerExcel` THE SYSTEM SHALL tener encabezados idénticos a `COLUMNAS` y cero filas.

**Verify**
```bash
npm --prefix apps/backend run test:unit -- src/lib/catalog-import                 # expect: exit 0, 7 passed
status=0; grep -rnE '\.(skip|only)\(' apps/backend/src/lib/catalog-import || status=$?; test "$status" -eq 1   # expect: exit 0 — 1 = ningún test saltado/enfocado
status=0; grep -rn '@medusajs/' apps/backend/src/lib/catalog-import --include=*.ts || status=$?; test "$status" -eq 1   # expect: exit 0 — la librería es pura
npm --prefix apps/backend run typecheck                                            # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 3: libreria de carga masiva"
git tag step-03-carga-lib
```

---

#### Step 4 — API y workflow de importación

**Do**
- `apps/backend/src/workflows/import-catalog.ts`: `export const importCatalogWorkflow = createWorkflow("import-catalog", (input: { productos: ProductoImportado[]; fotos: Record<string, string[]> /* handle → URLs en orden */ }) => …)`.
  - Un step `resolverContextoStep` resuelve por nombre el canal "Tienda en línea", el almacén "Almacén Principal" y el perfil `type: "default"`, y las categorías por handle; usa `SEED` de `src/scripts/seed-saint-drip.ts` para los nombres.
  - `createProductsWorkflow.runAsStep` crea los productos con los campos de §5 *Efectos*:
    - `status`;
    - `category_ids: [id]`;
    - `sales_channels: [{ id }]`;
    - `shipping_profile_id`;
    - `images` (URLs en orden) y `thumbnail` (la URL 1);
    - `options: [{ title: ETIQUETA_OPCION[tipo], values }]`;
    - `variants[]` con `title` = valor, `sku`, `options: { [etiqueta]: valor }`, `prices: [{ amount: precio, currency_code: "mxn" }]`, `manage_inventory: true`, `weight`, `length`, `width` y `height`;
    - `metadata: { solo_terrestre }`.
  - Al final, `createInventoryLevelsWorkflow.runAsStep` crea un nivel por variante: `inventory_item_id` obtenido por `useQueryGraphStep` sobre `variants.inventory_items.inventory_item_id`, `location_id` del almacén y `stocked_quantity = existencia`. Devuelve `{ handles }`.
- `apps/backend/src/api/admin/catalog-import/[accion]/route.ts`:
  - `GET` responde a `accion = "plantilla"` (buffer de `buildPlantilla()` con los headers de §5).
  - `POST` responde a `"validar"` e `"importar"`, según §5.
  - En ambos casos lee handles y skus existentes con `query.graph({ entity: "product", fields: ["handle"], filters: { handle: [...] } })` y `entity: "product_variant"`.
  - Una `accion` desconocida responde 404 `{ codigo: "E_ACCION" }`.
- `apps/backend/src/api/middlewares.ts` ya existe en el scaffold y configura `POST /store/search` con `configureStoreSearch`, que usa el buscador del storefront. **No lo reemplaces.** Agrega al final de su arreglo `routes` la entrada `{ matcher: "/admin/catalog-import/*", method: ["POST"], bodyParser: { sizeLimit: "8mb" } }` y conserva la de `/store/search` tal cual.
- `apps/backend/integration-tests/http/catalog-import.spec.ts`:
  - **Preparación:** en `beforeEach`, llama `seedSaintDrip`, obtiene un token con `POST /auth/user/emailpass { email: "admin@saintdrip.local", password: "saintdrip-dev" }` y manda `Authorization: Bearer`. El fixture es `src/lib/catalog-import/__fixtures__/plantilla-valida.xlsx` en base64, con las URLs de fotos `http://localhost:9000/static/<nombre>` para los 4 nombres `sd-hoodie-oversize-negro-1.jpg`, `sd-hoodie-oversize-negro-2.jpg`, `sd-tenis-urban-blanco-1.jpg` y `sd-perfume-noir-100-1.jpg`.
  - **Casos:**
    1. `GET plantilla` → 200 con el content-type xlsx.
    2. `POST validar` → 200 con `{ valido: true, productos: 3, variantes: 8, fotos_faltantes: [] }`.
    3. `POST importar` → 200 con `creados: 3`. Después, `sd-perfume-noir-100` tiene `status: "draft"` y `metadata.solo_terrestre: true`, y la variante `SD-HOOD-NEG-M` tiene `stocked_quantity` 8 en "Almacén Principal" y precio 1299 `mxn`.
    4. Un segundo `POST importar` con el mismo cuerpo → 422 con un error `E_HANDLE_EXISTE`, y siguen existiendo exactamente 3 productos con esos handles.
    5. `POST validar` sin token → 401.

**Done when**
- [ ] WHEN un admin hace `POST /admin/catalog-import/validar` con el fixture válido y sus 4 fotos THE SYSTEM SHALL responder 200 `{ valido: true, productos: 3, variantes: 8, fotos_faltantes: [] }` sin escribir filas.
- [ ] WHEN el admin hace `POST /admin/catalog-import/importar` con ese cuerpo THE SYSTEM SHALL responder 200 `{ creados: 3 }` y crear la variante `SD-HOOD-NEG-M` con existencia 8 y precio 1299 MXN.
- [ ] WHEN se repite el mismo `importar` THE SYSTEM SHALL responder 422 con `E_HANDLE_EXISTE` y dejar exactamente 3 productos con esos handles.
- [ ] WHEN se pide `GET /admin/catalog-import/plantilla` THE SYSTEM SHALL responder 200 con `Content-Disposition: attachment; filename="plantilla-catalogo-saint-drip.xlsx"`.
- [ ] WHEN se llama `validar` sin sesión de admin THE SYSTEM SHALL responder 401.

**Verify**
```bash
npm --prefix apps/backend run typecheck                                            # expect: exit 0
npm --prefix apps/backend run test:integration:http -- integration-tests/http/catalog-import.spec.ts   # expect: exit 0, 5 passed
npm --prefix apps/backend run test:unit -- src/lib/catalog-import                 # expect: exit 0 — el paso 3 sigue verde
```

**Checkpoint**
```bash
git add -A && git commit -m "step 4: api y workflow de importacion"
git tag step-04-carga-api
```

---

#### Step 5 — Página "Carga masiva" en el admin

**Do**
- `apps/backend/src/admin/lib/sdk.ts`: `import Medusa from "@medusajs/js-sdk"; export const sdk = new Medusa({ baseUrl: import.meta.env.VITE_BACKEND_URL || "/", debug: import.meta.env.DEV, auth: { type: "session" } })`.
- `apps/backend/src/admin/routes/carga-masiva/page.tsx`: ruta de UI con `export const config = defineRouteConfig({ label: "Carga masiva" })` (de `@medusajs/admin-sdk`) y componentes de `@medusajs/ui`. Textos exactos (los usa el E2E):
  - **Encabezado y enlace:** título `Carga masiva` y enlace `Descargar plantilla` (`href="/admin/catalog-import/plantilla"`, atributo `download`).
  - **Campos:** `<input type="file" accept=".xlsx" aria-label="Archivo Excel (.xlsx)">` y `<input type="file" accept=".jpg,.jpeg" multiple aria-label="Fotos (.jpg)">`.
  - **Botón `Validar`:** lee el Excel como base64 y hace `POST /admin/catalog-import/validar` con `fotos` = nombres. Muestra `{productos} productos · {variantes} variantes`, una tabla con cabeceras `Fila`, `Columna` y `Error` cuando hay errores, y las listas "Fotos faltantes" y "Fotos sin usar".
  - **Botón `Importar`:** solo está habilitado si `valido`. Sube cada JPG con `sdk.admin.upload.create({ files: [file] })`, arma `{ [file.name]: url }` y hace `POST …/importar`. Al terminar muestra `{creados} productos creados`.
  - **Estados de carga:** el botón muestra `Validando…` o `Importando…` y queda deshabilitado mientras trabaja.
  - **Emparejado de fotos:** reutiliza `emparejarFotos` importado de `../../../lib/catalog-import/photos` para avisar antes de validar.
- `e2e/helpers/admin.ts`:
  - `iniciarSesionAdmin(page)`: `POST http://localhost:9000/auth/user/emailpass` con `admin@saintdrip.local` / `saintdrip-dev` y luego `POST http://localhost:9000/auth/session` con `Authorization: Bearer <token>` usando `page.request`, que comparte las cookies con la página.
  - `borrarProductosFixture(request)`: con el token, `GET /admin/products?handle=<h>` y `DELETE /admin/products/:id` para cada handle del fixture. Antes de cada `DELETE`, libera las reservas de inventario de sus variantes. Para eso hace `GET /admin/products/:id?fields=id,variants.inventory_items.inventory_item_id`, luego `GET /admin/reservations?inventory_item_id=<id>` y por último `DELETE /admin/reservations/:id`. Hace falta porque los pedidos de prueba de los pasos 18 y 19 dejan reservas, y Medusa rechaza borrar un producto que las tiene (400 `Cannot remove following inventory item(s) since they have reservations`).
  - `importarFixture(request)`: sube las 4 fotos de `e2e/fixtures/fotos/` por `POST /admin/uploads` (multipart `files`) y llama `POST /admin/catalog-import/importar` con `e2e/fixtures/plantilla-valida.xlsx`. Lo reutilizan los pasos 15–19.
- `e2e/carga-masiva.spec.ts`:
  - `beforeAll` llama `borrarProductosFixture`. Después: iniciar sesión, ir a `http://localhost:9000/app/carga-masiva` y comprobar que la descarga de `Descargar plantilla` se llama `plantilla-catalogo-saint-drip.xlsx`.
  - **Archivo con errores:** cargar `apps/backend/src/lib/catalog-import/__fixtures__/plantilla-con-errores.xlsx`, pulsar `Validar` y esperar 6 filas en la tabla de errores.
  - **Archivo válido:** cargar `e2e/fixtures/plantilla-valida.xlsx` más las 4 fotos, `Validar`, esperar el texto `3 productos · 8 variantes`, pulsar `Importar` y esperar `3 productos creados`.
  - **Comprobación final:** `GET http://localhost:9000/admin/products?handle=sd-hoodie-oversize-negro` devuelve 1 producto con 2 imágenes.

**Done when**
- [ ] WHEN `npm --prefix apps/backend run build` corre THE SYSTEM SHALL compilar el admin con la ruta `carga-masiva` y salir con 0.
- [ ] WHEN el admin pulsa `Descargar plantilla` THE SYSTEM SHALL descargar `plantilla-catalogo-saint-drip.xlsx`.
- [ ] WHEN se valida `plantilla-con-errores.xlsx` THE SYSTEM SHALL mostrar 6 filas en la tabla Fila/Columna/Error y mantener `Importar` deshabilitado.
- [ ] WHEN se valida e importa el fixture válido con sus 4 fotos THE SYSTEM SHALL mostrar `3 productos · 8 variantes` y luego `3 productos creados`, y el hoodie SHALL tener 2 imágenes.

**Verify**
```bash
npm --prefix apps/backend run build                                                # expect: exit 0
npm --prefix apps/backend run typecheck                                            # expect: exit 0
npm run test:e2e -- e2e/carga-masiva.spec.ts                                       # expect: exit 0, 0 failed
```

**Checkpoint**
```bash
git add -A && git commit -m "step 5: pagina de carga masiva en el admin"
git tag step-05-carga-admin
```

---

#### Step 6 — Proveedor de pago SPEI

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

**Done when**
- [ ] WHEN `initiatePayment` recibe 1448 MXN en modo live THE SYSTEM SHALL crear el PaymentIntent con `amount: 144800`, `mx_bank_transfer` y devolver CLABE, banco y referencia (test unitario).
- [ ] WHEN llega un webhook `payment_intent.succeeded` con firma válida THE SYSTEM SHALL devolver la acción `captured` con `amount: 1448`; con firma inválida, `failed`.
- [ ] WHEN se intenta capturar un PI que no está `succeeded` THE SYSTEM SHALL lanzar `NOT_ALLOWED`.
- [ ] WHEN el seed corre después de registrar el proveedor THE SYSTEM SHALL ofrecer `pp_spei_spei` en la región México por la Store API.

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

#### Step 7 — Proveedor de pago PayPal

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

**Done when**
- [ ] WHEN `initiatePayment` recibe 1448 THE SYSTEM SHALL crear la orden de PayPal con el valor `"1448.00"` MXN.
- [ ] WHEN la orden está `APPROVED` THE SYSTEM SHALL capturarla y devolver `captured`; WHEN está `CREATED` THE SYSTEM SHALL devolver `pending`.
- [ ] WHEN llega un webhook cuya firma PayPal no verifica THE SYSTEM SHALL devolver `failed` sin capturar.
- [ ] WHEN el seed corre THE SYSTEM SHALL ofrecer `pp_paypal_paypal` en la región México.

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

#### Step 8 — Proveedor de envíos Envia.com

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
    - Medusa 2.23 arma ese `context` con `cartFieldsForCalculateShippingOptionsPrices`, que trae `items.variant.product.id` pero **no** la `metadata` del producto. Para los items que no la traen, el servicio la busca por `product_id` con una función inyectable `buscarMetadata(productIds)` (`deps.buscarMetadata`, tercer parámetro del constructor). La implementación por defecto lee `product.id, product.metadata` por la conexión `__pg_connection__` que Medusa registra en el contenedor del módulo, porque un proveedor de fulfillment no puede resolver el módulo de productos. Solo consulta cuando se cotiza express.
    - Si no, cotiza un paquete: peso = suma de `variant.weight × quantity` en kg, y medidas = máximo de largo y ancho y suma de alto.
    - Elige la tarifa más barata del `tipo` pedido y devuelve `{ calculated_amount: total, is_calculated_price_tax_inclusive: true }`.
    - Si no hay tarifas de ese tipo, lanza `MedusaError(NOT_FOUND, "Sin tarifas de Envia para este código postal")`.
    - En `sandbox` o `production` sin `token`, lanza `MedusaError(INVALID_DATA, "ENVIA_API_TOKEN no configurado")`.
  - **`createFulfillment`:** `generarGuia` → `{ data: { tracking, carrier }, labels: [{ tracking_number, tracking_url, label_url }] }`.
  - **`cancelFulfillment`:** `cancelarGuia`.
- `apps/backend/src/modules/envia-fulfillment/index.ts`: `ModuleProvider(Modules.FULFILLMENT, { services: [EnviaFulfillmentService] })`.
- `apps/backend/src/modules/envia-fulfillment/__tests__/envia.unit.spec.ts`, 6 casos:
  1. En `mock`, terrestre → 149.
  2. Express con un item `solo_terrestre` → lanza el mensaje exacto.
  3. Con un gateway doble que devuelve 3 tarifas terrestres (210, 180, 199) → 180.
  4. `createFulfillment` → `labels[0].tracking_number === "MOCK123456"`.
  5. `production` sin token → lanza `ENVIA_API_TOKEN no configurado`.
  6. Express con un item en la forma real del contexto (`variant.product.id` sin `metadata`) y un `buscarMetadata` doble que lo marca `solo_terrestre` → lanza el mensaje exacto. El mismo item con terrestre → 149.
- `apps/backend/medusa-config.ts`: agrega en `fulfillment.options.providers` `{ resolve: "./src/modules/envia-fulfillment", id: "envia", options: { environment: process.env.ENVIA_ENVIRONMENT ?? "mock", token: process.env.ENVIA_API_TOKEN, origenCp: "69000" } }`.

**Done when**
- [ ] WHEN se cotiza terrestre en modo mock THE SYSTEM SHALL devolver 149 MXN IVA incluido.
- [ ] WHEN el carrito tiene un producto `solo_terrestre` y se cotiza express THE SYSTEM SHALL lanzar "Este pedido contiene productos que solo pueden enviarse por tierra".
- [ ] WHEN Envia devuelve varias tarifas terrestres THE SYSTEM SHALL elegir la más barata (180 entre 210/180/199).
- [ ] WHEN se genera el fulfillment THE SYSTEM SHALL devolver una etiqueta con número de rastreo.
- [ ] WHEN el seed corre con el proveedor registrado THE SYSTEM SHALL exponer "Envío terrestre" como opción de envío para un carrito de la región México.

**Verify**
```bash
npm --prefix apps/backend run test:unit -- src/modules/envia-fulfillment           # expect: exit 0, 6 passed
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

#### Step 9 — Módulo CFDI (modelo y gateway FacturAPI)

**Do**
- `apps/backend/src/modules/facturapi/models/cfdi-invoice.ts`: exactamente el schema de §4.
- `apps/backend/src/modules/facturapi/gateway.ts`: `export interface FacturapiGateway { timbrar(cfdi: CfdiEntrada): Promise<{ id: string; uuid: string; total: number }>; pdf(id: string): Promise<Buffer> }`, donde `CfdiEntrada = { receptor: { rfc; razon_social; regimen_fiscal; codigo_postal }; uso_cfdi: string; items: { descripcion: string; precio: number; cantidad: number }[]; global?: { periodicidad: "month"; mes: string; anio: number } }`. Los precios llevan IVA 16 % incluido.
  - **`crearFacturapiGateway(key)`** usa `new Facturapi(key)` y `facturapi.invoices.create`, con customer `{ legal_name, tax_id, tax_system, address: { zip } }`, `use`, `items: [{ quantity, product: { description, product_key: "01010101", price, tax_included: true } }]`, `payment_form: "03"` y el campo `global` cuando aplica. `pdf` usa `facturapi.invoices.downloadPdf`.
  - **`crearFacturapiGatewayMock()`:** devuelve `{ id: "facturapi_mock_<marca de tiempo del arranque del proceso>_<n>", uuid: "00000000-0000-4000-8000-000000000001", total }` y un PDF de 4 bytes `%PDF`. El id no se repite entre reinicios del backend, porque `facturapi_id` es único en `cfdi_invoice`.
- `apps/backend/src/modules/facturapi/service.ts`: `class FacturapiModuleService extends MedusaService({ CfdiInvoice })`. El constructor lee las opciones `{ mode, key }` y elige el gateway. Expone `gateway()`.
- `apps/backend/src/modules/facturapi/index.ts`: `export const FACTURAPI_MODULE = "facturapi"; export default Module(FACTURAPI_MODULE, { service: FacturapiModuleService })`.
- `apps/backend/medusa-config.ts`: agrega en `modules` `{ resolve: "./src/modules/facturapi", options: { mode: process.env.FACTURAPI_MODE === "live" ? "live" : "mock", key: process.env.FACTURAPI_KEY } }`.
- Genera la migración con `npm --prefix apps/backend run db:generate -- facturapi`. El archivo lo nombra la herramienta y queda bajo `src/modules/facturapi/migrations/`. Aplícala con `db:migrate`.

**Done when**
- [ ] WHEN `npm --prefix apps/backend run db:migrate` corre THE SYSTEM SHALL salir con 0 y la tabla `cfdi_invoice` SHALL existir.
- [ ] WHEN se inspecciona `cfdi_invoice` THE SYSTEM SHALL tener los índices únicos parciales sobre `order_id` y `period`.
- [ ] WHEN `npm --prefix apps/backend run build` corre THE SYSTEM SHALL salir con 0 con el módulo registrado.

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

#### Step 10 — Solicitud de factura del cliente

**Do**
- `apps/backend/src/lib/cfdi/reglas.ts` (puro, sin `@medusajs/*`):
  - `export function periodoDe(fecha: Date): string`: `YYYY-MM` en America/Mexico_City, con `Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" })`.
  - `export function validarSolicitud(p: { pedido: { customer_id: string | null; created_at: Date; pago_capturado: boolean; ya_facturado: boolean }; cliente_id: string; ahora: Date }): null | { status: number; codigo: string; mensaje: string }`. Revisa en este orden: `E_NO_ES_TU_PEDIDO` 403, `E_YA_FACTURADO` 409, `E_PAGO_PENDIENTE` 422 y `E_FUERA_DE_PERIODO` 422, que aplica si `periodoDe(created_at) !== periodoDe(ahora)`.
- `apps/backend/src/api/store/invoices/route.ts`: `POST` según §5.
  - Valida el body con zod.
  - Lee el pedido con `query.graph({ entity: "order", fields: ["id","customer_id","created_at","total","items.title","items.quantity","items.total","payment_collections.status"], filters: { id } })`. `pago_capturado` = alguna `payment_collection.status` igual a `completed`.
  - Revisa si ya existe un CFDI individual del pedido y aplica `validarSolicitud`.
  - Timbra con un item por línea del pedido (`precio = item.total / item.quantity`) y guarda `cfdi_invoice` con `kind: "individual"`, `order_ids: { ids: [id] }` y `rfc`.
  - Responde 201 `{ id, uuid }`. Un error del gateway se traduce a 502 `E_PAC`. Si el insert choca con el índice único parcial de `order_id` (dos solicitudes simultáneas), responde 409 `E_YA_FACTURADO`. Cualquier otro error de base de datos se propaga y no se disfraza de "ya facturado".
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

**Done when**
- [ ] WHEN el dueño de un pedido pagado del mes solicita su CFDI THE SYSTEM SHALL responder 201 con el uuid y guardar exactamente 1 `cfdi_invoice` con `kind='individual'`.
- [ ] WHEN se solicita por segunda vez THE SYSTEM SHALL responder 409 `E_YA_FACTURADO`.
- [ ] WHEN otro cliente lo solicita THE SYSTEM SHALL responder 403 `E_NO_ES_TU_PEDIDO`.
- [ ] WHEN el pago no está capturado THE SYSTEM SHALL responder 422 `E_PAGO_PENDIENTE`.
- [ ] WHEN la petición no está autenticada THE SYSTEM SHALL responder 401.

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

#### Step 11 — Factura global mensual automática

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

**Done when**
- [ ] WHEN `periodoDe` recibe `2026-12-01T05:30:00Z` THE SYSTEM SHALL devolver `2026-11` (hora de Ciudad de México).
- [ ] WHEN `periodoAnterior` corre el 1 de enero de 2027 THE SYSTEM SHALL devolver `2026-12`, mes `12`, año 2026.
- [ ] WHEN `construirFacturaGlobal` recibe cero pedidos THE SYSTEM SHALL devolver `null` (el job no timbra nada).
- [ ] WHEN recibe 2 pedidos THE SYSTEM SHALL producir un CFDI a `XAXX010101000` con 2 conceptos y periodicidad mensual.
- [ ] WHEN `npm --prefix apps/backend run build` corre THE SYSTEM SHALL incluir el job `factura-global` y salir con 0.

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

#### Step 12 — Correos transaccionales con Resend

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

**Done when**
- [ ] WHEN se arma la confirmación de un pedido de 1448 MXN THE SYSTEM SHALL incluir `$1,448.00`, el link al pedido y el asunto con el número de pedido.
- [ ] WHEN el pedido es SPEI THE SYSTEM SHALL incluir CLABE y referencia; WHEN no lo es THE SYSTEM SHALL omitir la palabra CLABE.
- [ ] WHEN se arma el correo de envío THE SYSTEM SHALL incluir número de rastreo y URL de rastreo.
- [ ] WHEN `RESEND_API_KEY` no está definido THE SYSTEM SHALL usar el proveedor local y el backend SHALL arrancar (el gate de `/health` sigue verde).

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

#### Step 13 — Suscriptores de pedido y envío

**Do**
- `apps/backend/src/subscribers/order-placed.ts`:
  - `export default async function orderPlacedHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>)` con `export const config: SubscriberConfig = { event: "order.placed" }`.
  - Lee el pedido con `query.graph` (campos `display_id`, `email`, `total`, `items.*` y `payment_collections.payments.provider_id`/`data`).
  - Si el proveedor es `pp_spei_spei`, pasa `spei` desde `payment.data`.
  - Llama `notificationModule.createNotifications({ to: email, channel: "email", template: "confirmacion-pedido", content: confirmacionPedido({ …, urlPedido: STOREFRONT_URL + "/mx/order/" + id + "/confirmed" }) })`.
- `apps/backend/src/subscribers/shipment-created.ts`: evento `shipment.created` con `data.id` del fulfillment. Lee el fulfillment con `labels` y su pedido, y envía `envioGenerado`.
- `apps/backend/src/api/store/invoices/route.ts` (del paso 10): después de guardar el CFDI individual envía `createNotifications({ to: order.email, channel: "email", template: "factura-emitida", content: facturaEmitida({ display_id, uuid, urlPdf: STOREFRONT_URL + "/mx/account/orders/details/" + order.id }) })`. Para eso agrega `display_id` y `email` a los campos del `query.graph` del pedido. El enlace lleva a la página del pedido, donde el paso 19 pone "Descargar PDF", porque la ruta del PDF exige sesión de cliente. Si el envío falla, solo registra un aviso: el CFDI ya está timbrado y la respuesta sigue siendo 201.
- `apps/backend/integration-tests/http/invoices.spec.ts` (del paso 10): el caso 1 afirma además que `notificationModule.listNotifications({ template: "factura-emitida", to })` devuelve 1 notificación por el canal `email`.
- `apps/backend/src/subscribers/__tests__/subscribers.unit.spec.ts`. Prueba los handlers con un `container` doble cuyo `resolve` devuelve un `query.graph` falso y un `createNotifications` hecho con `jest.fn()`. 3 casos:
  1. Pedido SPEI → `createNotifications` recibe `template "confirmacion-pedido"` y un `content.html` que contiene la CLABE.
  2. Pedido con tarjeta → el html no contiene `CLABE`.
  3. `shipment.created` → `template "envio-generado"` con el tracking `MOCK123456`.

**Done when**
- [ ] WHEN se emite `order.placed` para un pedido SPEI THE SYSTEM SHALL enviar exactamente 1 notificación por el canal `email` con plantilla `confirmacion-pedido` que contiene la CLABE.
- [ ] WHEN el pedido se pagó con tarjeta THE SYSTEM SHALL enviar la confirmación sin bloque SPEI.
- [ ] WHEN se emite `shipment.created` THE SYSTEM SHALL enviar `envio-generado` con el número de rastreo de la etiqueta.
- [ ] WHEN se timbra un CFDI individual THE SYSTEM SHALL crear exactamente 1 notificación `factura-emitida` por el canal `email`.

**Verify**
```bash
npm --prefix apps/backend run test:unit -- src/subscribers                         # expect: exit 0, 3 passed
npm --prefix apps/backend run test:integration:http -- integration-tests/http/invoices.spec.ts   # expect: exit 0, 5 passed — incluye la notificación factura-emitida
npm --prefix apps/backend run typecheck && npm --prefix apps/backend run build     # expect: exit 0
```

**Checkpoint**
```bash
git add -A && git commit -m "step 13: suscriptores de pedido y envio"
git tag step-13-suscriptores
```

---

#### Step 14 — Sistema de diseño en el storefront

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

**Done when**
- [ ] WHEN `node apps/storefront/scripts/check-tokens.mjs` corre THE SYSTEM SHALL salir con 0 (cero hex fuera de `globals.css`).
- [ ] WHEN se construye el storefront con el backend arriba THE SYSTEM SHALL salir con 0.
- [ ] WHEN se pide `/mx` THE SYSTEM SHALL servir un HTML con `lang="es-MX"` y un enlace `https://wa.me/529531720664` con `aria-label` "¿Dudas? Escríbenos por WhatsApp".
- [ ] WHEN `npm --prefix apps/storefront run typecheck` corre THE SYSTEM SHALL salir con 0.

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

#### Step 15 — Inicio por categorías y PDP con JSON-LD

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

**Done when**
- [ ] WHEN se pide el PDP del hoodie sin JavaScript THE SYSTEM SHALL contener `$1,299.00` en el HTML y un JSON-LD `Product` con `offers.price` `"1299.00"` en `MXN`.
- [ ] WHEN se pide `/mx` THE SYSTEM SHALL mostrar una sección por categoría con productos publicados (ROPA y TENIS con el fixture) y omitir las vacías.
- [ ] WHEN un producto tiene `metadata.solo_terrestre = true` THE SYSTEM SHALL mostrar "Solo envío terrestre" en su PDP.
- [ ] WHEN se inspecciona el HTML del PDP THE SYSTEM SHALL contener exactamente un bloque JSON-LD de producto (`Product` o `ProductGroup`).

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

#### Step 16 — Caché de catálogo de 60 s

**Do**
- Los fetch de catálogo del starter usan `cache: "force-cache"` sin `next.revalidate` y sin tags, salvo cuando existe la cookie `_medusa_cache_id`, así que Next los guarda un año (`revalidate: 31536000` en la caché de fetch). Los cambios del admin y de la carga masiva no se verían en el inicio, la PLP ni el PDP, aunque la página declare `revalidate = 60`.
- `apps/storefront/src/lib/data/products.ts` (`"use server"`): agrega después de los imports `const CATALOGO_REVALIDATE_S = 60`, sin `export` porque un archivo `"use server"` solo exporta funciones async, y `revalidate: CATALOGO_REVALIDATE_S` al objeto `next` de `listProducts`.
- `apps/storefront/src/lib/data/categories.ts`: la misma constante y `revalidate: CATALOGO_REVALIDATE_S` en el objeto `next` de `listCategories` y de `getCategoryByHandle`.
- No cambies `cache`, las etiquetas ni el carrito, el checkout o la cuenta, que siguen sin caché (§6).
- `e2e/cache-catalogo.spec.ts`: busca el hoodie (`sd-hoodie-oversize-negro`) por la Admin API e importa el fixture con `importarFixture` si no existe. Abre su PDP y espera el título original en `data-testid="product-title"`, lo que deja la página en caché. Cambia el título con `POST /admin/products/:id { title: "<original> <Date.now()>" }` y recarga el PDP dentro de `expect(...).toPass({ timeout: 90_000, intervals: [5_000] })` hasta ver el título nuevo. En un `finally` restaura el título original. `test.setTimeout(240_000)`. Sin el `revalidate`, la caché de un año sirve el título viejo y la prueba falla.

**Done when**
- [ ] WHEN se leen `products.ts` y `categories.ts` THE SYSTEM SHALL fijar `revalidate: CATALOGO_REVALIDATE_S` (60) en los tres fetch de catálogo: uno en `products.ts` y dos en `categories.ts`.
- [ ] WHEN el título del hoodie cambia por `POST /admin/products/:id` después de que su PDP ya está en caché THE SYSTEM SHALL mostrar el título nuevo en `data-testid="product-title"` del PDP en 90 s como máximo (`e2e/cache-catalogo.spec.ts`).

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

#### Step 17 — Accesibilidad WCAG 2.2 AA

**Do**
- `e2e/a11y.spec.ts`: en `beforeAll` importa el fixture si el hoodie no existe (corre antes que `catalogo.spec.ts` por orden alfabético). Después ejecuta `new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21aa","wcag22aa"]).analyze()` sobre `/mx`, `/mx/store` y `/mx/products/sd-hoodie-oversize-negro`, y afirma `violations` = `[]` en cada una.
- Con el starter de `create-medusa-app` 2.23.0 hacen falta estas cuatro correcciones:
  - `apps/storefront/src/styles/globals.css`: `--fg-muted: var(--color-fg-muted);` en el `:root`. El gris muted de `@medusajs/ui` (`#71717A`) no llega a 4.5:1 sobre `--color-background` (`color-contrast`).
  - `apps/storefront/src/modules/layout/components/medusa-cta/index.tsx`: `aria-label="Medusa"` y `aria-label="Next.js"` en los dos enlaces de íconos (`link-name`).
  - `apps/storefront/src/modules/layout/components/cart-dropdown/index.tsx`: quitar el `PopoverButton` que envuelve el enlace del carrito (`nested-interactive`). El panel es `static` y abre por hover, así que no hace falta.
  - `apps/storefront/src/modules/products/components/product-tabs/accordion.tsx`: `aria-label={title}` en el `AccordionPrimitive.Trigger` (`button-name`).
- Si axe reporta algo más, detente y repórtalo como defecto del blueprint: las cuatro correcciones de arriba son las únicas que este paso toca.

**Done when**
- [ ] WHEN axe analiza `/mx`, `/mx/store` y el PDP con las etiquetas WCAG 2.2 AA THE SYSTEM SHALL reportar 0 violaciones.
- [ ] WHEN `node apps/storefront/scripts/check-tokens.mjs` corre después de editar `globals.css` THE SYSTEM SHALL salir con 0.

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

#### Step 18 — Checkout México: SPEI, PayPal, tarjeta y Envia

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

**Done when**
- [ ] WHEN un invitado compra el hoodie M con Envío terrestre y SPEI (mock) THE SYSTEM SHALL crear el pedido y mostrar en la confirmación la CLABE `000000000000000001` y el total `$1,448.00`.
- [ ] WHEN el carrito contiene un producto `solo_terrestre` THE SYSTEM SHALL ofrecer "Envío terrestre" y no "Envío express".
- [ ] WHEN el paso de pago carga THE SYSTEM SHALL listar "Tarjeta de crédito o débito" (si `STRIPE_API_KEY` está definido), "Transferencia SPEI" y "PayPal".
- [ ] WHEN `npm --prefix apps/storefront run typecheck` corre THE SYSTEM SHALL salir con 0.

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

#### Step 19 — Cuenta: solicitar factura

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

**Done when**
- [ ] WHEN un cliente registrado guarda una dirección THE SYSTEM SHALL listarla en `/mx/account/addresses`.
- [ ] WHEN el cliente abre el detalle de su pedido pagado y envía el formulario THE SYSTEM SHALL mostrar `Factura emitida` con el uuid devuelto por FacturAPI (mock).
- [ ] WHEN el cliente vuelve a enviarlo THE SYSTEM SHALL mostrar el mensaje de factura ya emitida en un `role="alert"`.
- [ ] WHEN `npm --prefix apps/storefront run typecheck` corre THE SYSTEM SHALL salir con 0.

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

#### Step 20 — Endurecimiento: Sentry, vencimiento SPEI, conciliación y CI

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

**Done when**
- [ ] WHEN un pago SPEI no capturado tiene `vence_en` en el pasado THE SYSTEM SHALL incluir su pedido en `speiVencidos`; WHEN está capturado o no vencido THE SYSTEM SHALL excluirlo.
- [ ] WHEN un pedido con tarjeta lleva más de 1 h sin pago capturado THE SYSTEM SHALL reportarlo en `pedidosSinPago`.
- [ ] WHEN `SENTRY_DSN` no está definido THE SYSTEM SHALL arrancar sin inicializar Sentry (el `/health` sigue OK).
- [ ] WHEN el gate global de §20.1 corre en local THE SYSTEM SHALL salir con 0 en cada línea.

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

### 9.1 Parity and cutover

NOT APPLICABLE — greenfield build, no system is being replaced.

El catálogo actual en `saint-drip-catalogo.vercel.app` sigue en línea hasta el lanzamiento. Ningún dato
migra de forma automática: el equipo lo carga con la plantilla Excel. Redirigir el dominio es una tarea
del checklist de lanzamiento (§20.1).

---

## 10. Environment Setup

### Prerequisites
| Tool | Version | Check |
|---|---|---|
| Node.js | 24.22.3 (LTS "Krypton") | `node -v` → `v24.22.3` |
| npm | 11.19.1 (incluido con Node 24.22.3) | `npm -v` |
| Docker con Compose v2 (`--wait`) | Docker Desktop o Engine reciente | `docker compose version` |
| Git | ≥ 2.28 (`init -b`) | `git --version` |
| Puertos libres | 5432, 6379, 8000, 9000 | `docker compose up` falla con "port is already allocated" si un Postgres local ocupa el 5432: detenlo antes |
| Shell | bash (Linux/macOS) o **Git Bash** en Windows | los bloques de este blueprint son bash |

### Accounts to create first
| Servicio | URL | Lo necesita por primera vez |
|---|---|---|
| Stripe (cuenta MX, habilitar "Bank transfers") | https://dashboard.stripe.com/register | §20.1 (pruebas en vivo de tarjeta y SPEI); los pasos 6 y 18 usan mock |
| PayPal Developer (app REST + webhook) | https://developer.paypal.com | §20.1; el paso 7 usa mock |
| Envia.com (token de API, sandbox) | https://envia.com | §20.1; el paso 8 usa mock |
| FacturAPI (organización con CSD cargado) | https://www.facturapi.io | §20.1; los pasos 9–11 usan mock |
| Resend (dominio verificado) | https://resend.com | §20.1 |
| Cloudflare R2 (bucket público + token S3) | https://dash.cloudflare.com | Producción (§12) |
| Railway | https://railway.com | Producción (§12) |
| Vercel | https://vercel.com | Producción (§12) |
| Sentry | https://sentry.io | Paso 20 (opcional en local) |

Ningún paso de §9 necesita credenciales reales: todo integrador tiene un modo `mock`
determinista. Las cuentas se crean antes del lanzamiento.

### Environment variables
Backend: `apps/backend/.env`, copiado de `.env.example` en Bootstrap. Tests: `apps/backend/.env.test`.
Storefront: `apps/storefront/.env.local`. El scaffold lo crea con sus propias claves y `scripts/write-storefront-env.mjs` le agrega las de `apps/storefront/.env.example` que falten y escribe la llave publicable.

| Variable | Purpose | Where to get it | Required by step | Secret? |
|---|---|---|---|---|
| `DATABASE_URL` | Postgres | local: `postgres://medusa:medusa@localhost:5432/saint_drip` · prod: Railway | Bootstrap | sí en prod |
| `REDIS_URL` | Redis (event bus, workflows, locking) | local: `redis://localhost:6379` · prod: Railway | 2 | sí en prod |
| `STORE_CORS` / `ADMIN_CORS` / `AUTH_CORS` | CORS | local: valores de `.env.example` · prod: dominios reales | Bootstrap | no |
| `JWT_SECRET` / `COOKIE_SECRET` | Firma de sesiones; ≥ 32 caracteres en prod | `openssl rand -hex 32` | Bootstrap (prod: §12) | sí |
| `MEDUSA_BACKEND_URL` | URL pública del backend (admin, file-local) | local `http://localhost:9000` | Bootstrap | no |
| `MEDUSA_WORKER_MODE` | `shared` local · `server` / `worker` en Railway | — | 2 | no |
| `DISABLE_MEDUSA_ADMIN` | `true` en el worker | — | 2 | no |
| `SEED_ADMIN_PASSWORD` | Contraseña del admin del seed (local `saintdrip-dev`) | elegir | Bootstrap | sí en prod |
| `FILE_PROVIDER` | `local` o `s3` (R2) | — | 2 | no |
| `S3_FILE_URL` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_REGION` / `S3_BUCKET` / `S3_ENDPOINT` | Cloudflare R2 (`S3_REGION=auto`) | Cloudflare → R2 → token de API S3 | producción | sí (keys) |
| `STRIPE_API_KEY` / `STRIPE_WEBHOOK_SECRET` | Tarjeta (proveedor oficial); la API key también la usa SPEI live | Stripe → Developers | producción / §20.1 | sí |
| `SPEI_MODE` | `mock` local · `live` prod | — | 6 | no |
| `SPEI_WEBHOOK_SECRET` | Secreto del endpoint `/hooks/payment/spei_spei` | Stripe → Webhooks | producción | sí |
| `PAYPAL_ENVIRONMENT` | `mock` \| `sandbox` \| `live` | — | 7 | no |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_WEBHOOK_ID` | PayPal REST | developer.paypal.com → Apps | producción | sí (secret) |
| `ENVIA_ENVIRONMENT` | `mock` \| `sandbox` \| `production` | — | 8 | no |
| `ENVIA_API_TOKEN` | Envia.com | Envia → Desarrolladores | producción | sí |
| `FACTURAPI_MODE` / `FACTURAPI_KEY` | `mock` \| `live` · llave secreta | FacturAPI → API keys | 9 / producción | sí (key) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Correos | Resend → API keys | 12 / producción | sí (key) |
| `STOREFRONT_URL` | Links en correos (`/mx/order/...`) | local `http://localhost:8000` | 13 | no |
| `SENTRY_DSN` | Errores del backend | Sentry → Project → DSN | 20 (opcional local) | sí |
| `PORT` | Puerto HTTP de Medusa (`9000`); solo se fija en Railway (§12) | — | producción | no |
| `VITE_BACKEND_URL` | Base URL del SDK en el admin; vacío = `/` (mismo origen). Opcional | — | 5 (opcional) | no |
| `DB_HOST` / `DB_USERNAME` / `DB_PASSWORD` | Servidor donde `@medusajs/test-utils` crea bases temporales | `.env.test` (`localhost` / `medusa` / `medusa`) | 1 | no |
| `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (storefront) | Backend para el SDK (lo lee `src/lib/config.ts` del starter) | `apps/storefront/.env.example` | Bootstrap | no |
| `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` | Llave publicable | `write-storefront-env.mjs` | Bootstrap | no (es pública) |
| `NEXT_PUBLIC_BASE_URL` / `NEXT_PUBLIC_DEFAULT_REGION` | URL y región `mx` | `.env.example` | Bootstrap | no |
| `NEXT_PUBLIC_STRIPE_KEY` | Publishable key de Stripe | Stripe | producción / §20.1 | no |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Botones PayPal; vacío = botón de prueba | PayPal | 18 (vacío) / producción | no |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Botón de WhatsApp (`529531720664`) | la marca | 14 | no |

**La validación se degrada por paso** (§9 regla 9). Fuera de producción, ninguna variable integradora
es obligatoria: cada proveedor arranca en `mock` o no se registra (Stripe y Resend se registran solo
con su key). En producción, `assertProductionEnv` (paso 2) exige todo lo marcado "producción".

### Files that must be committed
| File | Why it is committed | Ignore-file exception line |
|---|---|---|
| `apps/backend/.env.example`, `apps/storefront/.env.example` | Documentan cada variable | `!.env.example` después de `.env` en `.gitignore` raíz y en los de cada app |
| `apps/backend/.env.test` | Valores locales no secretos para Jest | `!.env.test` en `.gitignore` raíz y en `apps/backend/.gitignore` |
| `package-lock.json`, `apps/backend/package-lock.json`, `apps/storefront/package-lock.json` | Instalación reproducible (`npm ci` en CI) | — no lo cubre ningún patrón de ignore |
| `docker-compose.yml`, `playwright.config.ts`, `apps/backend/jest.config.js`, `apps/backend/tsconfig.json`, `apps/backend/integration-tests/setup.js`, `scripts/*.mjs`, `.nvmrc` | Configs que usan los gates | — no lo cubre ningún patrón de ignore |
| Fixtures `apps/backend/src/lib/catalog-import/__fixtures__/*.xlsx`, `e2e/fixtures/**` | Entradas de los tests | — no lo cubre ningún patrón de ignore |
| `apps/backend/src/modules/facturapi/migrations/*` | Esquema reproducible | — no lo cubre ningún patrón de ignore |
| `CLAUDE.md`, `AGENTS.md`, `apps/storefront/CLAUDE.md`, `apps/storefront/AGENTS.md` (los genera `next dev`), `.claude/**`, `blueprints/saint-drip/**`, `docs/**` | Configuración del agente y diseño | — no lo cubre ningún patrón de ignore |
| `.github/workflows/ci.yml` | CI | — no lo cubre ningún patrón de ignore |

Los `.gitignore` emitidos (raíz, `apps/backend/`, `apps/storefront/`) llegan con la copia del workspace,
**antes del primer commit**. `merge-scaffold.mjs` nunca los sobrescribe.

### Bootstrap
Ejecuta este bloque desde la **raíz del proyecto**: un directorio vacío `saint-drip/` que contiene
únicamente `blueprints/saint-drip/`, este bundle. En Windows, usa Git Bash.

```bash
set -euo pipefail
# order matters: workspace copy (ignore files + configs) → repo init → first commit → scaffold + merge
#                → manifest edits → installs → .env → services → migrate → seed → storefront env → commit

# 1. Workspace copy. -n never clobbers a file the build has since changed (package.json, configs).
#    GNU cp exits 0 when it skips; BSD/macOS cp exits 1 when it skips — skipping is the intended outcome.
cp -Rn blueprints/saint-drip/workspace/. ./ || true

# 2. Repository + first commit (the .gitignore files from step 1 are already on disk)
git rev-parse --git-dir >/dev/null 2>&1 || git init -b main
git add -A && git commit -q -m "chore: workspace de Saint Drip" --allow-empty

# 3. Scaffold Medusa 2.23.0 + Next.js starter into .scaffold-tmp, then merge WITHOUT overwriting workspace files
if [ ! -f apps/backend/medusa-config.ts ]; then
  mkdir -p .scaffold-tmp
  npx --yes create-medusa-app@2.23.0 saint-drip --directory-path .scaffold-tmp --skip-db --no-browser --with-nextjs-starter --use-npm --version 2.23.0
  node scripts/merge-scaffold.mjs
fi

# 4. Manifest edits (npm pkg set/delete are idempotent; deleting a missing key exits 0)
npm --prefix apps/storefront pkg delete packageManager
npm --prefix apps/storefront pkg set "dependencies.@medusajs/js-sdk=2.23.0" \
  "scripts.dev=next dev -p 8000" "scripts.build=next build" "scripts.start=next start -p 8000" \
  "scripts.typecheck=tsc --noEmit"
npm --prefix apps/backend pkg set \
  "scripts.dev=medusa develop" "scripts.build=medusa build" "scripts.start=medusa start" \
  "scripts.predeploy=medusa db:migrate" \
  "scripts.typecheck=tsc --noEmit && tsc --noEmit -p src/admin/tsconfig.json" \
  "scripts.db:migrate=medusa db:migrate" "scripts.db:generate=medusa db:generate" \
  "scripts.seed=medusa exec ./src/scripts/seed-saint-drip.ts" \
  "scripts.print-key=medusa exec ./src/scripts/print-publishable-key.ts" \
  "scripts.test:unit=cross-env TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules jest --silent --runInBand --forceExit" \
  "scripts.test:integration:http=cross-env TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules jest --silent=false --runInBand --forceExit"

# 5. Installs — exact pins from §11
npm --prefix apps/backend install
npm --prefix apps/backend install --save-exact stripe@23.2.0 @paypal/paypal-server-sdk@2.5.0 exceljs@4.4.0 facturapi@6.1.0 resend@6.39.0 @sentry/node@11.16.0 @medusajs/ui@4.3.0 @medusajs/admin-sdk@2.23.0 @medusajs/js-sdk@2.23.0
npm --prefix apps/backend install --save-dev --save-exact @medusajs/test-utils@2.23.0 cross-env@10.1.0   # jest/@swc/jest/@types/jest: the scaffold's own (§11)
npm --prefix apps/storefront install
npm --prefix apps/storefront install --save-exact @paypal/react-paypal-js@10.6.1
npm install
npx --no-install playwright install chromium

# 6. Local env file — never overwrite an existing .env (merge-scaffold.mjs does not copy the scaffold's own .env)
[ -f apps/backend/.env ] || cp apps/backend/.env.example apps/backend/.env

# 7. Services → schema → seed (idempotent) → storefront publishable key (idempotent)
npm run services:up
npm --prefix apps/backend run db:migrate
npm --prefix apps/backend run seed
node scripts/write-storefront-env.mjs

# 8. Baseline commit — --allow-empty because a second run has nothing new and must still exit 0
git add -A && git commit -q -m "chore: scaffold Medusa 2.23.0 + storefront" --allow-empty
```

---

## 11. Dependencies

Verificado en vivo el 2026-11-21 con `npm view <pkg> dist-tags` (registro npm), Docker Hub API y
`nodejs.org/dist/index.json`. Todos los `@medusajs/*` van en **2.23.0** porque `create-medusa-app
--version 2.23.0` los fija juntos.

### Runtime
| Package | Version | Source (registry URL or track file) | Checked | Installed by | Purpose |
|---|---|---|---|---|---|
| Node.js | 24.22.3 | https://nodejs.org/dist/index.json (LTS Krypton, 2026-11-10) | 2026-11-21 | prerequisito; `.nvmrc` | Runtime. Medusa 2.23.0 exige `node >=22.22.0` (`engines` leído del registro) |
| npm | 11.19.1 | https://nodejs.org/dist/index.json (campo `npm` de v24.22.3) | 2026-11-21 | incluido con Node | Gestor de paquetes |
| create-medusa-app | 2.23.0 | https://registry.npmjs.org/create-medusa-app (latest) | 2026-11-21 | §10 Bootstrap (`npx --yes create-medusa-app@2.23.0`) | Scaffold de backend y storefront |
| @medusajs/medusa · @medusajs/framework · @medusajs/cli · @medusajs/admin-sdk · @medusajs/js-sdk (backend) | 2.23.0 | https://registry.npmjs.org/@medusajs/medusa (latest; peer `@medusajs/framework: 2.23.0`) | 2026-11-21 | §10 Bootstrap (scaffold con `--version 2.23.0`) | Motor de comercio. Incluye `payment-stripe`, `file-s3`, `file-local`, `notification-local`, `event-bus-redis`, `workflow-engine-redis`, `locking-redis` y `fulfillment-manual` 2.23.0 como dependencias (leído de `dependencies`) |
| @medusajs/ui | 4.3.0 | https://registry.npmjs.org/@medusajs/ui (latest) | 2026-11-21 | §10 Bootstrap (install `--save-exact` en apps/backend, junto con `@medusajs/admin-sdk@2.23.0` y `@medusajs/js-sdk@2.23.0`) | Componentes de la página de carga masiva |
| @medusajs/js-sdk (storefront) | 2.23.0 | https://registry.npmjs.org/@medusajs/js-sdk | 2026-11-21 | §10 Bootstrap (`npm pkg set` + install) | SDK del storefront; el starter declara `latest` y se fija aquí |
| stripe | 23.2.0 | https://registry.npmjs.org/stripe (latest; satisface el `^23.1.0` de @medusajs/payment-stripe) | 2026-11-21 | §10 Bootstrap | Cliente Stripe del proveedor SPEI |
| @paypal/paypal-server-sdk | 2.5.0 | https://registry.npmjs.org/@paypal/paypal-server-sdk (latest) | 2026-11-21 | §10 Bootstrap | Gateway PayPal (Orders v2) |
| exceljs | 4.4.0 | https://registry.npmjs.org/exceljs (latest; 4.4.1 solo como prerelease) | 2026-11-21 | §10 Bootstrap | Leer y generar el Excel de carga masiva |
| facturapi | 6.1.0 | https://registry.npmjs.org/facturapi (latest) | 2026-11-21 | §10 Bootstrap | Timbrado CFDI |
| resend | 6.39.0 | https://registry.npmjs.org/resend (latest) | 2026-11-21 | §10 Bootstrap | Envío de correos |
| @sentry/node | 11.16.0 | https://registry.npmjs.org/@sentry/node (latest) | 2026-11-21 | §10 Bootstrap | Errores del backend |
| @paypal/react-paypal-js | 10.6.1 | https://registry.npmjs.org/@paypal/react-paypal-js (latest) | 2026-11-21 | §10 Bootstrap | Botones PayPal en el checkout |
| next · react · react-dom · tailwindcss (storefront) | los del starter: next 16.3.8, react 19.0.5, tailwindcss ^3.0.23 | observado en `apps/storefront/package.json` generado por create-medusa-app 2.23.0 `--with-nextjs-starter` el 2026-11-21 (smoke test) | 2026-11-21 | §10 Bootstrap (scaffold) | Storefront. No se actualizan en v1 (§20.3 #3) |
| postgres (imagen) | 17.12-alpine | https://hub.docker.com/v2/repositories/library/postgres/tags?name=17. (refresh: 17.9 → 17.12) | 2026-11-21 | `docker-compose.yml`, `.github/workflows/ci.yml` | Base de datos local y de CI |
| redis (imagen) | 7.4.12-alpine | https://hub.docker.com/v2/repositories/library/redis/tags?name=7.4 (refresh: 7.4.9 → 7.4.12) | 2026-11-21 | `docker-compose.yml`, `.github/workflows/ci.yml` | Redis local y de CI |

### Development
| Package | Version | Source (registry URL or track file) | Checked | Installed by | Purpose |
|---|---|---|---|---|---|
| @medusajs/test-utils | 2.23.0 | https://registry.npmjs.org/@medusajs/test-utils (peers medusa/framework/core-flows 2.23.0) | 2026-11-21 | §10 Bootstrap | `medusaIntegrationTestRunner` |
| jest | ^29.7.0 (la del scaffold) | observado en `apps/backend/package.json` generado por create-medusa-app 2.23.0 el 2026-11-21; npm `latest` es 30.5.2 pero no se sube porque `@medusajs/test-utils` 2.23.0 se publica con el scaffold en 29 | 2026-11-21 | §10 Bootstrap (scaffold + `npm --prefix apps/backend install`) | Runner de tests del backend |
| @types/jest | ^29.5.13 (la del scaffold) | `apps/backend/package.json` del scaffold, 2026-11-21 | 2026-11-21 | §10 Bootstrap (scaffold) | Tipos de Jest |
| @types/node | ^20.12.11 (la del scaffold) | `apps/backend/package.json` del scaffold, 2026-11-21 | 2026-11-21 | §10 Bootstrap (scaffold) | Tipos de Node; los nombra el `"types"` de `workspace/apps/backend/tsconfig.json` |
| @swc/jest | ^0.2.36 (la del scaffold; resuelve a 0.2.39, latest) | `apps/backend/package.json` del scaffold + https://registry.npmjs.org/@swc/jest | 2026-11-21 | §10 Bootstrap (scaffold) | Transformación TS en Jest |
| cross-env | 10.1.0 | https://registry.npmjs.org/cross-env (latest; engines node >=20) | 2026-11-21 | §10 Bootstrap | Variables en scripts npm también en Windows |
| @playwright/test | 1.65.1 | https://registry.npmjs.org/@playwright/test (latest) | 2026-11-21 | `package.json` raíz (workspace) + `npm install` en §10 | E2E |
| @axe-core/playwright | 4.14.0 | https://registry.npmjs.org/@axe-core/playwright (latest) | 2026-11-21 | `package.json` raíz (workspace) + `npm install` en §10 | Auditoría a11y automática |
| typescript (ambas apps) | ^6.0.3 (la del scaffold) | observado en ambos `package.json` del scaffold, 2026-11-21; npm `latest` es 7.0.2 (reescritura en Go, sin API de compilador estable) | 2026-11-21 | §10 Bootstrap (scaffold) | `typecheck` |

### Deliberately not used
| Rejected | Instead | Why |
|---|---|---|
| `@alphabite/medusa-paypal` 0.2.6 | Proveedor PayPal propio (paso 7) | Sus peers exigen exactamente `@medusajs/*` 2.13.6, incompatible con 2.23.0 |
| Plugins de Mercado Pago para Medusa | — (Non-Goal) | Comunitarios y probados solo en Uruguay; fuera del alcance de v1 |
| `zod` instalado aparte | `@medusajs/framework/zod` | Evita dos copias de zod con tipos incompatibles en las rutas |
| Drizzle / Prisma | DML + migraciones de Medusa | Dos sistemas de migración sobre una base es una combinación mala conocida |
| pnpm | npm | El deploy documentado de Medusa usa `npm install` en `.medusa/server` (§20.3 #4) |
| Biome / ESLint como gate | `tsc --noEmit` + tests | Formatear cientos de archivos del scaffold no aporta seguridad en v1 (§20.3 #5) |
| `@sentry/wizard` | Configuración manual en `instrumentation.ts` | El wizard es interactivo y colgaría un build desatendido |

---

## 12. Deployment Strategy

### Hosting
- **Railway, proyecto "saint-drip"**, región más cercana a México (US West o US East, la de menor latencia que ofrezca el plan Hobby). Contiene:
  - **Postgres** (plugin de Railway, respaldos diarios activados);
  - **Redis** (plugin);
  - **`medusa-server`:** root dir `apps/backend`, build `npm ci && npm run build`, start `cd .medusa/server && npm install && npm run predeploy && npm run start`, y `MEDUSA_WORKER_MODE=server`, `DISABLE_MEDUSA_ADMIN=false`, `PORT=9000`, health check `/health`;
  - **`medusa-worker`:** el mismo build, start `cd .medusa/server && npm install && npm run start`, y `MEDUSA_WORKER_MODE=worker`, `DISABLE_MEDUSA_ADMIN=true`.
- **Vercel, proyecto "saint-drip-storefront"**, con root dir `apps/storefront`, framework Next.js y build `npm run build`. `NEXT_PUBLIC_MEDUSA_BACKEND_URL` apunta a `https://api.saintdrip.mx`, y el resto de las `NEXT_PUBLIC_*` toman los valores de producción.
- **Cloudflare R2:** bucket `saint-drip-media` con acceso público por dominio `media.saintdrip.mx` (`S3_FILE_URL`).

### Environments
| Environment | Branch | URL | Database | Third-party mode |
|---|---|---|---|---|
| Local | — | localhost:8000 / :9000 | Docker `saint_drip` | mock |
| Preview | cualquier PR | Vercel preview (storefront) apuntando al backend de staging | Railway env "staging" | sandbox / test keys |
| Production | `main` | `saintdrip.mx` (tienda) · `api.saintdrip.mx` (backend y admin en `/app`) | Railway "production" | live |

### CI/CD
GitHub Actions `.github/workflows/ci.yml` (paso 20):
1. install;
2. migrate y seed;
3. backend typecheck, unit, integration y build;
4. storefront typecheck y build;
5. E2E completo.

Es el mismo gate que §20.1. Railway y Vercel despliegan `main` de forma automática solo si el check de CI está en verde (protección de rama en GitHub).

### Release and rollback
- `medusa-server` aplica migraciones en `predeploy` antes de aceptar tráfico, y el worker se despliega después.
- Las migraciones son siempre aditivas (expand-then-contract).
- **Rollback:** Railway → Deployments → "Redeploy" del despliegue anterior (≈ 3 min) y Vercel → "Promote" del despliegue anterior (≈ 30 s). Una migración nunca se revierte en caliente: se corrige con otra migración aditiva.

### Domain, DNS, TLS
- `saintdrip.mx` y `www` → Vercel (A/CNAME que indica Vercel); `www` redirige 308 a apex.
- `api.saintdrip.mx` → CNAME al dominio de `medusa-server` en Railway.
- `media.saintdrip.mx` → dominio público de R2.
- TLS automático en los tres.
- `saint-drip-catalogo.vercel.app`: redirección 308 a `https://saintdrip.mx` el día del lanzamiento, desde el proyecto actual en Vercel.

---

## 13. Testing Strategy

| Layer | Framework | What it covers | Where | Runs |
|---|---|---|---|---|
| Unit | Jest + @swc/jest (`TEST_TYPE=unit`) | Lógica pura: carga masiva, reglas CFDI, plantillas de correo, reconciliación, validación de entorno; proveedores SPEI/PayPal/Envia con gateways dobles; suscriptores con contenedor doble | `apps/backend/src/**/__tests__/*.unit.spec.ts` | cada commit |
| Integration | Jest + `@medusajs/test-utils` (`TEST_TYPE=integration:http`) | API real de Medusa sobre una base temporal por suite: health, seed, importación, facturas | `apps/backend/integration-tests/http/*.spec.ts` | cada commit |
| E2E | Playwright + axe | Admin de carga masiva, catálogo sin JS, caché de catálogo (60 s), a11y, checkout SPEI, cuenta y factura | `e2e/*.spec.ts` | cada PR y antes del deploy |

### Critical flows to cover E2E
1. Carga masiva: Excel con errores → tabla; Excel válido + fotos → 3 productos creados (`e2e/carga-masiva.spec.ts`).
2. Compra de invitado con Envío terrestre + SPEI → CLABE y total `$1,448.00`; carrito `solo_terrestre` sin express (`e2e/checkout-spei.spec.ts`).
3. Cliente registrado: dirección, pedido pagado y solicitud de factura → uuid (`e2e/cuenta-factura.spec.ts`).
4. PDP indexable sin JS (precio + JSON-LD) y 0 violaciones axe (`e2e/catalogo.spec.ts`, `e2e/a11y.spec.ts`).

### Test data
- **Integración:** `medusaIntegrationTestRunner` crea y borra una base temporal por suite en el Postgres de `docker-compose.yml` (`DB_HOST`, `DB_USERNAME` y `DB_PASSWORD` de `.env.test`). Cada suite llama `seedSaintDrip`.
- **E2E:** usa la base de desarrollo `saint_drip`. Cada spec se prepara solo: borra y reimporta los productos del fixture con `e2e/helpers/admin.ts` y usa emails con timestamp. Los tests nunca dependen del orden de ejecución.
- **Integradores:** en tests y E2E corren en `mock`, así que nada sale de la máquina.
- **Reset completo:** `npm run services:reset`, luego `db:migrate` y `seed`.

### What is deliberately not tested
- Las llamadas reales a Stripe, PayPal, Envia, FacturAPI y Resend en los gates: necesitan cuentas y red, así que van en §20.1 como verificaciones en vivo.
- La UI del admin de Medusa más allá de la página de carga masiva, porque es del vendor.
- La tarjeta con Stripe Elements en E2E: el iframe de Stripe exige llaves de prueba reales y se verifica en §20.1.

---

## 14. Security & Secrets

| Concern | Control | Implemented in |
|---|---|---|
| Secret storage | Variables de entorno de Railway y Vercel; `.env` ignorado; `.env.example` sin valores secretos | §10, `.gitignore` |
| Secret rotation | Rotar JWT/COOKIE/llaves de integradores cada 12 meses o al salir alguien del equipo; Stripe y PayPal permiten llaves dobles durante la rotación | procedimiento en `CLAUDE.md` |
| Input validation | zod (`@medusajs/framework/zod`) en cada ruta propia; reglas del Excel en `validate.ts` | rutas de los pasos 4 y 10 |
| Output encoding / XSS | React escapa por defecto; JSON-LD con `JSON.stringify` y `<` escapado como `<`; plantillas de correo escapan los campos del cliente | pasos 12 y 15 |
| SQL injection | Solo `query.graph` y servicios de Medusa (parametrizados); cero SQL concatenado | todo el backend |
| AuthN / AuthZ | Ver §8; propiedad del pedido verificada en el servidor | paso 10 |
| CSRF | Server actions de Next (origen) + CORS de Medusa | §8 |
| Rate limiting / abuse | Sin limitador propio en v1. Los webhooks verifican la firma. El registro de clientes queda detrás de la protección de bots de Vercel | §20.2 |
| Webhook verification | Stripe `constructEvent` con `SPEI_WEBHOOK_SECRET`/`STRIPE_WEBHOOK_SECRET`; PayPal `verify-webhook-signature`; Medusa deduplica por sesión de pago | pasos 6 y 7 |
| Dependency audit | `npm audit --omit=dev --audit-level=high` en cada app, mensual; lo corrige quien mantiene | CI (manual en v1) |
| Security headers | En Vercel (`next.config.js` del storefront, paso 20 o lanzamiento): `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`. La CSP en modo report-only en v1, porque PayPal y Stripe cargan scripts propios | checklist §20.1 |
| PII handling | Nombre, email, teléfono, dirección y RFC en Postgres (Railway, cifrado en reposo). Las tarjetas nunca tocan el servidor (Stripe Elements y PayPal). Borrado a petición (§8) | — |
| Logging hygiene | Nunca se registran el body de los webhooks, las llaves ni el RFC completo; Sentry con `dataCollection` apagado (`userInfo`, `cookies`, `httpHeaders`, `httpBodies`, `urlQueryParams`, `databaseQueryData`) | pasos 6, 7 y 20 |

**Hard rules**
- No secret is ever committed, printed in a log, sent to an error tracker, or embedded in a client bundle. Anything reaching the browser is public — treat it that way.
- All server-side authorization checks run before the work, not after.
- Third-party webhooks are verified by signature before their body is parsed as trusted.

**Régimen aplicable:** la LFPDPPP de México aplica a los datos personales de clientes. Exige un aviso
de privacidad publicado en la tienda (texto de la marca, en el checklist de §20.1) y atender las
solicitudes ARCO. Los datos fiscales (RFC) se tratan como datos personales. No se manejan datos de
salud ni de menores. **Reembolsos SPEI:** son manuales en v1. El operador transfiere desde la cuenta de
la marca y registra el reembolso en el admin como "refund" del pedido.

---

## 15. Accessibility

**Target: WCAG 2.2 Level AA.** This is not polish — in the EU, UK, US public sector, and a growing
set of private-sector jurisdictions it is a legal gate, and retrofitting it costs several times what
building it in costs. Accessibility criteria belong in Section 9 "Done when" lists, not in a
someday backlog.

### Baseline requirements
| Requirement | Rule |
|---|---|
| Semantic HTML | Landmarks (`header`/`nav`/`main`/`footer`), one `h1` per page, headings in order, lists for lists |
| Keyboard | Every interactive element reachable and operable by keyboard; logical tab order; no traps; skip-to-content link |
| Focus visible | A visible focus indicator on every focusable element, ≥3:1 against its background (`outline: 2px solid var(--color-primary)` con `outline-offset: 2px`; sobre fondo `--color-primary` el outline es `--color-accent`) |
| Contrast | Text 4.5:1, large text and UI boundaries 3:1 — the §7 palette already satisfies this |
| Forms | Every input has a programmatic label; errors are text, not color alone; errors are announced |
| Images | Meaningful images have alt text (título del producto + "foto N"); decorative images have `alt=""` |
| Motion | Everything animated respects `prefers-reduced-motion: reduce` |
| Zoom / reflow | Usable at 200% zoom and at 320 CSS px wide without horizontal scrolling |
| Live regions | Async status changes announced via `aria-live` or a role that implies it (carrito, "Timbrando…", errores de checkout) |

### WCAG 2.2 additions — the ones most often missed
| SC | Requirement |
|---|---|
| 2.4.11 Focus Not Obscured (Min) | A focused element is never fully hidden behind sticky headers, cookie bars, or toasts — el botón de WhatsApp deja `padding-bottom: 88px` en el footer del checkout |
| 2.5.7 Dragging Movements | Any drag interaction has a single-pointer alternative (la galería tiene flechas además del swipe) |
| 2.5.8 Target Size (Min) | Pointer targets are at least 24×24 CSS px, or adequately spaced (botones de talla 44×44) |
| 3.3.7 Redundant Entry | La dirección de envío se reutiliza como dirección de facturación y las direcciones guardadas se pueden elegir |
| 3.3.8 Accessible Authentication (Min) | No cognitive-function test with no alternative — allow password managers, never block paste |

### Verification
```bash
npm run test:e2e -- e2e/a11y.spec.ts      # expect: exit 0 — 0 violaciones axe (wcag2a, wcag2aa, wcag21aa, wcag22aa) en /mx, /mx/store y el PDP
```
Automated checks catch roughly a third of real issues. Add these manual passes before launch:
keyboard-only traversal of every critical flow, one screen-reader pass over the primary flow, and a
200% zoom pass on the narrowest breakpoint.

---

## 16. Observability & Cost

### Instrumentation
| Signal | Tool | What it captures | Who looks at it |
|---|---|---|---|
| Errors | Sentry (`@sentry/node`, plan Developer gratuito) | Excepciones del backend con release y entorno; sin PII | El desarrollador de guardia, por email |
| Logs | Railway logs (logger de Medusa) | `spei.vencido`, `factura-global`, `reconciliacion`, errores de proveedores | Dev, semanal |
| Metrics | Consultas SQL de abajo (v1) | Las cuatro métricas de la tabla | Dueño, mensual |
| Uptime | Monitor de Railway sobre `/health` + monitor gratuito externo (UptimeRobot) cada 5 min a `https://api.saintdrip.mx/health` y `https://saintdrip.mx/mx` | Caídas | Dev, alerta por email |

### The metrics that matter for this project
| Metric | Target | Alert at |
|---|---|---|
| Errores 5xx de `/store/carts/*/complete` | < 1 % | > 3 % en 1 h (alerta de Sentry por volumen) |
| Pedidos sin pago capturado después de 1 h (`reconciliacion`) | 0 | ≥ 1 (Sentry captura el mensaje) |
| SPEI vencidos / SPEI emitidos en el mes | ≤ 20 % | > 35 %: revisar el texto de las instrucciones |
| Conversión checkout iniciado → pedido: `select (select count(*) from "order" where created_at >= date_trunc('month', now()))::float / nullif((select count(*) from cart where email is not null and created_at >= date_trunc('month', now())),0)` | ≥ 45 % | < 25 % |
| Factura global del mes anterior | existe el día 1 antes de las 06:00 CDMX | falta → log `factura-global` sin registro |

### Health check
`GET /health` (Medusa) responde `OK` cuando el servidor HTTP está arriba. El monitor de Railway lo usa
para reiniciar y para el corte de despliegue. Que la base esté conectada y migrada lo garantiza el
`predeploy`: un deploy cuya migración falla no recibe tráfico.

### Cost model
| Service | Free tier | Cost at v1 (≈50 pedidos/mes) | Cost at 10× | Cliff to watch |
|---|---|---|---|---|
| Railway (server + worker + Postgres + Redis) | Hobby incluye USD 5 de uso | ≈ USD 20–30/mes | ≈ USD 40–60/mes | La RAM del servidor (el build del admin pide 2 GB) |
| Vercel (storefront) | Hobby gratis, pero **no permite uso comercial** → Pro | USD 20/mes (Pro) | USD 20/mes | Ancho de banda de imágenes optimizadas |
| Cloudflare R2 | 10 GB y egress gratis | USD 0 | ≈ USD 0–1 | > 10 GB de fotos |
| Stripe tarjeta / SPEI | — | 3.6 % + MXN 3 por tarjeta; SPEI según la tarifa MX de Stripe (verificar en el dashboard) | proporcional | — |
| PayPal | — | ≈ 3.95 % + comisión fija MX (verificar en PayPal) | proporcional | — |
| Envia.com | Sin mensualidad; pagas la guía | costo de cada guía (lo paga el cliente en la tarifa) | proporcional | — |
| FacturAPI | Plan de entrada por número de timbres | ≈ el plan más bajo (verificar en facturapi.io) | siguiente plan | Timbres/mes |
| Resend | 3,000 correos/mes gratis | USD 0 | USD 0–20 | > 3,000 correos/mes |
| Sentry | Developer gratis (5k errores) | USD 0 | USD 0 | Picos de errores |

**Costo mensual estimado al lanzar: ≈ USD 45–55 en infraestructura**, más las comisiones por venta. La
partida más grande es Railway. La palanca más barata para bajarla es dejar el servidor y el worker
en un solo servicio con `MEDUSA_WORKER_MODE=shared` mientras haya menos de 200 pedidos al mes. Las
comisiones de pago crecen de forma lineal con las ventas, y ningún servicio de esta lista crece más
rápido que lineal.

---

## 17. Model Routing

NOT APPLICABLE — this project does not call an LLM at runtime.

---

## 18. Skills to Use During Build

| Skill | Build steps | Why | Install |
|---|---|---|---|
| `frontend-design` (auto-activa; se nombra en prosa) | 14, 15, 17, 18 | Componentes del storefront fieles a §7 | `/plugin install frontend-design@claude-plugins-official` |
| `emil-design-eng` (auto-activa) | 14, 18 | Micro-interacciones del carrito y el checkout dentro de los tiempos de §7 | `npx skills add emilkowalski/skill` |
| `playwright-cli` (auto-activa) | 5, 15, 16, 17, 18, 19 | Depurar los E2E interactivamente | `npx skills add microsoft/playwright-cli` |
| `/claude-seo-ai:audit` | después del paso 15 | Indexabilidad de PDP/PLP y datos estructurados | `/plugin marketplace add fitodark/claude-seo-ai` y luego `/plugin install claude-seo-ai@claude-seo-ai` |
| `/humanizalo` | 12, 15 | Copy de producto y de correos en español natural | `/plugin marketplace add fitodark/humanizalo` y luego `/plugin install humanizalo@humanizalo` |

Si una skill no está instalada, el builder sigue con la guía de este blueprint, lo anota en una línea y
continúa. Ningún paso depende de una skill.

---

## 19. Agent Workspace

El bundle trae `workspace/`. Bootstrap (§10, línea 1) lo copia a la raíz del proyecto con
`cp -Rn … || true` (no pisa nada; en BSD sale con 1 cuando omite, por eso el `|| true`). **Nunca se
sobrescriben** `package.json` ni los lockfiles una vez instalado algo, porque `-n` y `merge-scaffold.mjs`
respetan lo que ya existe.

```
workspace/
├── CLAUDE.md  AGENTS.md
├── .gitignore  .nvmrc  package.json  docker-compose.yml  playwright.config.ts
├── scripts/merge-scaffold.mjs  scripts/write-storefront-env.mjs  scripts/with-server.mjs  scripts/store-check.mjs
├── docs/plantilla-catalogo-saint-drip.xlsx
├── e2e/fixtures/plantilla-valida.xlsx  e2e/fixtures/fotos/{4 jpg}
├── apps/backend/{.gitignore,.env.example,.env.test,jest.config.js,tsconfig.json}
├── apps/backend/integration-tests/setup.js
├── apps/backend/src/scripts/{seed-saint-drip.ts,print-publishable-key.ts}
├── apps/backend/src/lib/catalog-import/__fixtures__/{plantilla-valida.xlsx,plantilla-con-errores.xlsx}
├── apps/storefront/{.gitignore,.env.example}
└── .claude/settings.json  .claude/skills/{nuevo-proveedor-pago,carga-masiva,nueva-migracion}/SKILL.md
    .claude/rules/{backend-medusa,storefront,dinero-y-pagos}.md
```

### 19.1 `CLAUDE.md`
Emitido como `workspace/CLAUDE.md` (menos de 200 líneas, con los comandos al principio).

### 19.2 `AGENTS.md`
Emitido como `workspace/AGENTS.md`.

### 19.3 `.claude/settings.json`
Emitido como `workspace/.claude/settings.json`. Autoriza cada comando de los `Verify` de §9 y de §20.1,
subcomando por subcomando, y niega leer `.env`, `git push` y borrar volúmenes.

### 19.4 Project skills — `.claude/skills/<name>/SKILL.md`
| Skill | Triggers on | What it automates |
|---|---|---|
| `nuevo-proveedor-pago` | "agregar Mercado Pago", "nuevo método de pago", "OXXO" | Crear `src/modules/<x>-payment` con gateway inyectable, modo mock, registro en `medusa-config.ts`, seed y entrada en `paymentInfoMap` |
| `carga-masiva` | "agregar columna al Excel", "cambiar la plantilla", "nuevo tipo de opción" | Cambiar `COLUMNAS`, las reglas, el fixture, los tests y `docs/` en conjunto |
| `nueva-migracion` | "agregar campo a cfdi_invoice", "nuevo modelo" | `model.define` → `db:generate <módulo>` → `db:migrate` → verificar la tabla |

### 19.5 `.claude/rules/*.md`
| File | `paths` globs | Covers |
|---|---|---|
| `.claude/rules/backend-medusa.md` | `apps/backend/src/**`, `apps/backend/medusa-config.ts` | Workflows para escribir, gateways inyectables, mock obligatorio, `query.graph`, `src/lib` puro |
| `.claude/rules/storefront.md` | `apps/storefront/src/**` | Tokens de §7, cero hex, server components, textos en español, a11y |
| `.claude/rules/dinero-y-pagos.md` | `apps/backend/src/modules/*-payment/**`, `apps/backend/src/lib/cfdi/**`, `apps/storefront/src/modules/checkout/**` | Unidades mayores frente a centavos, IVA incluido, webhooks firmados, montos solo del servidor |

### 19.6 Verify-critical config and local infrastructure

| File | Path in the project | Which `Verify` commands need it | Resolution/env handling it carries | Bundle-path exclusion |
|---|---|---|---|---|
| `docker-compose.yml` | `docker-compose.yml` | 1, 9 (psql), toda la suite vía `services:up` | imágenes fijadas + healthchecks; sin variables | n/a — this tool never walks the tree |
| `package.json` (raíz) | `package.json` | `npm run services:*`, `npm run test:e2e` | sin workspaces npm: cada app se instala con `--prefix` | n/a — sin globs de workspaces |
| `apps/backend/jest.config.js` | `apps/backend/jest.config.js` | 1–13, 20 | `loadEnv("test")` carga `.env.test`; `@swc/jest` con TS/TSX y decorators | `testPathIgnorePatterns: ["/node_modules/", "/blueprints/", "/.medusa/"]` |
| `apps/backend/integration-tests/setup.js` | `apps/backend/integration-tests/setup.js` | 1, 2, 4, 10, 13, 20 | limpia `MetadataStorage` de MikroORM | n/a — this tool never walks the tree |
| `apps/backend/.env.test` | `apps/backend/.env.test` | todos los `test:*` | `DB_HOST`/`DB_USERNAME`/`DB_PASSWORD` para bases temporales; integradores en mock | n/a — this tool never walks the tree |
| `apps/backend/.env.example` | → `.env` (Bootstrap) | `dev`, `build`, `seed`, `db:*` | lo lee `loadEnv` en `medusa-config.ts` | n/a — this tool never walks the tree |
| `playwright.config.ts` | `playwright.config.ts` | 5, 15, 16, 17, 18, 19, 20 | `webServer` levanta backend y storefront; `testDir: ./e2e` | `testIgnore: ["**/blueprints/**", "**/fixtures/**", "**/helpers/**"]` |
| `scripts/with-server.mjs` | `scripts/with-server.mjs` | 1, 2, 6, 7, 8, 12, 14 | apaga el árbol de procesos (`taskkill /T` en Windows, grupo en POSIX) | n/a — this tool never walks the tree |
| `scripts/store-check.mjs` | `scripts/store-check.mjs` | 6, 7, 8, 14 | lee la llave de `apps/storefront/.env.local`. En modo `html` deshace la conversión de rutas de Git Bash/MSYS (`/mx` llega como `C:/Program Files/Git/mx`) quitando la raíz de `cygpath -m /` | n/a — this tool never walks the tree |
| `scripts/merge-scaffold.mjs`, `scripts/write-storefront-env.mjs` | `scripts/` | §10 Bootstrap | `merge-scaffold` no copia del scaffold `apps/backend/.env`, porque con él `db:migrate` agotó las conexiones (FATAL 53300), ni los scripts demo (§4). `write-storefront-env` siempre compara la llave de `.env.local` con la de `print-key` y la renueva si la base se recreó | n/a — this tool never walks the tree |
| `seed-saint-drip.ts`, `print-publishable-key.ts` | `apps/backend/src/scripts/` | §10, 1, 2, 4, 6, 7, 8, 10, 13 | se ejecutan con `medusa exec` (el entorno viene de `medusa-config.ts`) | n/a |
| Fixtures xlsx / jpg | `apps/backend/src/lib/catalog-import/__fixtures__/`, `e2e/fixtures/` | 3, 4, 5, 15, 16, 17, 18, 19 | — | n/a |
| tsconfig de cada app | storefront: del scaffold · backend: `workspace/apps/backend/tsconfig.json` (el workspace gana sobre el scaffold) | `typecheck` | `tsc` solo recorre `apps/<app>`; `blueprints/` está fuera de ambas raíces. Backend: `"types": ["jest", "node"]`, porque TypeScript 6 cambió el valor por defecto de `types` a `[]`. Además excluye `src/admin`, que usa `import.meta` y que el script `typecheck` revisa con su propio `src/admin/tsconfig.json` | n/a — `blueprints/` no está bajo `apps/backend` ni `apps/storefront` |

**El bundle dentro del proyecto:** `blueprints/` cuelga de la raíz. Jest y Playwright lo excluyen de
forma literal (tabla arriba). `tsc` y `next build` trabajan dentro de cada `apps/<app>` y nunca lo ven.
No hay formateador ni linter que recorra la raíz.

#### Resolution convention matrix

NOT APPLICABLE — this blueprint states no import or link convention. Cada app conserva la resolución
de su scaffold. Las rutas relativas entre archivos de §9 (por ejemplo `../../../lib/catalog-import/photos`
desde el admin) son relativas comunes, válidas en todos los cargadores.

#### Cross-artifact value reconciliation
| Shared value | Single source — the file that decides it | Literal value | Every other place it appears | Compared |
|---|---|---|---|---|
| Puerto del backend | `apps/backend/.env.example` — `MEDUSA_BACKEND_URL` | `9000` | `playwright.config.ts` webServer url · `apps/storefront/.env.example` `NEXT_PUBLIC_MEDUSA_BACKEND_URL` · §9 pasos 1, 2, 6, 7, 8, 12, 14 (`with-server` URL) · §10 env · §12 `PORT=9000` | yes |
| Puerto del storefront | `scripts.dev` del storefront fijado en §10 (`next dev -p 8000`) | `8000` | `playwright.config.ts` baseURL y webServer · `STORE_CORS` / `AUTH_CORS` en `.env.example` y `.env.test` · `STOREFRONT_URL` · §9 paso 14 | yes |
| URL de Postgres | `docker-compose.yml` (usuario, password, base y puerto) | `postgres://medusa:medusa@localhost:5432/saint_drip` | `apps/backend/.env.example` `DATABASE_URL` · `.env.test` (`DB_*` + `DATABASE_URL`) · §9 psql `-U medusa -d saint_drip` · `ci.yml` servicios | yes |
| URL de Redis | `docker-compose.yml` | `redis://localhost:6379` | `.env.example` `REDIS_URL` · `ci.yml` | yes |
| Ids de opciones Envia | `seed-saint-drip.ts` — `SEED.enviaOptions[].id` | `envia-terrestre`, `envia-express` | `getFulfillmentOptions()` paso 8 · tests paso 8 | yes |
| Nombre visible de la opción terrestre | `seed-saint-drip.ts` — `SEED.enviaOptions[0].name` | `Envío terrestre` | `store-check.mjs shipping-option` paso 8 · `getFulfillmentOptions` · E2E paso 18 | yes |
| Ids de proveedores de pago | identifier + id en `medusa-config.ts` | `pp_spei_spei`, `pp_paypal_paypal`, `pp_stripe_stripe` | `store-check` pasos 6 y 7 · `constants.tsx` paso 18 · reconciliación paso 20 · suscriptor paso 13 | yes |
| Proveedor de fulfillment | identifier `envia` + id `envia` | `envia_envia` | `SEED.enviaProviderId` · paso 8 | yes |
| Credenciales del admin | `SEED.adminEmail` + `.env.example` `SEED_ADMIN_PASSWORD` | `admin@saintdrip.local` / `saintdrip-dev` | `.env.test` · paso 4 test · `e2e/helpers/admin.ts` | yes |
| Llave publicable | `SEED.publishableKeyTitle` | `Storefront Saint Drip` | `print-publishable-key.ts` · `write-storefront-env.mjs` (regex `PUBLISHABLE_KEY=`) | yes |
| Nombre de la plantilla descargable | §5 `Content-Disposition` | `plantilla-catalogo-saint-drip.xlsx` | `docs/plantilla-catalogo-saint-drip.xlsx` · E2E paso 5 | yes |
| Columnas del Excel | `columns.ts` `COLUMNAS` (paso 3), idéntico a §5 | `handle,titulo,descripcion,categoria,tipo_opcion,valor_opcion,sku,precio_mxn,existencia,peso_g,largo_cm,ancho_cm,alto_cm,solo_terrestre,estado` | fila 1 de los 3 xlsx del workspace (generados el 2026-11-21) | yes |
| Salida del build del backend | `medusa build` | `apps/backend/.medusa/server` | paso 2 Verify · §12 start command · `.gitignore` `.medusa/` | yes |
| Número de WhatsApp | `apps/storefront/.env.example` | `529531720664` | paso 14 Verify | yes |
| Versión de Node | `.nvmrc` | `24.22.3` | `package.json` engines `>=24.22.3` · §10 · §11 · `ci.yml` | yes |
| Imágenes | `docker-compose.yml` | `postgres:17.12-alpine`, `redis:7.4.12-alpine` | `ci.yml` · §11 · paso 20 Verify | yes |

#### Byte-exact artifact reconciliation
| Byte-exact artifact | Authored by | First diffed at | Blueprint rules that constrain it | Runtime call that produces it, on the §11 pin | Both confirmed |
|---|---|---|---|---|---|
| `$1,448.00` / `$1,299.00` (texto esperado en E2E y en el test de correos) | §9 pasos 12, 15, 18 | 12 | §4 montos en unidades mayores; §5 total = 1299 + 149 (mock de Envia); IVA incluido | `new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(1448)` → `"$1,448.00"`, ejecutado en Node 24 (ICU 78.2) el 2026-11-21 | yes |
| Tripletas de error del fixture `plantilla-con-errores.xlsx` | §19.6 fixture + paso 3 | 3 | §5 tabla de reglas y códigos; filas numeradas desde la 2; se marca la aparición posterior | No es una cadena del runtime: son códigos del propio proyecto; las celdas del fixture se leyeron de vuelta con openpyxl y todas son texto | yes |
| `"1299.00"` en `offers.price` del JSON-LD | paso 15 | 15 | §6: precio con 2 decimales; §4 unidades mayores | `(1299).toFixed(2)` → `"1299.00"` (estable en V8) | yes |

---

## 20. Acceptance Gate, Risks & Decision Log

### 20.1 Global acceptance gate

The project is **done** when every command below exits 0 on a clean checkout, and not before.

```bash
npm run services:up                                                     # expect: exit 0, servicios healthy
npm ci && npm --prefix apps/backend ci && npm --prefix apps/storefront ci   # expect: exit 0
npm --prefix apps/backend run db:migrate                                # expect: exit 0
npm --prefix apps/backend run seed                                      # expect: exit 0
node scripts/write-storefront-env.mjs                                   # expect: exit 0
npm --prefix apps/backend run typecheck                                 # expect: exit 0, zero errors
npm --prefix apps/storefront run typecheck                              # expect: exit 0, zero errors
node apps/storefront/scripts/check-tokens.mjs                           # expect: exit 0
npm --prefix apps/backend run test:unit                                 # expect: exit 0, 0 failed
npm --prefix apps/backend run test:integration:http                     # expect: exit 0, 0 failed
npm --prefix apps/backend run build                                     # expect: exit 0
node scripts/with-server.mjs "npm --prefix apps/backend run dev" http://localhost:9000/health OK 240 -- npm --prefix apps/storefront run build   # expect: exit 0
node scripts/with-server.mjs "npm --prefix apps/backend run dev" http://localhost:9000/health OK 240   # expect: exit 0 — el entry point responde OK
npm run test:e2e                                                        # expect: exit 0, 0 failed — incluye a11y con 0 violaciones
```

Every expectation above is a property, not a tally. Every line exits 0 on a correct build and fails for
the reason it claims.

Plus these manual gates — the post-build launch checklist — each checked once before launch:

- [ ] Every step in §9 has its checkpoint tag in git: `git tag -l 'step-*'` lista los 20, de `step-01-arranque` a `step-20-endurecimiento`.
- [ ] Every file §10's *Files that must be committed* table names is present in a clean checkout. Por ejemplo, `git ls-files --error-unmatch apps/backend/.env.test` sale con 0, una ruta por invocación. Para cada una, `status=0; git check-ignore -q <ruta> || status=$?; test "$status" -eq 1` sale con 0.
- [ ] The ignore file was in place before the first commit: `test "$(git log --diff-filter=A --format=%H -- .gitignore | tail -n 1)" = "$(git rev-list --max-parents=0 HEAD)"` exits 0.
- [ ] Every row of §19.6's *Byte-exact artifact reconciliation* table reads `Both confirmed: yes`.
- [ ] §10's Bootstrap block has been re-run once on an already-bootstrapped tree, **exited 0**, and `apps/backend/package.json` still lists `exceljs` and `stripe` (`grep -q '"exceljs"' apps/backend/package.json`).
- [ ] Every row of §19.6's *Cross-artifact value reconciliation* table reads `Compared: yes`, and the gates above ran from the project root with `blueprints/` present.
- [ ] Every non-goal in §1 is still un-built.
- [ ] Every environment variable in §10 marked "producción" is set in Railway/Vercel and absent from the repo; `NODE_ENV=production` arranca sin el error de `assertProductionEnv`.
- [ ] **Verificaciones en vivo (fuera de los gates porque necesitan cuentas y red):**
  - **Stripe test mode:** compra con tarjeta `4242 4242 4242 4242`. Pedido SPEI con llaves de prueba y luego "Simulate bank transfer" en el dashboard: el webhook `spei_spei` captura y el pedido pasa a pagado.
  - **PayPal sandbox:** compra con una cuenta personal sandbox; el webhook captura.
  - **Envia sandbox:** cotización real a CP 06600 (CDMX) y generación de guía desde el admin.
  - **FacturAPI en modo test:** CFDI individual con RFC de prueba y factura global de un mes con pedidos de prueba. **El contador revisa una de cada tipo antes de pasar a live.**
  - **Resend:** se recibe la confirmación en un buzón real.
- [ ] Aviso de privacidad (LFPDPPP), términos y política de envíos y devoluciones publicados con texto de la marca.
- [ ] Encabezados de seguridad de §14 activos en el storefront: `curl -sI https://saintdrip.mx | grep -i strict-transport-security`.
- [ ] Redirección 308 de `saint-drip-catalogo.vercel.app` a `https://saintdrip.mx`.
- [ ] The critical E2E flows in §13 pass against the production URL with integradores en sandbox.
- [ ] Keyboard-only pass and one screen-reader pass over the primary flow (§15).
- [ ] Error tracking receives a deliberately triggered test error (§16).
- [ ] A rollback has been performed once, on purpose, in staging (§12).

**No warnings are ignored.** A tolerated warning becomes a permanent warning, and the next real one
hides inside it.

### 20.2 Risk register
| Risk | Likelihood | Impact | Early signal | Mitigation |
|---|---|---|---|---|
| `create-medusa-app` cambia su layout o pide algo interactivo pese a los flags. El 2026-11-21 corrió sin pedir nada y generó el layout A (`apps/backend` + `apps/storefront`, que es un monorepo npm con turbo y no se copia a la raíz), pero su instalación se interrumpió por falta de memoria de la máquina de diseño | M | H | Bootstrap se queda esperando entrada o `merge-scaffold.mjs` dice "layout desconocido" | `merge-scaffold.mjs` soporta los dos layouts conocidos y falla con un mensaje claro. Si cuelga, se corre una vez a mano y se continúa (lo anota el builder). Dueño: builder del paso 1 |
| La API de Medusa 2.23 difiere de la usada en el seed o en las firmas de proveedores (opciones de `workflow-engine-redis`, `authService.register`) | M | M | `typecheck` del paso 1 o el arranque del paso 2 falla | El paso 1 compila el seed antes que nada; el paso 2 apunta a la página exacta de la documentación. El cambio se limita al archivo señalado |
| Plugins y SDKs de terceros (PayPal, Envia, FacturAPI) con respuestas distintas a lo documentado | M | M | Las verificaciones en vivo de §20.1 fallan | Cada integración vive tras un `gateway.ts` con modo mock: el arreglo toca un solo archivo y no rompe los gates |
| Cumplimiento fiscal: factura global mal formada o un periodo omitido | L | H | El contador rechaza la prueba de §20.1; el log `factura-global` falta el día 1 | Revisión del contador antes de live; índice único por periodo; job idempotente; alerta en §16 |
| Pedidos SPEI no pagados retienen inventario | M | M | Muchos `spei.vencido` | Vencimiento de 72 h y cancelación automática (paso 20) que libera la reserva |
| Perfumes enviados por aire (mercancía peligrosa) | L | H | Una guía express con un perfume | `solo_terrestre` bloquea express en el cálculo (paso 8) y lo prueba E2E (paso 18) |
| El starter de Next.js cambia rutas o archivos entre la fecha del blueprint y el build | M | M | Un archivo "editado en paso N" no existe en esa ruta | El builder busca el componente equivalente por nombre (`paymentInfoMap`, `order-completed-template`) y lo anota. Si no existe, se detiene y lo reporta |
| La operación propia de Medusa (respaldos, actualizaciones) recae en un equipo pequeño | M | M | Postgres sin respaldo verificado | Respaldos diarios de Railway, una restauración de prueba en el lanzamiento, y actualizar Medusa por minor cada trimestre con este mismo gate |

### 20.3 Decision log
| # | Decision | Rejected alternative | Why | Would reverse if |
|---|---|---|---|---|
| 1 | Medusa v2 open source | Shopify (Basic + pasarela externa) | Gratuito, el equipo es TS, el admin y el modelo de inventario ya existen, y no hay comisión del 2 % por pasarela externa | El equipo deja de poder mantener el backend, o Shopify Payments llega a México con tarifas competitivas |
| 2 | SPEI con proveedor propio sobre transferencias MX de Stripe | Mercado Pago (SPEI + OXXO) | Un solo PSP para tarjeta y SPEI con conciliación automática; el plugin MP para Medusa no está probado en México | Stripe deja de ofrecer transferencias MX o el cliente pide OXXO |
| 3 | Conservar las versiones del starter (Next 16.3.8, Tailwind 3) | Migrar a Tailwind 4 del track TS | El starter ya trae checkout y cuenta integrados con esas versiones; actualizar es un proyecto en sí | El starter oficial migre, o una vulnerabilidad lo exija |
| 4 | npm con `--prefix` por app | pnpm del track TS | El despliegue documentado de Medusa usa npm en `.medusa/server`; evita los problemas de hoisting del admin | Medusa documente pnpm como camino principal de deploy |
| 5 | Sin linter ni formateador como gate en v1 | Biome sobre todo el repo | Cientos de archivos del scaffold fallarían el formato; el valor está en typecheck y tests | El equipo crece a más de 2 personas editando el storefront |
| 6 | Carga masiva solo crea | Crear y actualizar | Actualizar en lote exige conciliación y bloqueo, y con 100 productos editar en el admin basta | Más de 300 SKUs o cambios de precio por temporada |
| 7 | Excel en base64 por JSON + fotos por `/admin/uploads` | ZIP con todo en un multipart | Reutiliza la subida nativa de Medusa, evita multer y deja validar antes de subir las fotos | Cargas de más de 6 MB de Excel o más de 500 fotos por lote |
| 8 | Envia.com como proveedor propio | Tarifas fijas por zona | Cotiza en vivo con el peso y las medidas reales y genera la guía | La marca negocia una tarifa plana con una paquetería |
| 9 | FacturAPI en un módulo propio con factura global automática | Facturar por fuera con el contador | Pedido explícito del cliente; cero ventas sin CFDI | El contador prefiere su propio sistema |
| 10 | Railway (server + worker) + Vercel | Medusa Cloud | Costo menor a este volumen; Medusa Cloud es de pago | El costo de operar supera al de Medusa Cloud |
| 11 | Resend como proveedor propio de notificaciones | SendGrid (proveedor oficial de Medusa) | Plantillas en código y probadas; SDK mínimo; capa gratuita suficiente | Resend deja de cubrir el volumen o el dominio tiene problemas de entrega |
| 12 | Tokens de color fijados aquí (minimal urbano) | Copiar el catálogo actual | El catálogo actual se renderiza en el cliente y no se pudieron leer sus estilos | La marca entrega un manual de identidad |
| 13 | Decision: bumped postgres (imagen) 17.9-alpine→17.12-alpine | Quedarse en 17.9 | Why: registry drift, verified 2026-11-21 (tres parches; misma mayor, el formato de datos es compatible) | Would reverse if: la migración resulta costosa (un parche de 17.x rompe el volumen local o el de CI) |
| 14 | Decision: bumped redis (imagen) 7.4.9-alpine→7.4.12-alpine | Quedarse en 7.4.9 | Why: registry drift, verified 2026-11-21 (tres parches de la línea 7.4) | Would reverse if: la migración resulta costosa (un parche de 7.4 cambia el comportamiento de BullMQ o del event bus) |
| 15 | Decision: hold jest 29 / @types/jest 29 (latest 30.5.2 / 30.0.0) y typescript 6 (latest 7.0.2) | Subir a jest 30 y TS 7 | Why: `@medusajs/test-utils` 2.23.0 se publica con jest 29; TS 7 es la reescritura en Go y no se verificó que Medusa 2.23 lo acepte (verified 2026-11-21) | Would reverse if: Medusa publique el scaffold con jest 30 / TS 7 |
| 16 | Decision: hold Node 24.22.3 (ya existe la LTS 26.13.1) | Node 26 | Why: el runtime track no cambia en un refresh; Medusa 2.23 pide `>=22.22.0` (verified 2026-11-21) | Would reverse if: Medusa recomiende Node 26 o la 24 salga de mantenimiento |
| 17 | Decision: migraciones de API sobre los mismos pins: sin `inApp` en `medusaIntegrationTestRunner` (test-utils 2.23); `types: ["jest","node"]` y `exclude: src/admin` en el tsconfig del backend (TS 6; nuevo `workspace/apps/backend/tsconfig.json`); `typecheck` = `tsc --noEmit && tsc --noEmit -p src/admin/tsconfig.json`; server action `apps/storefront/src/lib/data/invoices.ts` en lugar de `sdk.client.fetch` (js-sdk 2.23: `FetchError` solo lee `message`); Sentry con `dataCollection` en lugar de `sendDefaultPii` (@sentry/node 11) | Texto original del blueprint | Why: las APIs publicadas de las versiones fijadas no coinciden con el texto; se reprodujeron durante el build: `TS2353` por `inApp`; `Cannot find name 'jest'` por el `types: []` de TS 6; `TS1470` por `import.meta` en `src/admin` bajo CommonJS; un 409 mostrado como "Conflict" porque `FetchError` solo lee `message`; y `TS2353` por `sendDefaultPii`. Se confirmaron en los artefactos de unpkg el 2026-11-21 | Would reverse if: se cambian los pins a versiones donde la API original existe |
| 18 | Decision: incorporar al bundle las 14 desviaciones de contenido del primer build: Bootstrap sin el `.env` ni los scripts demo del scaffold; seed con MXN IVA incluido y filtros válidos en runtime; `write-storefront-env` que renueva la llave; `store-check` compatible con MSYS; Envia busca la metadata `solo_terrestre` por `product_id`; correo "factura emitida" en el paso 13; JSON-LD único en el PDP; caché de catálogo de 60 s; helper E2E que libera reservas; proxy del PDF; mock de FacturAPI con id único; archivos de agente de `next dev` | Dejarlas solo como notas del build | Why: cada una se reprodujo en el build del 2026-11-21 (el primer `db:migrate`, el typecheck, los E2E del checkout (paso 18, antes 16), el total de $1,655.84 en lugar de $1,448.00, las variantes borradas servidas por la caché). Sin ellas, una reconstrucción desde cero cae en los mismos defectos | Would reverse if: una versión nueva del scaffold o de Medusa corrige de origen alguno de estos comportamientos |

### 20.4 What to build next
1. **Cupones y promociones de temporada**, cuando llegue la primera campaña con código.
2. **Actualización de precios y existencias por Excel**, cuando haya más de 300 SKUs o cambios por temporada.
3. **Región USD con envío internacional por PayPal**, cuando más del 5 % del tráfico venga del extranjero.
4. **OXXO y Mercado Pago (meses sin intereses)** como proveedores nuevos con la skill `nuevo-proveedor-pago`, cuando el abandono en el pago lo justifique.
5. **Recuperación de contraseña en la UI y devoluciones (RMA)**, cuando haya más de 5 devoluciones al mes.

---

*End of blueprint. Build order is §9. Stop when §20.1 is green.*
