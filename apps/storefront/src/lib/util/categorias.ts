import { HttpTypes } from "@medusajs/types"

// Orden de las categorías principales en el menú, el pie y el inicio (handles del seed, blueprint §6).
export const ORDEN_CATEGORIAS = ["ropa", "tenis", "joyeria", "perfumes", "accesorios"]

export const categoriasEnOrden = (
  categorias: HttpTypes.StoreProductCategory[]
): HttpTypes.StoreProductCategory[] =>
  ORDEN_CATEGORIAS.map((handle) => categorias.find((c) => c.handle === handle)).filter(
    (c): c is HttpTypes.StoreProductCategory => Boolean(c)
  )
