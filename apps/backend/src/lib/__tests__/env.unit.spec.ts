import { missingProductionEnv, PRODUCTION_REQUIRED, PRODUCTION_VALUES } from "../env"

const completo = (): Record<string, string> => {
  const env: Record<string, string> = {}
  for (const name of PRODUCTION_REQUIRED) env[name] = `valor-${name}`
  env.JWT_SECRET = "a".repeat(32)
  env.COOKIE_SECRET = "b".repeat(32)
  return { ...env, ...PRODUCTION_VALUES }
}

describe("missingProductionEnv", () => {
  it("con {} incluye STRIPE_API_KEY y SPEI_MODE", () => {
    const faltan = missingProductionEnv({})
    expect(faltan).toContain("STRIPE_API_KEY")
    expect(faltan).toContain("SPEI_MODE")
  })

  it("con un entorno completo y válido devuelve []", () => {
    expect(missingProductionEnv(completo())).toEqual([])
  })

  it("con JWT_SECRET de 10 caracteres incluye JWT_SECRET", () => {
    const faltan = missingProductionEnv({ ...completo(), JWT_SECRET: "0123456789" })
    expect(faltan).toContain("JWT_SECRET")
  })
})
