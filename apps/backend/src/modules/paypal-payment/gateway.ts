// Único punto que habla con la API de PayPal (blueprint §3). service.ts recibe el gateway por constructor.
import {
  CheckoutPaymentIntent,
  Client,
  ClientCredentialsAuthManager,
  Environment,
  OrdersController,
  PaymentsController,
  type OAuthToken,
} from "@paypal/paypal-server-sdk"

export type EstadoOrden = "CREATED" | "APPROVED" | "COMPLETED" | "VOIDED" | string

export interface PayPalGateway {
  crearOrden(montoMxn: string, sessionId: string): Promise<{ id: string }>
  estadoOrden(id: string): Promise<EstadoOrden>
  capturarOrden(id: string): Promise<{ captureId: string; status: string }>
  reembolsar(captureId: string, montoMxn: string): Promise<{ id: string }>
  verificarWebhook(headers: Record<string, string>, body: unknown): Promise<boolean>
}

export type PayPalGatewayOptions = {
  environment: "sandbox" | "live"
  clientId: string
  clientSecret: string
  webhookId?: string
}

export function crearPayPalGateway(opts: PayPalGatewayOptions): PayPalGateway {
  const client = new Client({
    clientCredentialsAuthCredentials: { oAuthClientId: opts.clientId, oAuthClientSecret: opts.clientSecret },
    environment: opts.environment === "live" ? Environment.Production : Environment.Sandbox,
  })
  const orders = new OrdersController(client)
  const payments = new PaymentsController(client)
  const auth = new ClientCredentialsAuthManager(
    { oAuthClientId: opts.clientId, oAuthClientSecret: opts.clientSecret },
    client
  )
  const base = opts.environment === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"
  let token: OAuthToken | undefined

  const accessToken = async () => {
    token = await auth.updateToken(token)
    return token.accessToken
  }

  return {
    async crearOrden(montoMxn, sessionId) {
      const { result } = await orders.createOrder({
        body: {
          intent: CheckoutPaymentIntent.Capture,
          purchaseUnits: [{ amount: { currencyCode: "MXN", value: montoMxn }, customId: sessionId }],
        },
      })
      if (!result.id) throw new Error("PayPal no devolvió el id de la orden")
      return { id: result.id }
    },

    async estadoOrden(id) {
      const { result } = await orders.getOrder({ id })
      return result.status ?? "UNKNOWN"
    },

    async capturarOrden(id) {
      const { result } = await orders.captureOrder({ id })
      const captura = result.purchaseUnits?.[0]?.payments?.captures?.[0]
      if (!captura?.id) throw new Error("PayPal no devolvió la captura de la orden")
      return { captureId: captura.id, status: captura.status ?? result.status ?? "UNKNOWN" }
    },

    async reembolsar(captureId, montoMxn) {
      const { result } = await payments.refundCapturedPayment({
        captureId,
        body: { amount: { currencyCode: "MXN", value: montoMxn } },
      })
      if (!result.id) throw new Error("PayPal no devolvió el id del reembolso")
      return { id: result.id }
    },

    async verificarWebhook(headers, body) {
      if (!opts.webhookId) return false
      const respuesta = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await accessToken()}` },
        body: JSON.stringify({
          auth_algo: headers["paypal-auth-algo"],
          cert_url: headers["paypal-cert-url"],
          transmission_id: headers["paypal-transmission-id"],
          transmission_sig: headers["paypal-transmission-sig"],
          transmission_time: headers["paypal-transmission-time"],
          webhook_id: opts.webhookId,
          webhook_event: body,
        }),
      })
      if (!respuesta.ok) return false
      const { verification_status } = (await respuesta.json()) as { verification_status?: string }
      return verification_status === "SUCCESS"
    },
  }
}

// Modo mock determinista: nunca sale de la máquina. Un webhook mock no se puede verificar, así que no captura.
export function crearPayPalGatewayMock(): PayPalGateway {
  return {
    async crearOrden() {
      return { id: "PAYPAL-MOCK-ORDER" }
    },
    async estadoOrden() {
      return "APPROVED"
    },
    async capturarOrden() {
      return { captureId: "PAYPAL-MOCK-CAPTURE", status: "COMPLETED" }
    },
    async reembolsar() {
      return { id: "PAYPAL-MOCK-REFUND" }
    },
    async verificarWebhook() {
      return false
    },
  }
}
