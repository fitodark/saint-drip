import { HttpTypes } from "@medusajs/types"
import { Text } from "@modules/common/components/ui"


// D21: estados de Medusa en español.
const ESTADOS: Record<string, string> = {
  not_fulfilled: "Sin enviar",
  partially_fulfilled: "Enviado en parte",
  fulfilled: "Preparado",
  partially_shipped: "Enviado en parte",
  shipped: "Enviado",
  partially_delivered: "Entregado en parte",
  delivered: "Entregado",
  canceled: "Cancelado",
  requires_action: "Requiere acción",
  not_paid: "Sin pagar",
  awaiting: "Pendiente de pago",
  authorized: "Autorizado",
  partially_authorized: "Autorizado en parte",
  captured: "Pagado",
  partially_captured: "Pagado en parte",
  refunded: "Reembolsado",
  partially_refunded: "Reembolsado en parte",
}

type OrderDetailsProps = {
  order: HttpTypes.StoreOrder
  showStatus?: boolean
}

const OrderDetails = ({ order, showStatus }: OrderDetailsProps) => {
  const formatStatus = (str: string) => ESTADOS[str] ?? str.split("_").join(" ")

  return (
    <div>
      <Text>
        Enviamos la confirmación del pedido a{" "}
        <span
          className="text-ui-fg-medium-plus font-semibold"
          data-testid="order-email"
        >
          {order.email}
        </span>
        .
      </Text>
      <Text className="mt-2">
        Fecha del pedido:{" "}
        <span data-testid="order-date">
          {new Date(order.created_at).toLocaleDateString("es-MX")}
        </span>
      </Text>
      <Text className="mt-2 text-ui-fg-interactive">
        Número de pedido: <span data-testid="order-id">{order.display_id}</span>
      </Text>

      <div className="flex items-center text-compact-small gap-x-4 mt-4">
        {showStatus && (
          <>
            <Text>
              Estado del pedido:{" "}
              <span className="text-ui-fg-subtle " data-testid="order-status">
                {formatStatus(order.fulfillment_status)}
              </span>
            </Text>
            <Text>
              Estado del pago:{" "}
              <span
                className="text-ui-fg-subtle "
                sata-testid="order-payment-status"
              >
                {formatStatus(order.payment_status)}
              </span>
            </Text>
          </>
        )}
      </div>
    </div>
  )
}

export default OrderDetails
