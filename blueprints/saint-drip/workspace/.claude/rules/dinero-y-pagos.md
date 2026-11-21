---
paths:
  - "apps/backend/src/modules/*-payment/**"
  - "apps/backend/src/modules/envia-fulfillment/**"
  - "apps/backend/src/lib/cfdi/**"
  - "apps/backend/src/modules/facturapi/**"
  - "apps/storefront/src/modules/checkout/**"
---

# Dinero, pagos, envíos y facturas

- Medusa guarda montos en unidades mayores (`1448` = $1,448.00). Stripe recibe centavos: `Math.round(Number(monto) * 100)`. PayPal recibe un string con 2 decimales: `Number(monto).toFixed(2)`.
- Todos los precios incluyen IVA 16 % (región México `is_tax_inclusive`). Envia devuelve `is_calculated_price_tax_inclusive: true`.
- El cliente nunca envía un monto: el servidor lo toma del carrito o del pedido.
- Webhooks: verifica la firma antes de leer el body (Stripe `constructEvent`; PayPal `verify-webhook-signature`). Los eventos no manejados devuelven `not_supported` (200), nunca un 5xx.
- SPEI: `authorizePayment` = instrucciones emitidas; solo el webhook `payment_intent.succeeded` captura. Los reembolsos SPEI son manuales en v1.
- `metadata.solo_terrestre === true` en cualquier línea bloquea `envia-express` con el mensaje exacto "Este pedido contiene productos que solo pueden enviarse por tierra".
- CFDI: un pedido tiene como máximo una factura individual; la global es una por periodo `YYYY-MM` (índices únicos en `cfdi_invoice`). Los periodos se calculan en America/Mexico_City.
- Nunca registres el RFC completo, llaves ni bodies de webhooks en logs.
