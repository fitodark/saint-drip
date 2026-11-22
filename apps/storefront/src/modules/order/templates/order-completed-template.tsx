import { Heading } from "@modules/common/components/ui"
import { cookies as nextCookies } from "next/headers"

import CartTotals from "@modules/common/components/cart-totals"
import Help from "@modules/order/components/help"
import Items from "@modules/order/components/items"
import OnboardingCta from "@modules/order/components/onboarding-cta"
import OrderDetails from "@modules/order/components/order-details"
import ShippingDetails from "@modules/order/components/shipping-details"
import PaymentDetails from "@modules/order/components/payment-details"
import { HttpTypes } from "@medusajs/types"
import { isSpei } from "@lib/constants"

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" })
const FECHA = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  dateStyle: "long",
  timeStyle: "short",
})

// Instrucciones SPEI (paso 16): datos que el proveedor pp_spei_spei guardó en el pago.
const InstruccionesSpei = ({ order }: { order: HttpTypes.StoreOrder }) => {
  const pago = order.payment_collections?.[0]?.payments?.[0]
  if (!pago || !isSpei(pago.provider_id)) return null
  const datos = (pago.data ?? {}) as Record<string, unknown>
  const monto = Number(datos.monto ?? order.total)
  const venceEn = typeof datos.vence_en === "string" ? new Date(datos.vence_en) : null

  return (
    <section
      aria-labelledby="instrucciones-spei"
      className="flex flex-col gap-y-2 border border-border-strong bg-surface p-6"
      data-testid="spei-instructions"
    >
      <h2 id="instrucciones-spei" className="font-display text-xl font-bold uppercase tracking-[0.06em]">
        Paga con transferencia SPEI
      </h2>
      <p>
        CLABE: <span className="font-mono text-base font-medium">{String(datos.clabe ?? "")}</span>
      </p>
      <p>Banco: {String(datos.banco ?? "")}</p>
      <p>
        Referencia: <span className="font-mono font-medium">{String(datos.referencia ?? "")}</span>
      </p>
      <p>Monto: {MXN.format(monto)}</p>
      {venceEn && !Number.isNaN(venceEn.getTime()) && <p>Paga antes de {FECHA.format(venceEn)}</p>}
    </section>
  )
}

type OrderCompletedTemplateProps = {
  order: HttpTypes.StoreOrder
}

export default async function OrderCompletedTemplate({
  order,
}: OrderCompletedTemplateProps) {
  const cookies = await nextCookies()

  const isOnboarding = cookies.get("_medusa_onboarding")?.value === "true"

  return (
    <div className="py-6 min-h-[calc(100vh-64px)]">
      <div className="content-container flex flex-col justify-center items-center gap-y-10 max-w-4xl h-full w-full">
        {isOnboarding && <OnboardingCta orderId={order.id} />}
        <div
          className="flex flex-col gap-4 max-w-4xl h-full bg-white w-full py-10"
          data-testid="order-complete-container"
        >
          <Heading
            level="h1"
            className="flex flex-col gap-y-3 text-ui-fg-base text-3xl mb-4"
          >
            <span>Thank you!</span>
            <span>Your order was placed successfully.</span>
          </Heading>
          <OrderDetails order={order} />
          <Heading level="h2" className="flex flex-row text-3xl-regular">
            Summary
          </Heading>
          <Items order={order} />
          <CartTotals totals={order} />
          <InstruccionesSpei order={order} />
          <ShippingDetails order={order} />
          <PaymentDetails order={order} />
          <Help />
        </div>
      </div>
    </div>
  )
}
