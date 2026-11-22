import React, { Suspense } from "react"

import VariantImageGallery from "@modules/products/components/image-gallery/variant-image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductOnboardingCta from "@modules/products/components/product-onboarding-cta"
import ProductTabs from "@modules/products/components/product-tabs"
import RelatedProducts from "@modules/products/components/related-products"
import ProductInfo from "@modules/products/templates/product-info"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import { notFound } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import { getBaseURL } from "@lib/util/env"
import { isVariantInStock } from "@lib/util/inventory"

// JSON-LD Product del paso 15: oferta con el precio de la variante más barata (unidades mayores, 2 decimales).
const productJsonLd = (product: HttpTypes.StoreProduct, countryCode: string) => {
  const variants = product.variants ?? []
  const precios = variants
    .map((v) => v.calculated_price?.calculated_amount)
    .filter((monto): monto is number => typeof monto === "number")
  const images = (product.images ?? []).map((i) => i.url).filter(Boolean)
  const url = `${getBaseURL()}/${countryCode}/products/${product.handle}`

  const datos = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    sku: variants[0]?.sku ?? undefined,
    image: images.length ? images : product.thumbnail ? [product.thumbnail] : [],
    brand: { "@type": "Brand", name: "Saint Drip" },
    offers: {
      "@type": "Offer",
      priceCurrency: "MXN",
      price: precios.length ? Math.min(...precios).toFixed(2) : undefined,
      availability: variants.some((v) => isVariantInStock(v))
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url,
    },
  }
  return JSON.stringify(datos).replace(/</g, "\\u003c")
}

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
}

const ProductTemplate: React.FC<ProductTemplateProps> = ({
  product,
  region,
  countryCode,
}) => {
  if (!product || !product.id) {
    return notFound()
  }

  const soloTerrestre = product.metadata?.solo_terrestre === true

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: productJsonLd(product, countryCode) }}
      />
      <div
        className="content-container  flex flex-col small:flex-row small:items-start py-6 relative"
        data-testid="product-container"
      >
        <div className="flex flex-col small:sticky small:top-48 small:py-0 small:max-w-[300px] w-full py-8 gap-y-6">
          {soloTerrestre && (
            <span className="self-start bg-accent px-2 py-1 text-xs font-medium uppercase tracking-[0.06em] text-fg">
              Solo envío terrestre
            </span>
          )}
          <ProductInfo product={product} />
          <ProductTabs product={product} />
        </div>
        <div className="block w-full relative">
          <VariantImageGallery product={product} />
        </div>
        <div className="flex flex-col small:sticky small:top-48 small:py-0 small:max-w-[300px] w-full py-8 gap-y-12">
          <ProductOnboardingCta />
          <ProductActions product={product} region={region} />
        </div>
      </div>
      <div
        className="content-container my-16 small:my-32"
        data-testid="related-products-container"
      >
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  )
}

export default ProductTemplate
