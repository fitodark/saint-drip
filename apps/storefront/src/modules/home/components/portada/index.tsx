import LocalizedClientLink from "@modules/common/components/localized-client-link"

// Portada del tema A: texto a la izquierda y bloque visual a la derecha. El monograma "SD" ocupa el lugar
// de la foto de campaña hasta que la marca la entregue (cambiar el bloque derecho por next/image).
export default function Portada() {
  return (
    <section className="content-container pt-12">
      <div className="grid grid-cols-1 border border-border small:grid-cols-2">
        <div className="flex min-h-[420px] flex-col justify-end gap-y-6 bg-surface p-6 xsmall:p-8 small:min-h-[520px] small:p-12">
          <h1 className="font-display text-[28px] font-extrabold uppercase leading-none tracking-[0.04em] [font-stretch:125%] xsmall:text-4xl small:text-[56px]">
            Exclusividad en cada prenda
          </h1>
          <p className="max-w-md text-[17px] leading-relaxed text-fg-muted">
            Ropa, tenis, joyería, perfumes y accesorios seleccionados pieza por pieza.
          </p>
          <div className="flex flex-wrap gap-3">
            <LocalizedClientLink
              href="/store"
              className="bg-primary px-7 py-4 text-sm font-semibold uppercase tracking-[0.06em] text-primary-fg transition-colors duration-[120ms] ease-out hover:bg-fg-muted"
            >
              Ver catálogo
            </LocalizedClientLink>
            <a
              href="#lo-mas-nuevo"
              className="border border-border-strong px-7 py-4 text-sm font-semibold uppercase tracking-[0.06em] transition-colors duration-[120ms] ease-out hover:border-fg"
            >
              Lo más nuevo
            </a>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="hidden min-h-[520px] items-center justify-center bg-primary font-display text-[200px] font-black leading-none tracking-[0.04em] text-primary-fg [font-stretch:125%] small:flex"
        >
          SD
        </div>
      </div>
    </section>
  )
}
