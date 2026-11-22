// Carriles de productos por categoría en la página de inicio (blueprint paso 15). Componente de servidor.
import { listCategories } from "@lib/data/categories"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductPreview from "@modules/products/components/product-preview"

const ORDEN = ["ropa", "tenis", "joyeria", "perfumes", "accesorios"]

export default async function CategoryRails({ countryCode }: { countryCode: string }) {
  const [region, categorias] = await Promise.all([getRegion(countryCode), listCategories()])
  if (!region) return null

  const elegidas = ORDEN.map((handle) => categorias.find((c) => c.handle === handle)).filter(
    (c): c is NonNullable<typeof c> => Boolean(c)
  )

  const carriles = await Promise.all(
    elegidas.map(async (categoria) => {
      const {
        response: { products },
      } = await listProducts({ countryCode, queryParams: { category_id: [categoria.id], limit: 8 } })
      return { categoria, products }
    })
  )

  return (
    <div className="flex flex-col gap-y-16 py-12">
      {carriles
        .filter(({ products }) => products.length > 0)
        .map(({ categoria, products }) => (
          <section key={categoria.id} aria-labelledby={`cat-${categoria.handle}`} className="content-container">
            <div className="mb-6 flex items-end justify-between gap-x-4">
              <h2
                id={`cat-${categoria.handle}`}
                className="font-display text-2xl font-bold uppercase leading-tight tracking-[0.06em]"
              >
                {categoria.name.toUpperCase()}
              </h2>
              <LocalizedClientLink
                href={`/categories/${categoria.handle}`}
                className="text-sm font-medium text-fg underline underline-offset-4 hover:text-fg-muted"
              >
                Ver todo <span className="sr-only">{categoria.name}</span>
              </LocalizedClientLink>
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => (
                <li key={product.id}>
                  <ProductPreview product={product} region={region} />
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  )
}
