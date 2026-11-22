import { construirFacturaGlobal, periodoAnterior, periodoDe, validarSolicitud } from "../reglas"

const pedidoBase = {
  customer_id: "cus_1",
  created_at: new Date("2026-11-15T18:00:00Z"),
  pago_capturado: true,
  ya_facturado: false,
}

describe("reglas CFDI", () => {
  it("periodoDe usa la hora de Ciudad de México (aún es 30 de noviembre)", () => {
    expect(periodoDe(new Date("2026-12-01T05:30:00Z"))).toBe("2026-11")
  })

  it("periodoAnterior el 1 de enero de 2027 es diciembre de 2026", () => {
    expect(periodoAnterior(new Date("2027-01-01T09:00:00Z"))).toEqual({ periodo: "2026-12", mes: "12", anio: 2026 })
  })

  it("construirFacturaGlobal sin pedidos devuelve null", () => {
    expect(construirFacturaGlobal([], { mes: "11", anio: 2026 })).toBeNull()
  })

  it("construirFacturaGlobal con 2 pedidos arma la factura al público en general", () => {
    const cfdi = construirFacturaGlobal(
      [
        { id: "order_1", display_id: 101, total: 1299 },
        { id: "order_2", display_id: 102, total: 899 },
      ],
      { mes: "11", anio: 2026 }
    )

    expect(cfdi).not.toBeNull()
    expect(cfdi!.items).toEqual([
      { descripcion: "Venta pedido #101", precio: 1299, cantidad: 1 },
      { descripcion: "Venta pedido #102", precio: 899, cantidad: 1 },
    ])
    expect(cfdi!.receptor.rfc).toBe("XAXX010101000")
    expect(cfdi!.uso_cfdi).toBe("S01")
    expect(cfdi!.global).toEqual({ periodicidad: "month", mes: "11", anio: 2026 })
  })

  it("validarSolicitud sobre un pedido ajeno responde 403", () => {
    const falla = validarSolicitud({ pedido: pedidoBase, cliente_id: "cus_otro", ahora: new Date("2026-11-21T18:00:00Z") })
    expect(falla).toEqual(expect.objectContaining({ status: 403, codigo: "E_NO_ES_TU_PEDIDO" }))
  })

  it("un pedido del mes anterior responde E_FUERA_DE_PERIODO", () => {
    const falla = validarSolicitud({
      pedido: { ...pedidoBase, created_at: new Date("2026-10-20T18:00:00Z") },
      cliente_id: "cus_1",
      ahora: new Date("2026-11-21T18:00:00Z"),
    })
    expect(falla).toEqual(expect.objectContaining({ status: 422, codigo: "E_FUERA_DE_PERIODO" }))
  })
})
