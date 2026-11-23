import { Suspense } from "react"

import { listCategories } from "@lib/data/categories"
import { listLocales } from "@lib/data/locales"
import { getLocale } from "@lib/data/locale-actions"
import { listRegions } from "@lib/data/regions"
import { categoriasEnOrden } from "@lib/util/categorias"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import BarraAnuncio from "@modules/layout/components/barra-anuncio"
import CartButton from "@modules/layout/components/cart-button"
import NavCategorias from "@modules/layout/components/nav-categorias"
import Search from "@modules/layout/components/search"
import SideMenu from "@modules/layout/components/side-menu"
import Image from "next/image"

// Header del tema A (editorial): franja de anuncio, logo "SD", categorías a la vista en escritorio y
// el menú lateral solo en pantallas chicas.
export default async function Nav() {
  const [regions, locales, currentLocale, categorias] = await Promise.all([
    listRegions().then((regions: StoreRegion[]) => regions),
    listLocales(),
    getLocale(),
    listCategories({ fields: "id,name,handle,parent_category_id" }),
  ])
  const principales = categoriasEnOrden(categorias)

  return (
    <div className="sticky top-0 inset-x-0 z-50 group">
      <BarraAnuncio />
      <header className="relative h-[72px] mx-auto border-b border-border bg-background">
        <nav
          aria-label="Principal"
          className="content-container flex items-center justify-between gap-x-6 w-full h-full text-sm text-fg"
        >
          <div className="flex h-full items-center gap-x-2">
            <div className="h-full small:hidden">
              <SideMenu regions={regions} locales={locales} currentLocale={currentLocale} />
            </div>
            <LocalizedClientLink
              href="/"
              aria-label="Saint Drip, inicio"
              className="flex h-14 items-center"
              data-testid="nav-store-link"
            >
              <Image src="/marca/logo-oscuro.png" alt="" width={600} height={546} priority className="h-12 w-auto" />
            </LocalizedClientLink>
          </div>

          <div className="hidden small:flex h-full items-center">
            <NavCategorias categorias={principales} />
          </div>

          <div className="flex items-center gap-x-2 h-full">
            <Search />
            <LocalizedClientLink
              className="flex h-11 w-11 items-center justify-center hover:text-fg-muted"
              href="/account"
              aria-label="Cuenta"
              data-testid="nav-account-link"
            >
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
              </svg>
            </LocalizedClientLink>
            <Suspense
              fallback={
                <LocalizedClientLink
                  className="flex h-11 items-center gap-1.5"
                  href="/cart"
                  aria-label="Carrito (0)"
                  data-testid="nav-cart-link"
                >
                  (0)
                </LocalizedClientLink>
              }
            >
              <CartButton />
            </Suspense>
          </div>
        </nav>
      </header>
    </div>
  )
}
