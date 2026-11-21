# AGENTS.md — Saint Drip

Tienda en línea para México: Medusa v2 (`apps/backend`, API + admin) y el Next.js Starter de Medusa
(`apps/storefront`). **La fuente de verdad es `CLAUDE.md`**; este archivo resume lo esencial para
herramientas que no lo leen.

## Commands (desde la raíz, bash)

- Servicios: `npm run services:up`
- Backend: `npm --prefix apps/backend run dev` (http://localhost:9000) · `run typecheck` · `run test:unit` · `run test:integration:http` · `run build`
- Storefront: `npm --prefix apps/storefront run dev` (http://localhost:8000/mx) · `run typecheck`
- E2E: `npm run test:e2e`
- Migraciones: `npm --prefix apps/backend run db:generate -- <módulo>` y luego `npm --prefix apps/backend run db:migrate`
- Seed idempotente: `npm --prefix apps/backend run seed`

## The three rules that matter most

1. Montos en unidades mayores e IVA incluido; centavos solo al llamar a Stripe. El servidor recalcula todo precio.
2. Toda integración externa (Stripe SPEI, PayPal, Envia, FacturAPI, Resend) vive detrás de un `gateway.ts` con modo `mock`. Los tests nunca salen a la red.
3. Se construye en el orden de `blueprints/saint-drip/tasks.json`. Cada tarea termina con sus comandos `verify` en 0 y un tag `step-NN-slug`. Nada de la lista de Non-Goals del blueprint §1.
