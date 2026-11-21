// Proveedor de pago SPEI sobre transferencias bancarias MX de Stripe (blueprint §5 y paso 6).
// Montos: Medusa usa unidades mayores; la conversión a centavos ocurre solo aquí, al llamar a Stripe.
import { AbstractPaymentProvider, MedusaError } from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import Stripe from "stripe"

export type SpeiOptions = {
  mode: "mock" | "live"
  apiKey?: string
  webhookSecret?: string
  expiresHours: number
}

type PaymentIntentLike = {
  id: string
  status: string
  amount_received?: number
  metadata?: Record<string, string> | null
  next_action?: {
    display_bank_transfer_instructions?: {
      reference?: string | null
      financial_addresses?: { spei?: { clabe?: string; bank_name?: string } | null }[]
    } | null
  } | null
}

// Solo lo que este proveedor usa de Stripe, para que los tests inyecten un doble.
export type StripeLike = {
  customers: { create(params: { email?: string }): Promise<{ id: string }> }
  paymentIntents: {
    create(params: Record<string, unknown>): Promise<PaymentIntentLike>
    retrieve(id: string): Promise<PaymentIntentLike>
    cancel(id: string): Promise<PaymentIntentLike>
  }
  webhooks: {
    constructEvent(payload: string | Buffer, header: string, secret: string): {
      type: string
      data: { object: unknown }
    }
  }
}

const MOCK = { clabe: "000000000000000001", banco: "BANCO DE PRUEBAS", referencia: "SD-MOCK-REF" }

class SpeiPaymentService extends AbstractPaymentProvider<SpeiOptions> {
  static identifier = "spei"

  protected readonly options_: SpeiOptions
  protected readonly stripe_?: StripeLike

  constructor(container: Record<string, unknown>, options: SpeiOptions, deps?: { stripe?: StripeLike }) {
    super(container, options)
    this.options_ = options
    if (deps?.stripe) {
      this.stripe_ = deps.stripe
    } else if (options.mode === "live") {
      this.stripe_ = new Stripe(options.apiKey ?? "") as unknown as StripeLike
    }
  }

  private get esLive(): boolean {
    return this.options_.mode === "live"
  }

  private stripe(): StripeLike {
    if (!this.stripe_) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "SPEI en modo live requiere STRIPE_API_KEY")
    }
    return this.stripe_
  }

  private venceEn(): string {
    return new Date(Date.now() + this.options_.expiresHours * 60 * 60 * 1000).toISOString()
  }

  private intentId(data?: Record<string, unknown>): string {
    const id = data?.payment_intent_id
    if (typeof id !== "string" || id === "") {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Falta payment_intent_id en la sesión SPEI")
    }
    return id
  }

  async initiatePayment({ amount, context, data }: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const sessionId = String(data?.session_id ?? "")
    const monto = Number(amount)

    if (!this.esLive) {
      const payment_intent_id = `pi_mock_${sessionId}`
      return {
        id: payment_intent_id,
        data: { payment_intent_id, ...MOCK, monto, vence_en: this.venceEn() },
      }
    }

    const stripe = this.stripe()
    const email = context?.customer?.email ?? (typeof data?.email === "string" ? data.email : undefined)
    const customer = await stripe.customers.create({ email })
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(monto * 100),
      currency: "mxn",
      customer: customer.id,
      payment_method_types: ["customer_balance"],
      payment_method_data: { type: "customer_balance" },
      payment_method_options: {
        customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "mx_bank_transfer" } },
      },
      confirm: true,
      metadata: { session_id: sessionId },
    })

    const instrucciones = pi.next_action?.display_bank_transfer_instructions
    const spei = instrucciones?.financial_addresses?.[0]?.spei
    return {
      id: pi.id,
      data: {
        payment_intent_id: pi.id,
        clabe: spei?.clabe ?? null,
        banco: spei?.bank_name ?? null,
        referencia: instrucciones?.reference ?? null,
        monto,
        vence_en: this.venceEn(),
      },
    }
  }

  // Las instrucciones ya se emitieron; el dinero se captura con el webhook.
  async authorizePayment({ data }: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    return { status: "authorized", data }
  }

  async capturePayment({ data }: CapturePaymentInput): Promise<CapturePaymentOutput> {
    if (!this.esLive) return { data }
    const pi = await this.stripe().paymentIntents.retrieve(this.intentId(data))
    if (pi.status !== "succeeded") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "La transferencia SPEI aún no se recibe")
    }
    return { data }
  }

  async cancelPayment({ data }: CancelPaymentInput): Promise<CancelPaymentOutput> {
    if (this.esLive) await this.stripe().paymentIntents.cancel(this.intentId(data))
    return { data }
  }

  async refundPayment(_input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El reembolso SPEI se hace por transferencia manual (blueprint §14)"
    )
  }

  async getPaymentStatus({ data }: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    if (!this.esLive) return { status: "authorized", data }
    const pi = await this.stripe().paymentIntents.retrieve(this.intentId(data))
    if (pi.status === "succeeded") return { status: "captured", data }
    if (pi.status === "canceled") return { status: "canceled", data }
    return { status: "authorized", data }
  }

  async retrievePayment({ data }: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data }
  }

  async updatePayment({ data }: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return { data }
  }

  async deletePayment({ data }: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data }
  }

  async getWebhookActionAndData(payload: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult> {
    if (!this.esLive) return { action: "not_supported" }

    let evento: ReturnType<StripeLike["webhooks"]["constructEvent"]>
    try {
      evento = this.stripe().webhooks.constructEvent(
        payload.rawData,
        String(payload.headers["stripe-signature"] ?? ""),
        this.options_.webhookSecret ?? ""
      )
    } catch {
      return { action: "failed" }
    }

    if (evento.type === "payment_intent.succeeded") {
      const pi = evento.data.object as PaymentIntentLike
      const sessionId = pi.metadata?.session_id
      if (sessionId) {
        return { action: "captured", data: { session_id: sessionId, amount: (pi.amount_received ?? 0) / 100 } }
      }
    }
    return { action: "not_supported" }
  }
}

export default SpeiPaymentService
