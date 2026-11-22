import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  capturePaymentWorkflow,
  createOrderPaymentCollectionWorkflow,
  createOrderWorkflow,
  createPaymentSessionsWorkflow,
} from "@medusajs/medusa/core-flows"
import seedSaintDrip, { SEED } from "../../src/scripts/seed-saint-drip"

jest.setTimeout(240 * 1000)

const UUID_MOCK = "00000000-0000-4000-8000-000000000001"
const DATOS_FISCALES = {
  rfc: "XAXX010101000",
  razon_social: "PUBLICO EN GENERAL",
  regimen_fiscal: "616",
  codigo_postal: "69000",
  uso_cfdi: "S01",
}

// Sin `inApp`: la opción no existe en @medusajs/test-utils 2.23.0 (desviación D2).
medusaIntegrationTestRunner({
  env: {},
  testSuite: ({ api, getContainer }) => {
    let publishableKey: string
    let regionId: string
    let salesChannelId: string

    const storeHeaders = (token?: string) => ({
      "x-publishable-api-key": publishableKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    })

    const registrarCliente = async (email: string) => {
      const password = "cliente-secreto-123"
      const { data: registro } = await api.post("/auth/customer/emailpass/register", { email, password })
      const { data } = await api.post(
        "/store/customers",
        { email, first_name: "Cliente", last_name: "Prueba" },
        { headers: storeHeaders(registro.token) }
      )
      const { data: login } = await api.post("/auth/customer/emailpass", { email, password })
      return { id: data.customer.id as string, email, token: login.token as string }
    }

    const crearPedido = async (cliente: { id: string; email: string }, capturar: boolean) => {
      const container = getContainer()
      const { result: pedido } = await createOrderWorkflow(container).run({
        input: {
          region_id: regionId,
          customer_id: cliente.id,
          email: cliente.email,
          currency_code: "mxn",
          sales_channel_id: salesChannelId,
          items: [{ title: "Hoodie Oversize Negro", quantity: 1, unit_price: 1299 }],
        },
      })
      if (capturar) {
        const { result: colecciones } = await createOrderPaymentCollectionWorkflow(container).run({
          input: { order_id: pedido.id, amount: 1299 },
        })
        const coleccion = Array.isArray(colecciones) ? colecciones[0] : colecciones
        const { result: sesion } = await createPaymentSessionsWorkflow(container).run({
          input: { payment_collection_id: coleccion.id, provider_id: "pp_system_default" },
        })
        const payment = await container.resolve(Modules.PAYMENT).authorizePaymentSession(sesion.id, {})
        await capturePaymentWorkflow(container).run({ input: { payment_id: payment!.id, amount: 1299 } })
      }
      return pedido.id as string
    }

    const solicitar = (orderId: string, token?: string) =>
      api
        .post("/store/invoices", { order_id: orderId, ...DATOS_FISCALES }, { headers: storeHeaders(token) })
        .catch((e: any) => e.response)

    beforeEach(async () => {
      const container = getContainer()
      await seedSaintDrip({ container, args: [] } as any)
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const { data: keys } = await query.graph({
        entity: "api_key",
        fields: ["token"],
        filters: { title: SEED.publishableKeyTitle, type: "publishable" },
      })
      publishableKey = keys[0].token
      const { data: regions } = await query.graph({ entity: "region", fields: ["id"], filters: { name: SEED.region } })
      regionId = regions[0].id
      const { data: canales } = await query.graph({
        entity: "sales_channel",
        fields: ["id"],
        filters: { name: SEED.salesChannel },
      })
      salesChannelId = canales[0].id
    })

    describe("POST /store/invoices", () => {
      it("el dueño de un pedido pagado del mes obtiene 201 con el uuid", async () => {
        const cliente = await registrarCliente("dueno@example.com")
        const pedidoId = await crearPedido(cliente, true)

        const respuesta = await solicitar(pedidoId, cliente.token)
        expect(respuesta.status).toEqual(201)
        expect(respuesta.data.uuid).toEqual(UUID_MOCK)

        const facturapi: any = getContainer().resolve("facturapi")
        const cfdis = await facturapi.listCfdiInvoices({ order_id: pedidoId })
        expect(cfdis).toHaveLength(1)
        expect(cfdis[0].kind).toEqual("individual")
      })

      it("una segunda solicitud responde 409 E_YA_FACTURADO", async () => {
        const cliente = await registrarCliente("dueno2@example.com")
        const pedidoId = await crearPedido(cliente, true)
        expect((await solicitar(pedidoId, cliente.token)).status).toEqual(201)

        const segunda = await solicitar(pedidoId, cliente.token)
        expect(segunda.status).toEqual(409)
        expect(segunda.data.codigo).toEqual("E_YA_FACTURADO")
      })

      it("otro cliente recibe 403 E_NO_ES_TU_PEDIDO", async () => {
        const dueno = await registrarCliente("dueno3@example.com")
        const otro = await registrarCliente("otro@example.com")
        const pedidoId = await crearPedido(dueno, true)

        const respuesta = await solicitar(pedidoId, otro.token)
        expect(respuesta.status).toEqual(403)
        expect(respuesta.data.codigo).toEqual("E_NO_ES_TU_PEDIDO")
      })

      it("un pedido sin pago capturado responde 422 E_PAGO_PENDIENTE", async () => {
        const cliente = await registrarCliente("pendiente@example.com")
        const pedidoId = await crearPedido(cliente, false)

        const respuesta = await solicitar(pedidoId, cliente.token)
        expect(respuesta.status).toEqual(422)
        expect(respuesta.data.codigo).toEqual("E_PAGO_PENDIENTE")
      })

      it("sin autenticación responde 401", async () => {
        const respuesta = await solicitar("order_cualquiera")
        expect(respuesta.status).toEqual(401)
      })
    })
  },
})
