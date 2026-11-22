import { Metadata } from "next"

import { getStorePolicies } from "@lib/data/store-policies"
import { PoliciesUnavailable, PolicyPage } from "@modules/policies/templates"

export const dynamic = "force-static"
export const revalidate = 60

export const metadata: Metadata = {
  title: "Política de devoluciones",
  description: "Cómo devolver productos y obtener un reembolso.",
}

export default async function ReturnsPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const { current } = await getStorePolicies(countryCode)

  return (
    <PolicyPage title="Política de devoluciones">
      {current ? (
        <>
          <p>
            Puedes devolver productos dentro de los {current.returnWindowDays} días posteriores a la entrega. Las devoluciones se envían por paquetería.
          </p>
          <p>
            {current.freeReturns
              ? "El envío de la devolución es gratis."
              : "El cliente paga el envío de la devolución."}
          </p>
        </>
      ) : (
        <PoliciesUnavailable />
      )}
    </PolicyPage>
  )
}
