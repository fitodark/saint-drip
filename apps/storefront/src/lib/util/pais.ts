// Nombre del país en español de México a partir de su código ISO; Medusa guarda display_name en inglés.
const regiones = new Intl.DisplayNames(["es-MX"], { type: "region" })

export const nombrePais = (iso2?: string | null, respaldo?: string | null): string => {
  if (!iso2) return respaldo ?? ""
  try {
    return regiones.of(iso2.toUpperCase()) ?? respaldo ?? iso2
  } catch {
    return respaldo ?? iso2
  }
}
