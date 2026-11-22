# Épica 01 — Fundación y catálogo

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

E1-T1, E1-T2, E1-T3, E1-T4, E1-T5 — pasos 1 a 5 del blueprint.


---

## E1-T1 — Paso 1: Arranque verificable del backend

**Depende de:** — · **Checkpoint:** `step-01-arranque`

**Files**
- `apps/backend/integration-tests/http/health.spec.ts`

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

**Acceptance**
1. WHEN Bootstrap ha terminado THE SYSTEM SHALL tener `apps/backend/medusa-config.ts`, `apps/backend/src/scripts/seed-saint-drip.ts` y `apps/storefront/package.json` en disco.
2. WHEN `npm --prefix apps/backend run typecheck` corre THE SYSTEM SHALL salir con 0, incluido el seed emitido por el workspace.
3. WHEN `npm --prefix apps/backend run test:integration:http -- integration-tests/http/health.spec.ts` corre THE SYSTEM SHALL pasar con `GET /health` → 200 sobre una base temporal.
4. WHEN el seed corre por segunda vez THE SYSTEM SHALL salir con 0 y dejar exactamente 1 región llamada "México".
5. WHEN `npm --prefix apps/backend run dev` arranca THE SYSTEM SHALL responder `OK` en `http://localhost:9000/health` en menos de 240 s.

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

## E1-T2 — Paso 2: Configuración de Medusa y validación de entorno

**Depende de:** E1-T1 · **Checkpoint:** `step-02-config`

**Files**
- `apps/backend/medusa-config.ts`
- `apps/backend/src/lib/env.ts`
- `apps/backend/src/lib/__tests__/env.unit.spec.ts`
- `apps/backend/integration-tests/http/store-setup.spec.ts`

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

**Acceptance**
1. WHEN `missingProductionEnv({})` se evalúa THE SYSTEM SHALL incluir `STRIPE_API_KEY` y `SPEI_MODE`, y con el entorno completo devolver `[]` (test unitario).
2. WHEN el seed corre dos veces sobre una base temporal THE SYSTEM SHALL dejar exactamente 1 región "México" en `mxn`, las 5 categorías, 1 almacén, 1 admin y 1 llave publicable.
3. WHEN `npm --prefix apps/backend run build` corre THE SYSTEM SHALL salir con 0 y producir `apps/backend/.medusa/server`.
4. WHEN el dev server arranca con `REDIS_URL` definido THE SYSTEM SHALL responder `OK` en `/health` (los módulos Redis cargan).
5. WHEN `NODE_ENV` no es `production` THE SYSTEM SHALL arrancar sin las variables de producción (el gate del paso 1 sigue verde).

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

## E1-T3 — Paso 3: Librería de carga masiva (Excel + fotos)

**Depende de:** E1-T1 · **Checkpoint:** `step-03-carga-lib`

**Files**
- `apps/backend/src/lib/catalog-import/columns.ts`
- `apps/backend/src/lib/catalog-import/parse.ts`
- `apps/backend/src/lib/catalog-import/validate.ts`
- `apps/backend/src/lib/catalog-import/photos.ts`
- `apps/backend/src/lib/catalog-import/__tests__/catalog-import.unit.spec.ts`

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

**Acceptance**
1. WHEN `validarCatalogo` procesa `plantilla-valida.xlsx` THE SYSTEM SHALL devolver cero errores y 3 productos con 8 variantes.
2. WHEN `validarCatalogo` procesa `plantilla-con-errores.xlsx` THE SYSTEM SHALL devolver exactamente las 6 tripletas `(fila, columna, codigo)` listadas, en ese orden.
3. WHEN un handle ya existe en la tienda THE SYSTEM SHALL marcar `E_HANDLE_EXISTE` en cada fila de ese handle.
4. WHEN `emparejarFotos` recibe nombres desordenados y una foto ajena THE SYSTEM SHALL ordenar por `n`, listar el handle sin fotos en `faltantes` y la ajena en `sinUsar`.
5. WHEN `buildPlantilla()` se lee de vuelta con `leerExcel` THE SYSTEM SHALL tener encabezados idénticos a `COLUMNAS` y cero filas.

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

## E1-T4 — Paso 4: API y workflow de importación

