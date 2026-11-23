// "Lo más nuevo" del tema A: los 4 productos publicados más recientes. Componente de servidor.
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductPreview from "@modules/products/components/product-preview"

export default async function LoMasNuevo({ countryCode }: { countryCode: string }) {
  const [region, { response }] = await Promise.all([
    getRegion(countryCode),
    listProducts({ countryCode, queryParams: { limit: 4, order: "-created_at" } }),
  ])
  if (!region || !response.products.length) return null

  return (
    <section id="lo-mas-nuevo" aria-labelledby="titulo-lo-mas-nuevo" className="content-container py-20">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <h2
          id="titulo-lo-mas-nuevo"
          className="font-display text-2xl font-bold uppercase leading-tight tracking-[0.06em]"
        >
          Lo más nuevo
        </h2>
        <LocalizedClientLink href="/store" className="text-sm font-medium underline underline-offset-4 hover:text-fg-muted">
          Ver todo <span className="sr-only">el catálogo</span>
        </LocalizedClientLink>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 small:grid-cols-4">
        {response.products.map((product) => (
          <li key={product.id}>
            <ProductPreview product={product} region={region} isFeatured />
          </li>
        ))}
      </ul>
    </section>
  )
}
