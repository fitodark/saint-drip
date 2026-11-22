import { pedidosSinPago, speiVencidos } from "../reconciliacion"

const AHORA = new Date("2026-11-21T18:00:00Z")
const AYER = "2026-11-20T18:00:00.000Z"
const MANANA = "2026-11-22T18:00:00.000Z"

describe("conciliación de pagos", () => {
  it("un SPEI vencido sin capturar se incluye", () => {
    expect(speiVencidos([{ order_id: "order_1", provider_id: "pp_spei_spei", captured: false, vence_en: AYER }], AHORA)).toEqual([
      "order_1",
    ])
  })

  it("un SPEI vencido pero capturado se excluye", () => {
    expect(speiVencidos([{ order_id: "order_1", provider_id: "pp_spei_spei", captured: true, vence_en: AYER }], AHORA)).toEqual([])
  })

  it("un SPEI que aún no vence se excluye", () => {
    expect(speiVencidos([{ order_id: "order_1", provider_id: "pp_spei_spei", captured: false, vence_en: MANANA }], AHORA)).toEqual(
      []
    )
  })

  it("un pedido con tarjeta sin pago después de 2 h aparece en pedidosSinPago", () => {
    const hace2h = new Date(AHORA.getTime() - 2 * 60 * 60 * 1000)
    expect(
      pedidosSinPago(
        [
          { id: "order_tarjeta", created_at: hace2h, tiene_pago_capturado: false, proveedor: "pp_stripe_stripe" },
          { id: "order_pagado", created_at: hace2h, tiene_pago_capturado: true, proveedor: "pp_stripe_stripe" },
          { id: "order_spei", created_at: hace2h, tiene_pago_capturado: false, proveedor: "pp_spei_spei" },
        ],
        AHORA
      )
    ).toEqual(["order_tarjeta"])
  })
})
