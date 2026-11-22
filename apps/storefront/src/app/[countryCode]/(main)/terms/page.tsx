import { Metadata } from "next"

import { STORE_NAME } from "@lib/util/site"
import { PlaceholderNotice, PolicyPage } from "@modules/policies/templates"

export const dynamic = "force-static"
export const revalidate = 60

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: `Términos que aplican a las compras en ${STORE_NAME}.`,
}

export default function TermsPage() {
  return (
    <PolicyPage title="Términos y condiciones">
      <PlaceholderNotice />
      <p>
        Al hacer un pedido en {STORE_NAME} aceptas estos términos. Los precios, la disponibilidad y las opciones de envío se muestran en cada producto y al pagar, y pueden cambiar sin previo aviso.
      </p>
      <p>
        Los pedidos se confirman por correo cuando se recibe el pago. Las devoluciones y los reembolsos siguen nuestra política de devoluciones.
      </p>
    </PolicyPage>
  )
}
