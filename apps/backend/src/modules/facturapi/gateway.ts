// Único punto que habla con FacturAPI (blueprint §3). Los precios llevan IVA 16 % incluido.
import Facturapi from "facturapi"

export type CfdiEntrada = {
  receptor: { rfc: string; razon_social: string; regimen_fiscal: string; codigo_postal: string }
  uso_cfdi: string
  items: { descripcion: string; precio: number; cantidad: number }[]
  global?: { periodicidad: "month"; mes: string; anio: number }
}

export type CfdiTimbrado = { id: string; uuid: string; total: number }

export interface FacturapiGateway {
  timbrar(cfdi: CfdiEntrada): Promise<CfdiTimbrado>
  pdf(id: string): Promise<Buffer>
}

// La SDK puede devolver Buffer, Blob o un stream según el runtime; se normaliza a Buffer.
async function aBuffer(respuesta: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(respuesta)) return respuesta
  if (respuesta && typeof (respuesta as Blob).arrayBuffer === "function") {
    return Buffer.from(await (respuesta as Blob).arrayBuffer())
  }
  if (respuesta && typeof (respuesta as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === "function") {
    const partes: Buffer[] = []
    for await (const parte of respuesta as AsyncIterable<Uint8Array>) partes.push(Buffer.from(parte))
    return Buffer.concat(partes)
  }
  throw new Error("FacturAPI devolvió un PDF en un formato desconocido")
}

export function crearFacturapiGateway(key: string): FacturapiGateway {
  const facturapi = new Facturapi(key)

  return {
    async timbrar(cfdi) {
      const factura = await facturapi.invoices.create({
        customer: {
          legal_name: cfdi.receptor.razon_social,
          tax_id: cfdi.receptor.rfc,
          tax_system: cfdi.receptor.regimen_fiscal,
          address: { zip: cfdi.receptor.codigo_postal },
        },
        use: cfdi.uso_cfdi,
        payment_form: "03",
        items: cfdi.items.map((i) => ({
          quantity: i.cantidad,
          product: { description: i.descripcion, product_key: "01010101", price: i.precio, tax_included: true },
        })),
        ...(cfdi.global
          ? { global: { periodicity: cfdi.global.periodicidad, months: cfdi.global.mes, year: cfdi.global.anio } }
          : {}),
      } as Parameters<typeof facturapi.invoices.create>[0])
      return { id: String(factura.id), uuid: String(factura.uuid), total: Number(factura.total) }
    },

    async pdf(id) {
      return aBuffer(await facturapi.invoices.downloadPdf(id))
    },
  }
}

export function crearFacturapiGatewayMock(): FacturapiGateway {
  let n = 0
  return {
    async timbrar(cfdi) {
      n += 1
      const total = cfdi.items.reduce((suma, i) => suma + i.precio * i.cantidad, 0)
      return { id: `facturapi_mock_${n}`, uuid: "00000000-0000-4000-8000-000000000001", total }
    },
    async pdf() {
      return Buffer.from("%PDF")
    },
  }
}
