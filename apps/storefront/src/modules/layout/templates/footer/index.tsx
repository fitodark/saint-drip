import { listCategories } from "@lib/data/categories"
import { categoriasEnOrden } from "@lib/util/categorias"
import { REDES, UBICACION } from "@lib/util/marca"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

// Pie del tema A (editorial): fondo negro con marca, tienda, ayuda y contacto, y una franja legal.
const AYUDA = [
  { href: "/shipping", texto: "Información de envíos" },
  { href: "/returns", texto: "Devoluciones y cambios" },
  { href: "/contact", texto: "Contacto" },
  { href: "/search", texto: "Buscar" },
]

const enlace = "text-border hover:text-primary-fg hover:underline underline-offset-4"
const titulo = "text-xs font-semibold uppercase tracking-[0.08em] text-primary-fg"

export default async function Footer() {
  const categorias = categoriasEnOrden(await listCategories({ fields: "id,name,handle,parent_category_id" }))
  const whatsapp = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER

  return (
    <footer className="foco-claro w-full bg-primary text-primary-fg">
      <div className="content-container grid grid-cols-1 gap-10 py-16 xsmall:grid-cols-2 small:grid-cols-4">
        <div className="flex flex-col gap-y-3">
          <LocalizedClientLink
            href="/"
            className="font-display text-[28px] font-black uppercase tracking-[0.04em] [font-stretch:125%]"
          >
            Saint Drip
          </LocalizedClientLink>
          <p className="text-sm leading-relaxed text-border">Exclusividad en cada prenda.</p>
          <p className="text-sm text-border">{UBICACION}</p>
          <ul className="mt-1 flex gap-2" aria-label="Redes sociales">
            {REDES.map(({ nombre, url }) => (
              <li key={nombre}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${nombre} de Saint Drip`}
                  className="flex h-11 w-11 items-center justify-center border border-border-strong hover:border-primary-fg"
                >
                  {nombre === "Instagram" ? (
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="3" y="3" width="18" height="18" rx="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M14 3v11a4 4 0 11-4-4" />
                      <path d="M14 3c0 3 2 5 5 5" />
                    </svg>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <nav aria-labelledby="pie-tienda" className="flex flex-col gap-y-3 text-sm">
          <h2 id="pie-tienda" className={titulo}>
            Tienda
          </h2>
          <ul className="flex flex-col gap-y-2.5" data-testid="footer-categories">
            {categorias.map((c) => (
              <li key={c.id}>
                <LocalizedClientLink className={enlace} href={`/categories/${c.handle}`} data-testid="category-link">
                  {c.name}
                </LocalizedClientLink>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="pie-ayuda" className="flex flex-col gap-y-3 text-sm">
          <h2 id="pie-ayuda" className={titulo}>
            Ayuda
          </h2>
          <ul className="flex flex-col gap-y-2.5">
            {AYUDA.map(({ href, texto }) => (
              <li key={href}>
                <LocalizedClientLink className={enlace} href={href}>
                  {texto}
                </LocalizedClientLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-y-3 text-sm">
          <h2 className={titulo}>Pagos y facturación</h2>
          <p className="leading-relaxed text-border">
            Tarjeta, SPEI o PayPal. Solicita tu factura CFDI desde tu cuenta.
          </p>
          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex h-11 items-center self-start border border-border-strong px-4 hover:border-primary-fg"
            >
              Escríbenos por WhatsApp
            </a>
          )}
        </div>
      </div>

      <div className="content-container flex flex-col gap-4 border-t border-border-strong py-6 pb-24 text-[13px] xsmall:flex-row xsmall:justify-between">
        <p className="text-border">© {new Date().getFullYear()} Saint Drip. Todos los derechos reservados.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <LocalizedClientLink className={enlace} href="/terms">
            Términos y condiciones
          </LocalizedClientLink>
          <LocalizedClientLink className={enlace} href="/privacy">
            Aviso de privacidad
          </LocalizedClientLink>
        </div>
      </div>
    </footer>
  )
}
