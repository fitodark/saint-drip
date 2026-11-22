import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import orderPlacedHandler from "../order-placed"
import shipmentCreatedHandler from "../shipment-created"

const pedido = (payments: unknown[]) => ({
  id: "order_1",
  display_id: 12,
  email: "cliente@example.com",
  total: 1448,
  items: [{ product_title: "Hoodie Oversize Negro", variant_title: "M", quantity: 1, total: 1299 }],
  payment_collections: [{ payments }],
})

const contenedorDoble = (resultado: unknown) => {
  const graph = jest.fn().mockResolvedValue({ data: [resultado] })
  const createNotifications = jest.fn().mockResolvedValue({})
  const container = {
    resolve: (clave: string) => {
      if (clave === ContainerRegistrationKeys.QUERY) return { graph }
      if (clave === Modules.NOTIFICATION) return { createNotifications }
      throw new Error(`resolve inesperado: ${clave}`)
    },
  }
  return { container: container as any, graph, createNotifications }
}

const evento = (data: Record<string, unknown>) => ({ name: "evento", data }) as any

describe("suscriptores de pedido y envío", () => {
  it("order.placed con SPEI envía confirmacion-pedido con la CLABE", async () => {
    const { container, createNotifications } = contenedorDoble(
      pedido([
        {
          provider_id: "pp_spei_spei",
          data: {
            clabe: "000000000000000001",
            banco: "BANCO DE PRUEBAS",
            referencia: "SD-MOCK-REF",
            vence_en: "2026-11-24T18:00:00.000Z",
          },
        },
      ])
    )

    await orderPlacedHandler({ event: evento({ id: "order_1" }), container, pluginOptions: {} } as any)

    expect(createNotifications).toHaveBeenCalledTimes(1)
    const notificacion = createNotifications.mock.calls[0][0]
    expect(notificacion).toEqual(
      expect.objectContaining({ to: "cliente@example.com", channel: "email", template: "confirmacion-pedido" })
    )
    expect(notificacion.content.html).toContain("000000000000000001")
    expect(notificacion.content.html).toContain("/mx/order/order_1/confirmed")
  })

  it("order.placed con tarjeta envía la confirmación sin bloque SPEI", async () => {
    const { container, createNotifications } = contenedorDoble(
      pedido([{ provider_id: "pp_stripe_stripe", data: { id: "pi_1" } }])
    )

    await orderPlacedHandler({ event: evento({ id: "order_1" }), container, pluginOptions: {} } as any)

    expect(createNotifications).toHaveBeenCalledTimes(1)
    const notificacion = createNotifications.mock.calls[0][0]
    expect(notificacion.template).toBe("confirmacion-pedido")
    expect(notificacion.content.html).not.toContain("CLABE")
  })

  it("shipment.created envía envio-generado con el tracking de la etiqueta", async () => {
    const { container, createNotifications } = contenedorDoble({
      id: "ful_1",
      data: { carrier: "mock", tracking: "MOCK123456" },
      labels: [
        {
          tracking_number: "MOCK123456",
          tracking_url: "https://envia.com/rastreo?label=MOCK123456",
          label_url: "http://localhost:9000/static/guia-mock.pdf",
        },
      ],
      order: { id: "order_1", display_id: 12, email: "cliente@example.com" },
    })

    await shipmentCreatedHandler({ event: evento({ id: "ful_1" }), container, pluginOptions: {} } as any)

    expect(createNotifications).toHaveBeenCalledTimes(1)
    const notificacion = createNotifications.mock.calls[0][0]
    expect(notificacion.template).toBe("envio-generado")
    expect(notificacion.content.html).toContain("MOCK123456")
  })
})
