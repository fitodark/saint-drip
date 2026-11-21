# Desviaciones respecto al blueprint

Registro de los cambios hechos al construir que se apartan de `blueprints/saint-drip/`, porque el
blueprint no correspondía al scaffold real de `create-medusa-app` 2.23.0. Cada entrada la autorizó el
usuario. El bundle original (`blueprint.md`, `epics/`, `workspace/`) **no se modificó**. Todavía hay
que corregirlo con `/architect-refresh` o con una pasada nueva de `/architect`.

| # | Fecha | Paso | Defecto del blueprint | Arreglo aplicado | Pendiente en el blueprint |
|---|---|---|---|---|---|
| D1 | 2026-11-21 | Bootstrap §10, sub-paso 6 | `create-medusa-app` ya genera `apps/backend/.env`, así que `[ -f .env ] \|\| cp .env.example .env` lo conserva. Con ese `.env`, `db:migrate` falló con `FATAL 53300 too many clients already` | Se reemplazó `apps/backend/.env` por `.env.example` y se reintentó `db:migrate`, que salió con 0 | Hacer que el sub-paso 6 sobrescriba el `.env` del scaffold, o que `merge-scaffold.mjs` lo omita |
| D2 | 2026-11-21 | Paso 1 (y 2, 4, 10, 18 y `.claude/rules/backend-medusa.md`) | `medusaIntegrationTestRunner({ inApp: true, … })`: la opción `inApp` no existe en `@medusajs/test-utils` 2.23.0, ni en los tipos ni en el JS | Se quitó `inApp: true` de `integration-tests/http/health.spec.ts` | Quitar `inApp` de todos los specs y reglas del blueprint |
| D3 | 2026-11-21 | Paso 1 (`typecheck`) | TypeScript 6.0.3 del scaffold no incluye `@types/jest` sin configurarlo y es estricto; `src/scripts/seed-demo-products.ts` del propio scaffold no compila | En `apps/backend/tsconfig.json`: `"types": ["jest", "node"]` y `src/scripts/seed-demo-products.ts` en `exclude` (el script demo no se usa: el seed es `seed-saint-drip.ts`) | Documentar el ajuste de tsconfig en §19.6 |
| D4 | 2026-11-21 | Paso 1 (`typecheck`) — `seed-saint-drip.ts` del workspace | Línea 188: `p` es `any` implícito. Línea 195: `listShippingOptions({ provider_id })`, pero `provider_id` no está en `FilterableShippingOptionForContextProps` | Se tipó `p: { id?: string } \| null`; la lista se filtra por `fulfillment_set_id` y luego por `e.provider_id` en memoria. Sin cambio de comportamiento | Aplicar el mismo cambio en `workspace/apps/backend/src/scripts/seed-saint-drip.ts` |

## Observación abierta (sin arreglo aplicado)

- **Datos demo del scaffold.** `db:migrate` corre `src/migration-scripts/initial-data-seed.ts` del
  scaffold, que crea la región "Europe", 4 productos demo, "Default Sales Channel" y "European
  Warehouse". El blueprint (§4) supone cero productos y un solo almacén. No bloquea el paso 1; puede
  afectar los pasos 4, 15 y 16. Hay que decidir si se borran esos datos y esos migration-scripts.