**Depende de:** E1-T2, E1-T3 · **Checkpoint:** `step-04-carga-api`

**Files**
- `apps/backend/src/workflows/import-catalog.ts`
- `apps/backend/src/api/admin/catalog-import/[accion]/route.ts`
- `apps/backend/src/api/middlewares.ts`
- `apps/backend/integration-tests/http/catalog-import.spec.ts`

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

**Acceptance**
1. WHEN un admin hace `POST /admin/catalog-import/validar` con el fixture válido y sus 4 fotos THE SYSTEM SHALL responder 200 `{ valido: true, productos: 3, variantes: 8, fotos_faltantes: [] }` sin escribir filas.
2. WHEN el admin hace `POST /admin/catalog-import/importar` con ese cuerpo THE SYSTEM SHALL responder 200 `{ creados: 3 }` y crear la variante `SD-HOOD-NEG-M` con existencia 8 y precio 1299 MXN.
3. WHEN se repite el mismo `importar` THE SYSTEM SHALL responder 422 con `E_HANDLE_EXISTE` y dejar exactamente 3 productos con esos handles.
4. WHEN se pide `GET /admin/catalog-import/plantilla` THE SYSTEM SHALL responder 200 con `Content-Disposition: attachment; filename="plantilla-catalogo-saint-drip.xlsx"`.
5. WHEN se llama `validar` sin sesión de admin THE SYSTEM SHALL responder 401.

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

## E1-T5 — Paso 5: Página "Carga masiva" en el admin

**Depende de:** E1-T4 · **Checkpoint:** `step-05-carga-admin`

**Files**
- `apps/backend/src/admin/lib/sdk.ts`
- `apps/backend/src/admin/routes/carga-masiva/page.tsx`
- `e2e/helpers/admin.ts`
- `e2e/carga-masiva.spec.ts`

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
  - `borrarProductosFixture(request)`: con el token, `GET /admin/products?handle=<h>` y `DELETE /admin/products/:id` para cada handle del fixture.
  - `importarFixture(request)`: sube las 4 fotos de `e2e/fixtures/fotos/` por `POST /admin/uploads` (multipart `files`) y llama `POST /admin/catalog-import/importar` con `e2e/fixtures/plantilla-valida.xlsx`. Lo reutilizan los pasos 15–17.
- `e2e/carga-masiva.spec.ts`:
  - `beforeAll` llama `borrarProductosFixture`. Después: iniciar sesión, ir a `http://localhost:9000/app/carga-masiva` y comprobar que la descarga de `Descargar plantilla` se llama `plantilla-catalogo-saint-drip.xlsx`.
  - **Archivo con errores:** cargar `apps/backend/src/lib/catalog-import/__fixtures__/plantilla-con-errores.xlsx`, pulsar `Validar` y esperar 6 filas en la tabla de errores.
  - **Archivo válido:** cargar `e2e/fixtures/plantilla-valida.xlsx` más las 4 fotos, `Validar`, esperar el texto `3 productos · 8 variantes`, pulsar `Importar` y esperar `3 productos creados`.
  - **Comprobación final:** `GET http://localhost:9000/admin/products?handle=sd-hoodie-oversize-negro` devuelve 1 producto con 2 imágenes.

**Acceptance**
1. WHEN `npm --prefix apps/backend run build` corre THE SYSTEM SHALL compilar el admin con la ruta `carga-masiva` y salir con 0.
2. WHEN el admin pulsa `Descargar plantilla` THE SYSTEM SHALL descargar `plantilla-catalogo-saint-drip.xlsx`.
3. WHEN se valida `plantilla-con-errores.xlsx` THE SYSTEM SHALL mostrar 6 filas en la tabla Fila/Columna/Error y mantener `Importar` deshabilitado.
4. WHEN se valida e importa el fixture válido con sus 4 fotos THE SYSTEM SHALL mostrar `3 productos · 8 variantes` y luego `3 productos creados`, y el hoodie SHALL tener 2 imágenes.

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

## Epic acceptance

La épica está completa cuando las tareas E1-T1, E1-T2, E1-T3, E1-T4, E1-T5 están `done` en `tasks.json` y `git tag -l 'step-*'` lista los tags de los pasos 1 a 5.
