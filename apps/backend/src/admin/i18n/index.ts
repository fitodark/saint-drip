import { en } from "./en"
import { es } from "./es"

// D22: el admin abre en español por defecto. El detector de idioma del dashboard busca la cookie
// `lng`, luego localStorage `lng`, y si no hay ninguna cae a "en". Este módulo se carga antes de
// que i18n arranque, así que fijamos "es" solo cuando el usuario todavía no eligió idioma; si lo
// cambia en Perfil → Idioma, el dashboard guarda su elección y aquí se respeta.
if (typeof window !== "undefined") {
  try {
    const tieneCookie = document.cookie.split(";").some((c) => c.trim().startsWith("lng="))
    if (!tieneCookie && !window.localStorage.getItem("lng")) {
      window.localStorage.setItem("lng", "es")
    }
  } catch {
    // localStorage bloqueado: el dashboard usa su idioma de respaldo.
  }
}

export default {
  es: { translation: es },
  en: { translation: en },
}
