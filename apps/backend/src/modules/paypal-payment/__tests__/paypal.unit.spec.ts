import PayPalPaymentService from "../service"
import type { PayPalGateway } from "../gateway"

const dobleGateway = () => ({
  crearOrden: jest.fn().mockResolvedValue({ id: "ORDER-1" }),
  estadoOrden: jest.fn().mockResolvedValue("APPROVED"),
  capturarOrden: jest.fn().mockResolvedValue({ captureId: "CAPTURE-1", status: "COMPLETED" }),
  reembolsar: jest.fn().mockResolvedValue({ id: "REFUND-1" }),
  verificarWebhook: jest.fn().mockResolvedValue(true),
})

const crear = (gateway: PayPalGateway) => new PayPalPaymentService({}, { environment: "sandbox" }, { gateway })

describe("PayPalPaymentService", () => {
  it("initiatePayment crea la orden con el monto a 2 decimales", async () => {
    const gateway = dobleGateway()
    const resultado = await crear(gateway).initiatePayment({
      amount: 1448,
      currency_code: "mxn",
      data: { session_id: "payses_1" },
    })

    expect(gateway.crearOrden).toHaveBeenCalledWith("1448.00", "payses_1")
    expect(resultado).toEqual({ id: "ORDER-1", data: { paypal_order_id: "ORDER-1" } })
  })

  it("una orden APPROVED se captura y devuelve captured con capture_id", async () => {
    const gateway = dobleGateway()
    const resultado = await crear(gateway).authorizePayment({ data: { paypal_order_id: "ORDER-1" } })

    expect(gateway.capturarOrden).toHaveBeenCalledWith("ORDER-1")
    expect(resultado.status).toBe("captured")
    expect(resultado.data).toEqual(expect.objectContaining({ capture_id: "CAPTURE-1" }))
  })

  it("una orden CREATED devuelve pending", async () => {
    const gateway = dobleGateway()
    gateway.estadoOrden.mockResolvedValue("CREATED")
    const resultado = await crear(gateway).authorizePayment({ data: { paypal_order_id: "ORDER-1" } })

    expect(resultado.status).toBe("pending")
    expect(gateway.capturarOrden).not.toHaveBeenCalled()
  })

  it("un webhook con firma inválida devuelve failed", async () => {
    const gateway = dobleGateway()
    gateway.verificarWebhook.mockResolvedValue(false)
    const resultado = await crear(gateway).getWebhookActionAndData({
      data: { event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { custom_id: "payses_1", amount: { value: "1448.00" } } },
      rawData: "{}",
      headers: {},
    })

    expect(resultado).toEqual({ action: "failed" })
  })

  it("PAYMENT.CAPTURE.COMPLETED devuelve captured con el monto numérico", async () => {
    const gateway = dobleGateway()
    const resultado = await crear(gateway).getWebhookActionAndData({
      data: { event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { custom_id: "payses_1", amount: { value: "1448.00" } } },
      rawData: "{}",
      headers: { "PayPal-Transmission-Id": "t-1" },
    })

    expect(resultado).toEqual({ action: "captured", data: { session_id: "payses_1", amount: 1448 } })
  })
})
