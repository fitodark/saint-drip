// D17: proxy del PDF del CFDI. /store/invoices/:id/pdf es del backend y exige la sesión del cliente, que vive
// en la cookie _medusa_jwt del dominio del storefront. Un enlace directo al backend no la envía (401).
import { getAuthHeaders } from "@lib/data/cookies"
import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuthHeaders()
  if (!("authorization" in auth)) {
    return NextResponse.json({ codigo: "E_SESION", mensaje: "Inicia sesión para descargar tu factura." }, { status: 401 })
  }

  const respuesta = await fetch(`${BACKEND_URL}/store/invoices/${encodeURIComponent(id)}/pdf`, {
    headers: { "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "", ...auth },
    cache: "no-store",
  })
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({ codigo: "E_PDF", mensaje: "No se pudo descargar la factura." }))
    return NextResponse.json(cuerpo, { status: respuesta.status })
  }

  return new NextResponse(respuesta.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": respuesta.headers.get("content-disposition") ?? `attachment; filename="cfdi-${id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
