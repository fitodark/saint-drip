"use client"

import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { clx } from "@modules/common/components/ui"
import { usePathname } from "next/navigation"

// Categorías visibles en el header (escritorio). La categoría actual se subraya y lleva aria-current.
export default function NavCategorias({ categorias }: { categorias: HttpTypes.StoreProductCategory[] }) {
  const pathname = usePathname()

  return (
    <ul className="flex h-full items-center gap-x-8">
      {categorias.map((c) => {
        const actual = pathname.includes(`/categories/${c.handle}`)
        return (
          <li key={c.id} className="flex h-full items-center">
            <LocalizedClientLink
              href={`/categories/${c.handle}`}
              aria-current={actual ? "page" : undefined}
              data-testid="nav-category-link"
              className={clx(
                "border-b-2 py-1 font-display text-[13px] font-bold uppercase tracking-[0.08em] text-fg transition-colors duration-[120ms] hover:border-fg",
                actual ? "border-fg" : "border-transparent"
              )}
            >
              {c.name}
            </LocalizedClientLink>
          </li>
        )
      })}
    </ul>
  )
}
