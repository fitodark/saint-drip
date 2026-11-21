// Proveedor de pago PayPal (Orders v2) — blueprint paso 7. PayPal recibe montos como string con 2 decimales.
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
import { crearPayPalGateway, crearPayPalGatewayMock, type PayPalGateway } from "./gateway"

export type PayPalOptions = {
  environment: "mock" | "sandbox" | "live"
  clientId?: string
  clientSecret?: string
  webhookId?: string
}

const montoPayPal = (monto: unknown) => Number(monto).toFixed(2)

class PayPalPaymentService extends AbstractPaymentProvider<PayPalOptions> {
  static identifier = "paypal"

  protected readonly gateway_: PayPalGateway

  constructor(container: Record<string, unknown>, options: PayPalOptions, deps?: { gateway?: PayPalGateway }) {
    super(container, options)
    if (deps?.gateway) {
      this.gateway_ = deps.gateway
    } else if (options.environment === "sandbox" || options.environment === "live") {
      this.gateway_ = crearPayPalGateway({
        environment: options.environment,
        clientId: options.clientId ?? "",
        clientSecret: options.clientSecret ?? "",
        webhookId: options.webhookId,
      })
    } else {
      this.gateway_ = crearPayPalGatewayMock()
    }
  }

  private ordenId(data?: Record<string, unknown>): string {
    const id = data?.paypal_order_id
    if (typeof id !== "string" || id === "") {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Falta paypal_order_id en la sesión PayPal")
    }
    return id
  }

  async initiatePayment({ amount, data }: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const { id } = await this.gateway_.crearOrden(montoPayPal(amount), String(data?.session_id ?? ""))
    return { id, data: { paypal_order_id: id } }
  }

  async authorizePayment({ data }: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const id = this.ordenId(data)
    const estado = await this.gateway_.estadoOrden(id)
    if (estado === "APPROVED") {
      const captura = await this.gateway_.capturarOrden(id)
      if (captura.status === "COMPLETED") {
        return { status: "captured", data: { ...data, capture_id: captura.captureId } }
      }
      return { status: "error", data }
    }
    if (estado === "CREATED") return { status: "pending", data }
    return { status: "error", data }
  }

  // authorizePayment ya captura; aquí solo se completa si la sesión llegó sin captura.
  async capturePayment({ data }: CapturePaymentInput): Promise<CapturePaymentOutput> {
    if (typeof data?.capture_id === "string") return { data }
    const captura = await this.gateway_.capturarOrden(this.ordenId(data))
    return { data: { ...data, capture_id: captura.captureId } }
  }

  async cancelPayment({ data }: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data }
  }

  async refundPayment({ amount, data }: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const captureId = data?.capture_id
    if (typeof captureId !== "string") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "El pago PayPal no tiene captura que reembolsar")
    }
    const reembolso = await this.gateway_.reembolsar(captureId, montoPayPal(amount))
    return { data: { ...data, refund_id: reembolso.id } }
  }

  async getPaymentStatus({ data }: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const estado = await this.gateway_.estadoOrden(this.ordenId(data))
    if (estado === "COMPLETED") return { status: "captured", data }
    if (estado === "APPROVED") return { status: "authorized", data }
    if (estado === "CREATED") return { status: "pending", data }
    if (estado === "VOIDED") return { status: "canceled", data }
    return { status: "error", data }
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
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(payload.headers ?? {})) headers[k.toLowerCase()] = String(v ?? "")

    const valido = await this.gateway_.verificarWebhook(headers, payload.data).catch(() => false)
    if (!valido) return { action: "failed" }

    const evento = payload.data as {
      event_type?: string
      resource?: { custom_id?: string; amount?: { value?: string } }
    }
    if (evento.event_type === "PAYMENT.CAPTURE.COMPLETED" && evento.resource?.custom_id) {
      return {
        action: "captured",
        data: { session_id: evento.resource.custom_id, amount: Number(evento.resource.amount?.value) },
      }
    }
    return { action: "not_supported" }
  }
}

export default PayPalPaymentService
