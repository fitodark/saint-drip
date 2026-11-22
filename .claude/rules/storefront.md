---
paths:
  - "apps/storefront/src/**"
  - "apps/storefront/tailwind.config.js"
---

# Storefront (Next.js Starter de Medusa)

- Colores solo con las clases de tokens (`bg-background`, `text-fg`, `text-fg-muted`, `border-border-strong`, `bg-accent`…). Un hex fuera de `src/styles/globals.css` rompe `node apps/storefront/scripts/check-tokens.mjs`.
- Radio 0 en todo excepto el botón de WhatsApp. Títulos en `font-display` en mayúsculas con tracking ancho; cuerpo en `font-sans` (Inter).
- Componentes de servidor por defecto; `"use client"` solo para interacción (selector de variante, botones de pago, formularios).
- Datos solo por los helpers de `src/lib/data/*` (`@medusajs/js-sdk`), salvo las rutas propias (`/store/invoices*`), que usan `fetch` en la server action `apps/storefront/src/lib/data/invoices.ts` porque `FetchError` de `@medusajs/js-sdk` descarta `{ codigo, mensaje }` (§20.3 #17). Nunca un `fetch` directo al backend desde el cliente con precios.
- Carrito, checkout, cuenta y confirmación nunca se cachean.
- Textos de UI en español de México. Montos con `Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" })`.
- Accesibilidad: cada input con `<label>`, errores en texto con `role="alert"`, objetivos ≥ 24×24 px (tallas 44×44), foco visible de 2px, y respetar `prefers-reduced-motion`.
- El precio y la disponibilidad del PDP deben estar en el HTML del servidor (prueba sin JS en `e2e/catalogo.spec.ts`).
