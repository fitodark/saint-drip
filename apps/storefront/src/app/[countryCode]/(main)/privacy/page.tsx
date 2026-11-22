import { Metadata } from "next"

import { STORE_NAME } from "@lib/util/site"
import { PlaceholderNotice, PolicyPage } from "@modules/policies/templates"

export const dynamic = "force-static"
export const revalidate = 60

export const metadata: Metadata = {
  title: "Aviso de privacidad",
  description: `Cómo ${STORE_NAME} recaba y usa tus datos personales.`,
}

export default function PrivacyPage() {
  return (
    <PolicyPage title="Aviso de privacidad">
      <PlaceholderNotice />
      <p>
        {STORE_NAME} recaba los datos que proporcionas al pagar, como tu nombre, correo y dirección de envío, para procesar y entregar tu pedido.
      </p>
      <p>
        Los datos de pago los procesa nuestro proveedor de pagos y la tienda no los guarda. Usamos cookies para conservar tu carrito y tu sesión.
      </p>
    </PolicyPage>
  )
}
