import EnviaFulfillmentService, { MENSAJE_SOLO_TERRESTRE, type EnviaOptions } from "../service"
import type { EnviaGateway } from "../gateway"

const MOCK: EnviaOptions = { environment: "mock", origenCp: "69000" }

const contexto = (items: unknown[]) =>
  ({
    items,
    shipping_address: { postal_code: "06700", province: "CDMX", country_code: "mx" },
  }) as any

const item = (soloTerrestre: boolean) => ({
  quantity: 1,
  variant: { weight: 650, length: 35, width: 30, height: 8, product: { metadata: { solo_terrestre: soloTerrestre } } },
})

describe("EnviaFulfillmentService", () => {
  it("mock: el envío terrestre cuesta 149 con IVA incluido", async () => {
    const servicio = new EnviaFulfillmentService({}, MOCK)
    const precio = await servicio.calculatePrice({ id: "envia-terrestre" }, {}, contexto([item(false)]))

    expect(precio).toEqual({ calculated_amount: 149, is_calculated_price_tax_inclusive: true })
  })

  it("express con un producto solo_terrestre lanza el mensaje exacto", async () => {
    const servicio = new EnviaFulfillmentService({}, MOCK)

    await expect(
      servicio.calculatePrice({ id: "envia-express" }, {}, contexto([item(false), item(true)]))
    ).rejects.toThrow(MENSAJE_SOLO_TERRESTRE)
    expect(MENSAJE_SOLO_TERRESTRE).toBe("Este pedido contiene productos que solo pueden enviarse por tierra")
  })

  it("elige la tarifa terrestre más barata", async () => {
    const gateway: EnviaGateway = {
      cotizar: jest.fn().mockResolvedValue([
        { carrier: "dhl", servicio: "ground", tipo: "terrestre", total: 210, dias: "3-5" },
        { carrier: "estafeta", servicio: "terrestre", tipo: "terrestre", total: 180, dias: "3-5" },
        { carrier: "fedex", servicio: "ground", tipo: "terrestre", total: 199, dias: "3-5" },
      ]),
      generarGuia: jest.fn(),
      cancelarGuia: jest.fn(),
    }
    const servicio = new EnviaFulfillmentService({}, { ...MOCK, environment: "sandbox" }, { gateway })
    const precio = await servicio.calculatePrice({ id: "envia-terrestre" }, {}, contexto([item(false)]))

    expect(precio.calculated_amount).toBe(180)
  })

  it("createFulfillment devuelve la etiqueta con el número de rastreo", async () => {
    const servicio = new EnviaFulfillmentService({}, MOCK)
    const resultado = await servicio.createFulfillment(
      { id: "envia-terrestre" },
      [{ line_item_id: "li_1", quantity: 1 }],
      { email: "cliente@example.com", items: [{ id: "li_1", variant: item(false).variant }], shipping_address: { postal_code: "06700" } }
    )

    expect(resultado.labels[0].tracking_number).toBe("MOCK123456")
    expect(resultado.data).toEqual(expect.objectContaining({ tracking: "MOCK123456", carrier: "mock" }))
  })

  it("production sin token lanza ENVIA_API_TOKEN no configurado", async () => {
    const servicio = new EnviaFulfillmentService({}, { environment: "production", origenCp: "69000" })

    await expect(
      servicio.calculatePrice({ id: "envia-terrestre" }, {}, contexto([item(false)]))
    ).rejects.toThrow("ENVIA_API_TOKEN no configurado")
  })
})
