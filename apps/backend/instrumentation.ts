// Errores del backend con Sentry (blueprint paso 18). Sin SENTRY_DSN no se inicializa nada.
import * as Sentry from "@sentry/node"

export function register() {
  if (!process.env.SENTRY_DSN) return
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // D19: @sentry/node 11 reemplazó `sendDefaultPii` por `dataCollection`, cuyos defaults recolectan usuario,
    // cookies, cabeceras, cuerpos HTTP, query params y datos de consultas. Equivalente a sendDefaultPii: false
    // (y a la regla de no registrar RFC, llaves ni bodies de webhooks): todo apagado.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
    },
  })
}
