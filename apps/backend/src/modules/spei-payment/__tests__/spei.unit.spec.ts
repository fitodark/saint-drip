import { MedusaError } from "@medusajs/framework/utils"
import SpeiPaymentService, { type SpeiOptions, type StripeLike } from "../service"

const OPCIONES: SpeiOptions = { mode: "live", apiKey: "sk_test_x", webhookSecret: "whsec_x", expiresHours: 72 }

const dobleStripe = () => {
  const stripe = {
    customers: { create: jest.fn().mockResolvedValue({ id: "cus_1" }) },
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: "pi_1",
        status: "requires_action",
        next_action: {
          display_bank_transfer_instructions: {
            reference: "REF-123",
            financial_addresses: [{ spei: { clabe: "646180157000000004", bank_name: "STP" } }],
          },
        },
      }),
      retrieve: jest.fn().mockResolvedValue({ id: "pi_1", status: "requires_action" }),
      cancel: jest.fn().mockResolvedValue({ id: "pi_1", status: "canceled" }),
    },
    webhooks: { constructEvent: jest.fn() },
  }
  return stripe as typeof stripe & StripeLike
}

const crear = (opciones: SpeiOptions, stripe?: StripeLike) => new SpeiPaymentService({}, opciones, { stripe })

describe("SpeiPaymentService", () => {
  it("live: initiatePayment crea el PaymentIntent en centavos con mx_bank_transfer y devuelve la CLABE", async () => {
    const stripe = dobleStripe()
    const resultado = await crear(OPCIONES, stripe).initiatePayment({
      amount: 1448,
      currency_code: "mxn",
      context: { customer: { email: "cliente@example.com" } as any },
      data: { session_id: "payses_1" },
    })

    expect(stripe.customers.create).toHaveBeenCalledWith({ email: "cliente@example.com" })
    const params = stripe.paymentIntents.create.mock.calls[0][0]
    expect(params.amount).toBe(144800)
    expect(params.payment_method_options.customer_balance.bank_transfer.type).toBe("mx_bank_transfer")
    expect(params.metadata).toEqual({ session_id: "payses_1" })
    expect(resultado.id).toBe("pi_1")
    expect(resultado.data).toEqual(
      expect.objectContaining({
        payment_intent_id: "pi_1",
        clabe: "646180157000000004",
        banco: "STP",
        referencia: "REF-123",
        monto: 1448,
      })
    )
  })

  it("mock: initiatePayment devuelve la CLABE de prueba", async () => {
    const resultado = await crear({ mode: "mock", expiresHours: 72 }).initiatePayment({
      amount: 1448,
      currency_code: "mxn",
      data: { session_id: "payses_1" },
    })

    expect(resultado.data).toEqual(
      expect.objectContaining({
        clabe: "000000000000000001",
        banco: "BANCO DE PRUEBAS",
        referencia: "SD-MOCK-REF",
        payment_intent_id: "pi_mock_payses_1",
      })
    )
  })

  it("webhook con firma inválida → failed", async () => {
    const stripe = dobleStripe()
    stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error("firma inválida")
    })

    const resultado = await crear(OPCIONES, stripe).getWebhookActionAndData({
      data: {},
      rawData: "{}",
      headers: { "stripe-signature": "t=1,v1=x" },
    })
    expect(resultado).toEqual({ action: "failed" })
  })

  it("webhook payment_intent.succeeded → captured con el monto en unidades mayores", async () => {
    const stripe = dobleStripe()
    stripe.webhooks.constructEvent.mockReturnValue({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_1", status: "succeeded", amount_received: 144800, metadata: { session_id: "payses_1" } } },
    })

    const resultado = await crear(OPCIONES, stripe).getWebhookActionAndData({
      data: {},
      rawData: "{}",
      headers: { "stripe-signature": "t=1,v1=x" },
    })
    expect(resultado).toEqual({ action: "captured", data: { session_id: "payses_1", amount: 1448 } })
  })

  it("capturePayment con un PI en requires_action lanza NOT_ALLOWED", async () => {
    const stripe = dobleStripe()
    const servicio = crear(OPCIONES, stripe)

    await expect(servicio.capturePayment({ data: { payment_intent_id: "pi_1" } })).rejects.toMatchObject({
      type: MedusaError.Types.NOT_ALLOWED,
    })
  })
})
