---
name: carga-masiva
description: Cambia la plantilla Excel de carga masiva del catálogo de Saint Drip (columnas, reglas, tipos de opción, categorías). Úsala cuando pidan "agregar una columna al Excel", "nuevo tipo de talla", "nueva categoría en la carga" o "cambiar la plantilla".
---

# Carga masiva (Excel + fotos)

## When to use
- Cambia el contrato del Excel: una columna, una regla de validación, un `tipo_opcion` o una categoría.

## Steps
1. Edita `apps/backend/src/lib/catalog-import/columns.ts` (`COLUMNAS`, listas permitidas, `ETIQUETA_OPCION`) y `buildPlantilla()`.
2. Ajusta la regla y su código de error en `validate.ts`, con el mismo nombre de código en la tabla del blueprint §5.
3. Si es una categoría nueva, agrégala a `SEED.categories` en `apps/backend/src/scripts/seed-saint-drip.ts` y corre el seed.
4. Regenera los tres xlsx (`__fixtures__/plantilla-valida.xlsx`, `__fixtures__/plantilla-con-errores.xlsx`, `docs/plantilla-catalogo-saint-drip.xlsx`) para que su fila 1 sea igual a `COLUMNAS`. `e2e/fixtures/plantilla-valida.xlsx` es una copia del fixture válido.
5. Actualiza los casos de `__tests__/catalog-import.unit.spec.ts`. Si cambia la cantidad de errores del fixture con errores, actualiza la lista exacta de tripletas.
6. Si la columna se guarda en el producto, mapea el campo en `src/workflows/import-catalog.ts` y afírmalo en `integration-tests/http/catalog-import.spec.ts`.

## Verify
```bash
npm --prefix apps/backend run test:unit -- src/lib/catalog-import        # expect: exit 0
npm --prefix apps/backend run test:integration:http -- integration-tests/http/catalog-import.spec.ts   # expect: exit 0
npm run test:e2e -- e2e/carga-masiva.spec.ts                              # expect: exit 0
```

## Do not
- No conviertas la carga en actualización de productos existentes: es un Non-Goal de v1.
- No leas celdas como número: todo se normaliza a texto (blueprint §5).
- No dejes la plantilla descargable y los fixtures con encabezados distintos.
