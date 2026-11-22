// Plantillas de correos transaccionales (blueprint paso 12). TypeScript puro: sin dependencias de Medusa.
// Montos en unidades mayores (1448 = $1,448.00 MXN, IVA incluido).

export type Correo = { subject: string; html: string; text: string }

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" })
const FECHA = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  dateStyle: "long",
  timeStyle: "short",
})

export const formatoMxn = (monto: number) => MXN.format(monto)

const escapar = (texto: unknown) =>
  String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const marco = (titulo: string, cuerpo: string) =>
  `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#F4F4F1;color:#0A0A0A;font-family:Arial,Helvetica,sans-serif">` +
  `<div style="max-width:560px;margin:0 auto;background:#FFFFFF;padding:24px">` +
  `<p style="margin:0 0 16px;font-weight:bold;letter-spacing:2px">SAINT DRIP</p>` +
  `<h1 style="font-size:20px;margin:0 0 16px">${escapar(titulo)}</h1>${cuerpo}</div></body></html>`

const boton = (url: string, texto: string) =>
  `<p style="margin:24px 0"><a href="${escapar(url)}" style="background:#0A0A0A;color:#F4F4F1;padding:12px 20px;text-decoration:none">${escapar(texto)}</a></p>`

export type DatosSpei = { clabe: string; banco: string; referencia: string; vence_en: string }

export function confirmacionPedido(p: {
  display_id: number | string
  email: string
  total: number
  items: { titulo: string; variante: string; cantidad: number; total: number }[]
  urlPedido: string
  spei?: DatosSpei
}): Correo {
  const subject = `Recibimos tu pedido #${p.display_id}`
  const fechaLimite = p.spei ? FECHA.format(new Date(p.spei.vence_en)) : ""

  const filas = p.items
    .map(
      (i) =>
        `<tr><td style="padding:4px 0">${escapar(i.titulo)} · ${escapar(i.variante)} × ${escapar(i.cantidad)}</td>` +
        `<td style="padding:4px 0;text-align:right">${formatoMxn(i.total)}</td></tr>`
    )
    .join("")
  const bloqueSpei = p.spei
    ? `<div style="border:1px solid #0A0A0A;padding:16px;margin:16px 0">` +
      `<p style="margin:0 0 8px;font-weight:bold">Paga por transferencia SPEI</p>` +
      `<p style="margin:0">CLABE: <strong>${escapar(p.spei.clabe)}</strong></p>` +
      `<p style="margin:0">Banco: ${escapar(p.spei.banco)}</p>` +
      `<p style="margin:0">Referencia: <strong>${escapar(p.spei.referencia)}</strong></p>` +
      `<p style="margin:0">Monto exacto: ${formatoMxn(p.total)}</p>` +
      `<p style="margin:8px 0 0">Paga antes de ${escapar(fechaLimite)}</p></div>`
    : ""

  const html = marco(
    subject,
    `<p>Gracias por tu compra. Te escribiremos a ${escapar(p.email)} cuando tu pedido salga.</p>` +
      bloqueSpei +
      `<table style="width:100%;border-collapse:collapse">${filas}` +
      `<tr><td style="padding:8px 0;border-top:1px solid #0A0A0A"><strong>Total (IVA incluido)</strong></td>` +
      `<td style="padding:8px 0;border-top:1px solid #0A0A0A;text-align:right"><strong>${formatoMxn(p.total)}</strong></td></tr></table>` +
      boton(p.urlPedido, "Ver mi pedido")
  )

  const text = [
    subject,
    "",
    ...p.items.map((i) => `${i.titulo} · ${i.variante} × ${i.cantidad}: ${formatoMxn(i.total)}`),
    `Total (IVA incluido): ${formatoMxn(p.total)}`,
    ...(p.spei
      ? [
          "",
          "Paga por transferencia SPEI",
          `CLABE: ${p.spei.clabe}`,
          `Banco: ${p.spei.banco}`,
          `Referencia: ${p.spei.referencia}`,
          `Paga antes de ${fechaLimite}`,
        ]
      : []),
    "",
    `Ver mi pedido: ${p.urlPedido}`,
  ].join("\n")

  return { subject, html, text }
}

export function envioGenerado(p: {
  display_id: number | string
  carrier: string
  tracking: string
  rastreoUrl: string
}): Correo {
  const subject = `Tu pedido #${p.display_id} va en camino`
  const html = marco(
    subject,
    `<p>Tu pedido salió con ${escapar(p.carrier)}.</p>` +
      `<p>Número de rastreo: <strong>${escapar(p.tracking)}</strong></p>` +
      boton(p.rastreoUrl, "Rastrear mi envío")
  )
  const text = [subject, "", `Paquetería: ${p.carrier}`, `Número de rastreo: ${p.tracking}`, `Rastreo: ${p.rastreoUrl}`].join(
    "\n"
  )
  return { subject, html, text }
}

export function facturaEmitida(p: { display_id: number | string; uuid: string; urlPdf: string }): Correo {
  const subject = `Tu factura del pedido #${p.display_id}`
  const html = marco(
    subject,
    `<p>Timbramos tu CFDI 4.0.</p><p>Folio fiscal (UUID): <strong>${escapar(p.uuid)}</strong></p>` +
      boton(p.urlPdf, "Descargar PDF")
  )
  const text = [subject, "", `Folio fiscal (UUID): ${p.uuid}`, `PDF: ${p.urlPdf}`].join("\n")
  return { subject, html, text }
}
