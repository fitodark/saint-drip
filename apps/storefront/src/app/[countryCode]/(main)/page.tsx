import { Metadata } from "next"

import CategoryRails from "@modules/home/components/category-rails"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { getRegion, listRegions } from "@lib/data/regions"
import { toJsonLd } from "@lib/util/product-structured-data"
import { getSiteOrigin, listCountryCodes, STORE_NAME } from "@lib/util/site"
import { buildRegionsReturnPolicies } from "@lib/util/store-policies"

export const dynamic = "force-static"
export const revalidate = 60

export async function generateMetadata(props: {
  params: Promise<{ countryCode: string }>
}): Promise<Metadata> {
  const { countryCode } = await props.params
  const [origin, regions] = await Promise.all([getSiteOrigin(), listRegions()])

  return {
    title: "Saint Drip — Ropa, tenis, joyería, perfumes y accesorios",
    description:
      "Tienda en línea de Saint Drip: ropa, tenis, joyería, perfumes y accesorios con envío a todo México.",
    alternates: {
      canonical: `${origin}/${countryCode}`,
      languages: {
        ...Object.fromEntries(
          listCountryCodes(regions).map((code) => [
            `es-${code.toUpperCase()}`,
            `${origin}/${code}`,
          ])
        ),
        "x-default": origin,
      },
    },
  }
}

export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params

  const { countryCode } = params

  const region = await getRegion(countryCode)

  if (!region) {
    return null
  }

  const [origin, regions] = await Promise.all([getSiteOrigin(), listRegions()])
  const homeUrl = `${origin}/${countryCode}`
  const returnPolicies = buildRegionsReturnPolicies(regions)
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: STORE_NAME,
      url: origin,
      ...(returnPolicies.length
        ? { hasMerchantReturnPolicy: returnPolicies }
        : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: STORE_NAME,
      url: homeUrl,
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${homeUrl}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
  ]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLd(structuredData) }}
      />
      <section className="border-b border-border bg-surface">
        <div className="content-container flex flex-col items-start gap-y-6 py-16 small:py-24">
          <h1 className="font-display text-4xl font-extrabold uppercase leading-none tracking-[0.04em] small:text-5xl">
            Exclusividad en cada prenda
          </h1>
          <LocalizedClientLink
            href="/store"
            className="bg-primary px-6 py-3 text-sm font-medium uppercase tracking-[0.06em] text-primary-fg transition-colors duration-[120ms] ease-out hover:bg-fg-muted"
          >
            Ver catálogo
          </LocalizedClientLink>
        </div>
      </section>
      <CategoryRails countryCode={countryCode} />
    </>
  )
}
