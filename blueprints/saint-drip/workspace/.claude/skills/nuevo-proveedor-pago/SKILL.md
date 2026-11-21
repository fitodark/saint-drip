---
name: nuevo-proveedor-pago
description: Agrega un método de pago nuevo a Saint Drip (Mercado Pago, OXXO, Clip, etc.) como proveedor de Medusa con gateway inyectable y modo mock. Úsala cuando pidan "agregar un método de pago", "aceptar OXXO", "integrar Mercado Pago" o "nuevo proveedor de pago".
---

# Nuevo proveedor de pago

## When to use
- Piden un método de pago adicional a tarjeta (Stripe), SPEI o PayPal.
- Hay que reemplazar el proveedor de uno de los métodos existentes.

## Steps
1. Crea `apps/backend/src/modules/<x>-payment/gateway.ts` con una interfaz mínima (crear, consultar estado, capturar, reembolsar, verificar webhook), una implementación real con el SDK oficial y una implementación `mock` determinista.
2. Crea `service.ts`: `class XPaymentService extends AbstractPaymentProvider` con `static identifier = "<x>"`. El gateway llega por un tercer parámetro opcional del constructor. Los montos de Medusa están en unidades mayores; convierte solo dentro del gateway si el PSP pide centavos.
3. Crea `index.ts`: `export default ModuleProvider(Modules.PAYMENT, { services: [XPaymentService] })`.
4. Registra en `apps/backend/medusa-config.ts`, dentro de `payment.options.providers`, la entrada `{ resolve: "./src/modules/<x>-payment", id: "<x>", options: { mode: process.env.<X>_MODE ?? "mock", … } }`. Agrega sus variables a `apps/backend/.env.example`, a `PRODUCTION_REQUIRED` en `src/lib/env.ts` y a la tabla del blueprint §10.
5. Escribe `__tests__/<x>.unit.spec.ts` con al menos: initiate (monto correcto), autorización feliz, pendiente, webhook con firma inválida → `failed` y webhook de pago completado → `captured`.
6. Corre el seed para ligar `pp_<x>_<x>` a la región México.
7. Storefront: agrega `pp_<x>_<x>` al `paymentInfoMap` de `apps/storefront/src/lib/constants.tsx` y su rama en `payment-button/index.tsx`.

## Verify
```bash
npm --prefix apps/backend run test:unit -- src/modules/<x>-payment     # expect: exit 0
npm --prefix apps/backend run typecheck                                  # expect: exit 0
npm --prefix apps/backend run seed                                       # expect: exit 0
node scripts/with-server.mjs "npm --prefix apps/backend run dev" http://localhost:9000/health OK 240 -- node scripts/store-check.mjs payment-provider pp_<x>_<x>   # expect: exit 0
```

## Do not
- No crees el pedido desde la redirección del navegador: la captura definitiva llega por webhook firmado.
- No instales un plugin de la comunidad sin revisar que sus peers acepten `@medusajs/*` 2.23.0.
- No guardes datos de tarjeta ni cuentas bancarias del cliente.
