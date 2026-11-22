---
paths:
  - "apps/backend/src/**"
  - "apps/backend/medusa-config.ts"
  - "apps/backend/integration-tests/**"
---

# Backend (Medusa 2.23.0)

- Escrituras de dominio por workflows (`createWorkflow` + `runAsStep` de `@medusajs/medusa/core-flows`); las rutas no llaman `create*`/`update*` de módulos directo.
- Lecturas con `container.resolve(ContainerRegistrationKeys.QUERY).graph({ entity, fields, filters })`.
- `src/lib/**` es puro: cero imports de valores de `@medusajs/*` (solo `import type`). Si necesitas el contenedor, la función va en `src/workflows` o `src/api`.
- Cada proveedor externo tiene `gateway.ts` con una implementación real y una `mock`. `service.ts` la recibe por constructor y elige con `options.mode`/`environment`.
- Validación de bodies con zod de `@medusajs/framework/zod`; los errores propios responden `{ codigo, mensaje }`.
- Rutas store propias exigen `authenticate("customer", ["session","bearer"])` en `src/api/middlewares.ts`.
- `medusa-config.ts` no lee una variable integradora como obligatoria fuera de producción; las obligatorias de producción se listan en `src/lib/env.ts`.
- Nuevos tests: unit en `__tests__/*.unit.spec.ts`, HTTP en `integration-tests/http/*.spec.ts` con `medusaIntegrationTestRunner({ env: {} })` (`@medusajs/test-utils` 2.23 no tiene la opción `inApp`).
- Jobs: `export const config = { name, schedule }` con cron en UTC (Ciudad de México = UTC−6 todo el año).
