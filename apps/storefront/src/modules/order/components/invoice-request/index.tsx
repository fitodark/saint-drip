"use client"

// Formulario "Solicitar factura" del detalle del pedido (paso 17). Llama la server action solicitarFactura.
import { solicitarFactura, type ResultadoFactura } from "@lib/data/invoices"
import { useState } from "react"

const REGIMENES = [
  { valor: "601", texto: "601 · General de Ley Personas Morales" },
  { valor: "603", texto: "603 · Personas Morales con Fines no Lucrativos" },
  { valor: "605", texto: "605 · Sueldos y Salarios" },
  { valor: "606", texto: "606 · Arrendamiento" },
  { valor: "612", texto: "612 · Actividades Empresariales y Profesionales" },
  { valor: "616", texto: "616 · Sin obligaciones fiscales" },
  { valor: "621", texto: "621 · Incorporación Fiscal" },
  { valor: "626", texto: "626 · Régimen Simplificado de Confianza" },
]

const USOS = [
  { valor: "G01", texto: "G01 · Adquisición de mercancías" },
  { valor: "G03", texto: "G03 · Gastos en general" },
  { valor: "S01", texto: "S01 · Sin efectos fiscales" },
]

const campo =
  "w-full border border-border-strong bg-surface px-3 py-2 text-base text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"

export default function InvoiceRequest({ orderId }: { orderId: string }) {
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoFactura | null>(null)
  const [emitida, setEmitida] = useState<{ id: string; uuid: string } | null>(null)

  const enviar = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    const datos = new FormData(evento.currentTarget)
    setEnviando(true)
    setResultado(null)
    try {
      const respuesta = await solicitarFactura({
        order_id: orderId,
        rfc: String(datos.get("rfc") ?? "").trim().toUpperCase(),
        razon_social: String(datos.get("razon_social") ?? "").trim(),
        regimen_fiscal: String(datos.get("regimen_fiscal") ?? ""),
        codigo_postal: String(datos.get("codigo_postal") ?? "").trim(),
        uso_cfdi: String(datos.get("uso_cfdi") ?? ""),
      })
      setResultado(respuesta)
      if (respuesta.ok) setEmitida({ id: respuesta.id, uuid: respuesta.uuid })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section aria-labelledby="solicitar-factura" className="flex flex-col gap-y-4 border-t border-border pt-6" data-testid="invoice-request">
      <h2 id="solicitar-factura" className="font-display text-xl font-bold uppercase tracking-[0.06em]">
        Solicitar factura
      </h2>

      {emitida && (
        <div className="flex flex-col gap-y-1 border border-success p-4" data-testid="invoice-issued">
          <p className="font-medium text-success">Factura emitida</p>
          <p>
            Folio fiscal (UUID): <span className="font-mono">{emitida.uuid}</span>
          </p>
          {/* D17: el PDF se descarga por el proxy del storefront, que reenvía la sesión del cliente. */}
          <a
            href={`/api/invoices/${emitida.id}/pdf`}
            className="self-start text-fg underline underline-offset-4 hover:text-fg-muted"
          >
            Descargar PDF
          </a>
        </div>
      )}

      <form onSubmit={enviar} className="grid grid-cols-1 gap-4 small:grid-cols-2" noValidate>
        <div className="flex flex-col gap-y-1">
          <label htmlFor="cfdi-rfc" className="text-sm font-medium">
            RFC
          </label>
          <input id="cfdi-rfc" name="rfc" required minLength={12} maxLength={13} autoComplete="off" className={campo} />
        </div>
        <div className="flex flex-col gap-y-1">
          <label htmlFor="cfdi-razon-social" className="text-sm font-medium">
            Razón social
          </label>
          <input id="cfdi-razon-social" name="razon_social" required autoComplete="organization" className={campo} />
        </div>
        <div className="flex flex-col gap-y-1">
          <label htmlFor="cfdi-regimen" className="text-sm font-medium">
            Régimen fiscal
          </label>
          <select id="cfdi-regimen" name="regimen_fiscal" required defaultValue="616" className={campo}>
            {REGIMENES.map((r) => (
              <option key={r.valor} value={r.valor}>
                {r.texto}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-y-1">
          <label htmlFor="cfdi-cp" className="text-sm font-medium">
            Código postal
          </label>
          <input
            id="cfdi-cp"
            name="codigo_postal"
            required
            inputMode="numeric"
            pattern="\d{5}"
            maxLength={5}
            autoComplete="postal-code"
            className={campo}
          />
        </div>
        <div className="flex flex-col gap-y-1">
          <label htmlFor="cfdi-uso" className="text-sm font-medium">
            Uso del CFDI
          </label>
          <select id="cfdi-uso" name="uso_cfdi" required defaultValue="G03" className={campo}>
            {USOS.map((u) => (
              <option key={u.valor} value={u.valor}>
                {u.texto}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={enviando}
            className="min-h-11 w-full bg-primary px-6 py-3 text-sm font-medium uppercase tracking-[0.06em] text-primary-fg transition-colors duration-[120ms] ease-out hover:bg-fg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando ? "Timbrando…" : "Solicitar factura"}
          </button>
        </div>
      </form>

      {resultado && !resultado.ok && (
        <p role="alert" className="border border-destructive p-3 text-destructive" data-testid="invoice-error">
          {resultado.mensaje}
        </p>
      )}
    </section>
  )
}
