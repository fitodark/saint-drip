"use client"

import { Stripe, StripeElementsOptions } from "@stripe/stripe-js"
import { Elements } from "@stripe/react-stripe-js"
import { HttpTypes } from "@medusajs/types"
import { createContext } from "react"

type StripeWrapperProps = {
  paymentSession: HttpTypes.StorePaymentSession
  stripeKey?: string
  stripePromise: Promise<Stripe | null> | null
  children: React.ReactNode
}

export const StripeContext = createContext(false)

const StripeWrapper: React.FC<StripeWrapperProps> = ({
  paymentSession,
  stripeKey,
  stripePromise,
  children,
}) => {
  const options: StripeElementsOptions = {
    clientSecret: paymentSession!.data?.client_secret as string | undefined,
  }

  if (!stripeKey) {
    throw new Error(
      "Falta la llave de Stripe. Define NEXT_PUBLIC_STRIPE_KEY (Stripe) o NEXT_PUBLIC_MEDUSA_PAYMENTS_PUBLISHABLE_KEY (Medusa Payments)."
    )
  }

  if (!stripePromise) {
    throw new Error(
      "No se pudo iniciar Stripe. Revisa que la llave de Stripe sea válida."
    )
  }

  if (!paymentSession?.data?.client_secret) {
    throw new Error(
      "Falta el client secret de Stripe. No se puede iniciar Stripe."
    )
  }

  return (
    <StripeContext.Provider value={true}>
      <Elements options={options} stripe={stripePromise}>
        {children}
      </Elements>
    </StripeContext.Provider>
  )
}

export default StripeWrapper
