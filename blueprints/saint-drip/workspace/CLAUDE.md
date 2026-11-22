# Saint Drip — tienda en línea

Tienda de ropa, tenis, joyería, perfumes y accesorios para México: Medusa v2 (backend + admin) y el
Next.js Starter de Medusa (storefront). Pagos con tarjeta, SPEI y PayPal; envíos con Envia.com; CFDI con FacturAPI.

<!-- Generado por The Architect (blueprints/saint-drip). Plan de construcción: blueprints/saint-drip/tasks.json + epics/. -->

## Commands

Todo se ejecuta desde la **raíz del repo** (bash; en Windows, Git Bash). Antes de cualquier gate: `npm run services:up`.

| Task | Command |
|---|---|
| Servicios (Postgres + Redis) | `npm run services:up` · `npm run services:down` |
| Backend dev (API + admin en /app) | `npm --prefix apps/backend run dev` — http://localhost:9000 |
| Storefront dev | `npm --prefix apps/storefront run dev` — http://localhost:8000/mx |
| Typecheck | `npm --prefix apps/backend run typecheck` · `npm --prefix apps/storefront run typecheck` |
| Build | `npm --prefix apps/backend run build` · storefront: `node scripts/with-server.mjs "npm --prefix apps/backend run dev" http://localhost:9000/health OK 240 -- npm --prefix apps/storefront run build` |
| Unit tests | `npm --prefix apps/backend run test:unit` · un directorio: `npm --prefix apps/backend run test:unit -- src/lib/catalog-import` |
| Integration (DB temporal) | `npm --prefix apps/backend run test:integration:http` · uno: `… -- integration-tests/http/health.spec.ts` |
| E2E (levanta backend + storefront) | `npm run test:e2e` · uno: `npm run test:e2e -- e2e/checkout-spei.spec.ts` |
| Migraciones | generar: `npm --prefix apps/backend run db:generate -- <módulo>` · aplicar: `npm --prefix apps/backend run db:migrate` |
| Seed (idempotente) | `npm --prefix apps/backend run seed` |
| Tokens de diseño | `node apps/storefront/scripts/check-tokens.mjs` |
| SQL rápido | `docker compose exec -T postgres psql -U medusa -d saint_drip -tAc "<sql>"` |

**Gate:** `typecheck` de ambas apps + los tests del paso actual + los de los pasos anteriores, en verde,
antes de marcar una tarea como `done`.
Runtime en `.nvmrc` (Node 24.22.3). Versiones en los lockfiles; nunca adivines una.

## Stack

Medusa 2.23.0 (Postgres 17, Redis 7) · Next.js Starter de Medusa (Tailwind) · Stripe · SPEI propio ·
PayPal propio · Envia.com propio · FacturAPI · Resend · Cloudflare R2 · Railway (server + worker) · Vercel.

## Architecture

**Request path (compra).** Navegador → `apps/storefront/src/app/[countryCode]/(main)/products/[handle]/page.tsx`
(servidor) → `src/lib/data/*.ts` (`@medusajs/js-sdk`, header publishable key) → Medusa `/store/*` →
módulos (product, pricing, inventory). Checkout: server actions del starter → `/store/carts/*` →
`/store/payment-collections` → proveedor (`pp_spei_spei` | `pp_paypal_paypal` | `pp_stripe_stripe`).
Los webhooks llegan a `/hooks/payment/{provider}` y Medusa captura el pago.

**Carga masiva.** Admin `/app/carga-masiva` (`apps/backend/src/admin/routes/carga-masiva/page.tsx`) →
`POST /admin/catalog-import/validar` → `src/lib/catalog-import/*` (puro) → fotos por `POST /admin/uploads`
→ `POST /admin/catalog-import/importar` → `src/workflows/import-catalog.ts`.

**Boundaries.**

