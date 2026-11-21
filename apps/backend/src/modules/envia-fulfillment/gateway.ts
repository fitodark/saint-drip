// Único punto que habla con la API de Envia.com (blueprint §3). service.ts recibe el gateway por constructor.
// Los cuerpos siguen https://docs.envia.com (rate / generate / cancel). Sin probar contra la API real:
// la verificación en vivo es parte del gate de lanzamiento (§20.1).

export type TipoEnvio = "terrestre" | "express"

export type SolicitudCotizacion = {
  origenCp: string
  destinoCp: string
  destinoEstado: string
  pesoKg: number
  largoCm: number
  anchoCm: number
  altoCm: number
}

export type Tarifa = { carrier: string; servicio: string; tipo: TipoEnvio; total: number; dias: string }

export type Direccion = {
  nombre?: string
  telefono?: string
  email?: string
  calle?: string
  ciudad?: string
  estado?: string
  cp: string
  pais?: string
}

export type SolicitudGuia = SolicitudCotizacion & Tarifa & { destino: Direccion }

export type Guia = { tracking: string; carrier: string; etiquetaUrl: string; rastreoUrl: string }

export interface EnviaGateway {
  cotizar(req: SolicitudCotizacion): Promise<Tarifa[]>
  generarGuia(req: SolicitudGuia): Promise<Guia>
  cancelarGuia(tracking: string, carrier: string): Promise<void>
}

// Paqueterías nacionales que se cotizan (Envia cotiza por paquetería).
const CARRIERS = ["dhl", "estafeta", "fedex", "redpack"]

// Envia no marca "express" con un booleano; se clasifica por el nombre/descripción del servicio.
const PATRON_EXPRESS = /express|next.?day|dia.?siguiente|día.?siguiente|aereo|aéreo|air|overnight|priority|saver/i

export function clasificarServicio(servicio: string, descripcion = ""): TipoEnvio {
  return PATRON_EXPRESS.test(`${servicio} ${descripcion}`) ? "express" : "terrestre"
}

export function crearEnviaGateway({
  token,
  environment,
}: {
  token: string
  environment: "sandbox" | "production"
}): EnviaGateway {
  const base = environment === "production" ? "https://api.envia.com" : "https://api-test.envia.com"

  const post = async <T>(ruta: string, cuerpo: unknown): Promise<T> => {
    const respuesta = await fetch(`${base}${ruta}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(cuerpo),
    })
    const json = (await respuesta.json().catch(() => ({}))) as T & { meta?: string; error?: { message?: string } }
    if (!respuesta.ok || json.meta === "error") {
      throw new Error(`Envia ${ruta} → ${respuesta.status} ${json.error?.message ?? ""}`.trim())
    }
    return json
  }

  const paquete = (req: SolicitudCotizacion) => ({
    content: "Ropa y accesorios",
    amount: 1,
    type: "box",
    weight: Math.max(req.pesoKg, 0.1),
    weightUnit: "KG",
    lengthUnit: "CM",
    dimensions: { length: req.largoCm, width: req.anchoCm, height: req.altoCm },
  })

  return {
    async cotizar(req) {
      const tarifas: Tarifa[] = []
      for (const carrier of CARRIERS) {
        type Respuesta = {
          data?: { carrier: string; service: string; serviceDescription?: string; totalPrice: number | string; deliveryEstimate?: string }[]
        }
        const json = await post<Respuesta>("/ship/rate/", {
          origin: { postalCode: req.origenCp, country: "MX" },
          destination: { postalCode: req.destinoCp, state: req.destinoEstado, country: "MX" },
          packages: [paquete(req)],
          shipment: { carrier, type: 1 },
        }).catch(() => ({ data: [] }) as Respuesta)
        for (const t of json.data ?? []) {
          tarifas.push({
            carrier: t.carrier,
            servicio: t.service,
            tipo: clasificarServicio(t.service, t.serviceDescription),
            total: Number(t.totalPrice),
            dias: t.deliveryEstimate ?? "",
          })
        }
      }
      return tarifas
    },

    async generarGuia(req) {
      type Respuesta = { data?: { trackingNumber: string; label: string; trackUrl?: string }[] }
      const json = await post<Respuesta>("/ship/generate/", {
        origin: { postalCode: req.origenCp, country: "MX" },
        destination: {
          name: req.destino.nombre,
          phone: req.destino.telefono,
          email: req.destino.email,
          street: req.destino.calle,
          city: req.destino.ciudad,
          state: req.destino.estado ?? req.destinoEstado,
          postalCode: req.destino.cp,
          country: req.destino.pais ?? "MX",
        },
        packages: [paquete(req)],
        shipment: { carrier: req.carrier, service: req.servicio, type: 1 },
        settings: { printFormat: "PDF", printSize: "PAPER_4X6" },
      })
      const guia = json.data?.[0]
      if (!guia?.trackingNumber) throw new Error("Envia no devolvió la guía")
      return {
        tracking: guia.trackingNumber,
        carrier: req.carrier,
        etiquetaUrl: guia.label,
        rastreoUrl: guia.trackUrl ?? `https://envia.com/rastreo?label=${guia.trackingNumber}`,
      }
    },

    async cancelarGuia(tracking, carrier) {
      await post("/ship/cancel/", { carrier, trackingNumber: tracking })
    },
  }
}

export function crearEnviaGatewayMock(): EnviaGateway {
  return {
    async cotizar() {
      return [
        { carrier: "mock", servicio: "ground", tipo: "terrestre", total: 149, dias: "3-5" },
        { carrier: "mock", servicio: "express", tipo: "express", total: 249, dias: "1-2" },
      ]
    },
    async generarGuia() {
      return {
        tracking: "MOCK123456",
        carrier: "mock",
        etiquetaUrl: "http://localhost:9000/static/guia-mock.pdf",
        rastreoUrl: "https://envia.com/rastreo?label=MOCK123456",
      }
    },
    async cancelarGuia() {},
  }
}
