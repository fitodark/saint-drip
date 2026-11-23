// "Compra por categoría" del tema A: una foto por categoría (la del producto más reciente) y solo las
// categorías con productos publicados. Componente de servidor.
import { listCategories } from "@lib/data/categories"
import { listProducts } from "@lib/data/products"
import { categoriasEnOrden } from "@lib/util/categorias"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Image from "next/image"
import { urlImagen } from "@lib/util/imagen"

export default async function CategoriasGrid({ countryCode }: { countryCode: string }) {
  const categorias = categoriasEnOrden(await listCategories({ fields: "id,name,handle,parent_category_id" }))

  const tarjetas = (
    await Promise.all(
      categorias.map(async (categoria) => {
        const {
          response: { products },
        } = await listProducts({
          countryCode,
          queryParams: { category_id: [categoria.id], limit: 1, order: "-created_at" },
        })
        return { categoria, foto: products[0]?.thumbnail ?? products[0]?.images?.[0]?.url ?? null, hay: products.length > 0 }
      })
    )
  ).filter(({ hay }) => hay)

  if (!tarjetas.length) return null

  return (
    <section aria-labelledby="compra-por-categoria" className="content-container pt-20">
      <h2
        id="compra-por-categoria"
        className="mb-6 font-display text-2xl font-bold uppercase leading-tight tracking-[0.06em]"
      >
        Compra por categoría
      </h2>
      <ul className="grid grid-cols-2 gap-4 small:grid-cols-5">
        {tarjetas.map(({ categoria, foto }) => (
          <li key={categoria.id}>
            <LocalizedClientLink href={`/categories/${categoria.handle}`} className="group flex flex-col gap-y-3">
              <div className="relative aspect-[3/4] overflow-hidden bg-border">
                {foto && (
                  <Image
                    src={urlImagen(foto)}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 20vw, 50vw"
                    className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                  />
                )}
              </div>
              <h3 className="font-display text-sm font-bold uppercase tracking-[0.08em]">
                {categoria.name} <span aria-hidden="true">→</span>
              </h3>
            </LocalizedClientLink>
          </li>
        ))}
      </ul>
    </section>
  )
}