| Layer | May import from | Must never |
|---|---|---|
| `apps/backend/src/lib/**` | solo tipos de `@medusajs/*`, `exceljs` | Importar módulos, contenedores o servicios de Medusa |
| `apps/backend/src/modules/<x>/gateway.ts` | SDK del tercero | Ser llamado fuera de su `service.ts` |
| `apps/backend/src/api/**` | workflows, `query.graph`, servicios para leer | Escribir catálogo sin workflow |
| `apps/backend/src/admin/**` | `@medusajs/ui`, `@medusajs/admin-sdk`, `src/lib/catalog-import/photos.ts` | Importar código de Node (`fs`, `exceljs`) |
| `apps/storefront/src/**` | `@medusajs/js-sdk` vía `src/lib/data` (excepción: `/store/invoices*` con `fetch` en `src/lib/data/invoices.ts`, §20.3 #17) | Leer la base de datos o usar hex fuera de `src/styles/globals.css` |

**Where things live.**

| Concern | Single source of truth |
|---|---|
| Configuración de Medusa y proveedores | `apps/backend/medusa-config.ts` |
| Config de la tienda (región, almacén, categorías, opciones de envío, admin) | `apps/backend/src/scripts/seed-saint-drip.ts` (`SEED`) |
| Contrato del Excel | `apps/backend/src/lib/catalog-import/columns.ts` (`COLUMNAS`) + blueprint §5 |
| Variables de producción | `apps/backend/src/lib/env.ts` |
| Tokens de diseño | `apps/storefront/src/styles/globals.css` + `tailwind.config.js` |
| Modelo CFDI | `apps/backend/src/modules/facturapi/models/cfdi-invoice.ts` |

## Code rules

- Montos: unidades mayores (`1299` = $1,299.00 MXN). Centavos **solo** al llamar a Stripe: `Math.round(Number(monto) * 100)`. Precios con IVA incluido.
- Cada integración externa tiene un modo `mock` determinista. Los tests y E2E nunca salen a la red.
- Todo proveedor recibe su gateway por constructor: `new XService(container, options, { gateway })` en tests.
- Escrituras de dominio solo por workflows; lecturas con `query.graph`.
- zod se importa de `@medusajs/framework/zod`. Nunca `zod` directo.
- Los textos de la UI van en español de México. Los identificadores de código, en inglés o en el español del dominio (`validarCatalogo`), pero sin mezclar dentro de un mismo archivo.
- Las migraciones se generan con `db:generate`. Nunca escribas a mano el nombre de un archivo de migración.
- Tests unitarios: `__tests__/*.unit.spec.ts`. Integración: `integration-tests/http/*.spec.ts`. Cero `.skip` y cero `.only`.
- Máximo 300 líneas por archivo de componente o servicio; si crece, extrae funciones puras a `src/lib`.

## Testing

- Unit (Jest + swc): lógica pura y proveedores con dobles. Integración: `medusaIntegrationTestRunner` crea una base temporal por suite (`apps/backend/.env.test`).
- E2E (Playwright): `playwright.config.ts` levanta ambos servidores. Usa `e2e/helpers/admin.ts` para preparar datos (borrar y reimportar el fixture).
- Accesibilidad: `e2e/a11y.spec.ts` con axe (WCAG 2.2 AA) debe reportar 0 violaciones.

## Never

- Leer `apps/backend/.env` o `apps/storefront/.env.local` (secretos), hacer `git push` o correr `npm run services:reset` sin pedirlo.
- Aceptar un precio o total del cliente. El servidor recalcula todo.
- Guardar tarjetas o datos bancarios, ni registrar bodies de webhooks, llaves o RFC completos.
- Ofrecer express para un carrito con `metadata.solo_terrestre`.
- Construir algo de la tabla de Non-Goals del blueprint §1: cupones, USD, devoluciones automáticas, actualizar por Excel, otros métodos de pago.
- Instalar Drizzle, Prisma, otro gestor de paquetes u otro mecanismo de estilos.

## Workflow

1. Lee `blueprints/saint-drip/tasks.json`. Toma la primera tarea `pending` cuyas dependencias estén `done` y márcala `in_progress`.
2. Abre su épica en `blueprints/saint-drip/epics/` y ejecútala completa (Do → Verify → Checkpoint).
3. Si un Verify falla y no ves la causa, `git reset --hard <tag anterior>` y reintenta. Nunca depures hacia adelante.
4. Marca la tarea `done` solo cuando todos sus comandos `verify` salgan con 0. Nunca te saltes una tarea.

## Rotación de secretos

`JWT_SECRET`, `COOKIE_SECRET` y las llaves de Stripe, PayPal, Envia, FacturAPI y Resend se rotan cada 12 meses o
cuando alguien deja el equipo. Primero se crea la llave nueva, después se actualiza Railway/Vercel, se
redespliega y al final se revoca la anterior.
