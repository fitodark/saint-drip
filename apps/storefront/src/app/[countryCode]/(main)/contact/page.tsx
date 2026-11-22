import { Metadata } from "next"

import { STORE_NAME } from "@lib/util/site"
import { PlaceholderNotice, PolicyPage } from "@modules/policies/templates"

export const dynamic = "force-static"
export const revalidate = 60

export const metadata: Metadata = {
  title: "Contacto",
  description: `Cómo contactar a ${STORE_NAME}.`,
}

export default function ContactPage() {
  return (
    <PolicyPage title="Contacto">
      <PlaceholderNotice />
      <p>
        ¿Dudas sobre un pedido, un envío o una devolución? Escribe a atención a clientes de {STORE_NAME}{" "} e incluye tu número de pedido.
      </p>
    </PolicyPage>
  )
}
