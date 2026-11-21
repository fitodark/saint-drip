// Emparejamiento de fotos {handle}-{n}.jpg con los handles del Excel (blueprint §5).
// TypeScript puro: sin dependencias de Medusa.

export const PATRON_FOTO = /^(.+)-(\d+)\.(jpg|jpeg)$/

export function emparejarFotos(
  handles: string[],
  nombres: string[]
): { porHandle: Record<string, string[]>; faltantes: string[]; sinUsar: string[] } {
  const conocidos = new Set(handles)
  const encontrados: Record<string, { nombre: string; n: number }[]> = {}
  const sinUsar: string[] = []

  for (const nombre of nombres) {
    const m = nombre.match(PATRON_FOTO)
    if (!m || !conocidos.has(m[1])) {
      sinUsar.push(nombre)
      continue
    }
    ;(encontrados[m[1]] ??= []).push({ nombre, n: Number(m[2]) })
  }

  const porHandle: Record<string, string[]> = {}
  const faltantes: string[] = []
  for (const handle of handles) {
    if (handle in porHandle) continue
    const fotos = (encontrados[handle] ?? []).sort((a, b) => a.n - b.n).map((f) => f.nombre)
    porHandle[handle] = fotos
    if (fotos.length === 0) faltantes.push(handle)
  }

  return { porHandle, faltantes, sinUsar }
}
