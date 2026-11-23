// URLs de imágenes del proveedor de archivos local de Medusa (`/static/...`, solo desarrollo y QA sin R2).
// Medusa guarda la URL completa con el MEDUSA_BACKEND_URL del momento de la subida (p. ej. localhost:9000),
// que no existe para otro dispositivo de la red. Se reescribe al backend configurado en este entorno.
// Las URLs de R2 u otros dominios no cambian.
const BACKEND = (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")

const ESTATICO = /^https?:\/\/[^/]+\/static\/(.+)$/

export function urlImagen<T extends string | null | undefined>(url: T): T {
  if (!url) return url
  const m = url.match(ESTATICO)
  return (m ? `${BACKEND}/static/${m[1]}` : url) as T
}
