import { confirmacionPedido, envioGenerado, facturaEmitida } from "../templates"

const PEDIDO = {
  display_id: 12,
  email: "cliente@example.com",
  total: 1448,
  items: [{ titulo: "Hoodie Oversize Negro", variante: "M", cantidad: 1, total: 1299 }],
  urlPedido: "http://localhost:8000/mx/order/order_123/confirmed",
}

const SPEI = {
  clabe: "000000000000000001",
  banco: "BANCO DE PRUEBAS",
  referencia: "SD-MOCK-REF",
  vence_en: "2026-11-24T18:00:00.000Z",
}

describe("plantillas de correo", () => {
  it("confirmacionPedido incluye el total formateado, el link y el asunto", () => {
    const correo = confirmacionPedido(PEDIDO)

    expect(correo.subject).toBe("Recibimos tu pedido #12")
    expect(correo.html).toContain("$1,448.00")
    expect(correo.text).toContain("$1,448.00")
    expect(correo.html).toContain(PEDIDO.urlPedido)
    expect(correo.text).toContain(PEDIDO.urlPedido)
  })

  it("con SPEI incluye la CLABE y la referencia", () => {
    const correo = confirmacionPedido({ ...PEDIDO, spei: SPEI })

    expect(correo.html).toContain("000000000000000001")
    expect(correo.html).toContain("SD-MOCK-REF")
    expect(correo.text).toContain("000000000000000001")
    expect(correo.html).toContain("Paga antes de")
  })

  it("sin SPEI no menciona la CLABE", () => {
    const correo = confirmacionPedido(PEDIDO)

    expect(correo.html).not.toContain("CLABE")
    expect(correo.text).not.toContain("CLABE")
  })

  it("envioGenerado incluye el tracking y la URL de rastreo", () => {
    const correo = envioGenerado({
      display_id: 12,
      carrier: "mock",
      tracking: "MOCK123456",
      rastreoUrl: "https://envia.com/rastreo?label=MOCK123456",
    })

    expect(correo.subject).toBe("Tu pedido #12 va en camino")
    expect(correo.html).toContain("MOCK123456")
    expect(correo.html).toContain("https://envia.com/rastreo?label=MOCK123456")
  })

  it("facturaEmitida incluye el uuid", () => {
    const correo = facturaEmitida({
      display_id: 12,
      uuid: "00000000-0000-4000-8000-000000000001",
      urlPdf: "http://localhost:9000/store/invoices/cfdi_1/pdf",
    })

    expect(correo.subject).toBe("Tu factura del pedido #12")
    expect(correo.html).toContain("00000000-0000-4000-8000-000000000001")
  })
})
