---
name: nueva-migracion
description: Agrega o cambia un modelo de datos propio en el backend de Saint Drip (por ejemplo cfdi_invoice) con el DML de Medusa y su migración generada. Úsala cuando pidan "agregar un campo", "nueva tabla", "nuevo modelo" o "cambiar el esquema".
---

# Nueva migración

## When to use
- Cambia un modelo de `apps/backend/src/modules/<módulo>/models/*.ts`, o se crea un módulo con datos.

## Steps
1. Edita o crea el modelo con `model.define(...)` de `@medusajs/framework/utils`. Las columnas nuevas son `nullable()` o llevan `default(...)` (expand-then-contract).
2. Genera la migración con `npm --prefix apps/backend run db:generate -- <módulo>`. La herramienta nombra el archivo; no lo renombres.
3. Aplícala con `npm --prefix apps/backend run db:migrate`.
4. Comprueba la tabla o la columna con psql.
5. Actualiza la tabla del blueprint §4 si cambió el contrato.

## Verify
```bash
npm --prefix apps/backend run db:migrate                                  # expect: exit 0
test "$(docker compose exec -T postgres psql -U medusa -d saint_drip -tAc "select to_regclass('public.<tabla>') is not null")" = t   # expect: exit 0
npm --prefix apps/backend run typecheck                                   # expect: exit 0
```

## Do not
- No edites tablas desde la consola de Railway ni con SQL manual: Medusa es el único dueño del esquema.
- No elimines una columna en el mismo deploy que deja de usarla.
- No instales Drizzle ni Prisma.
