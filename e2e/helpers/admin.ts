// Helpers de admin para los E2E (pasos 5 y 15–17). Hablan con el backend en :9000.
import fs from "fs"
import path from "path"
import type { APIRequestContext, Page } from "@playwright/test"

export const BACKEND_URL = "http://localhost:9000"
export const ADMIN = { email: "admin@saintdrip.local", password: "saintdrip-dev" }
export const HANDLES_FIXTURE = ["sd-hoodie-oversize-negro", "sd-tenis-urban-blanco", "sd-perfume-noir-100"]

const FIXTURES = path.join(__dirname, "..", "fixtures")
export const EXCEL_VALIDO = path.join(FIXTURES, "plantilla-valida.xlsx")
export const CARPETA_FOTOS = path.join(FIXTURES, "fotos")
export const fotosFixture = () =>
  fs
    .readdirSync(CARPETA_FOTOS)
    .filter((n) => n.endsWith(".jpg"))
    .sort()
    .map((n) => path.join(CARPETA_FOTOS, n))

export async function tokenAdmin(request: APIRequestContext): Promise<string> {
  const respuesta = await request.post(`${BACKEND_URL}/auth/user/emailpass`, { data: ADMIN })
  if (!respuesta.ok()) throw new Error(`Login de admin falló: ${respuesta.status()} ${await respuesta.text()}`)
  const { token } = await respuesta.json()
  return token
}

// page.request comparte las cookies con la página: tras /auth/session el admin queda con sesión.
export async function iniciarSesionAdmin(page: Page): Promise<void> {
  const token = await tokenAdmin(page.request)
  const sesion = await page.request.post(`${BACKEND_URL}/auth/session`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!sesion.ok()) throw new Error(`No se pudo abrir la sesión de admin: ${sesion.status()}`)
}

export async function borrarProductosFixture(request: APIRequestContext): Promise<void> {
  const headers = { Authorization: `Bearer ${await tokenAdmin(request)}` }
  for (const handle of HANDLES_FIXTURE) {
    const lista = await request.get(`${BACKEND_URL}/admin/products?handle=${handle}`, { headers })
    if (!lista.ok()) throw new Error(`GET /admin/products falló: ${lista.status()}`)
    const { products } = await lista.json()
    for (const producto of products as { id: string }[]) {
      const borrado = await request.delete(`${BACKEND_URL}/admin/products/${producto.id}`, { headers })
      if (!borrado.ok()) throw new Error(`DELETE /admin/products/${producto.id} falló: ${borrado.status()}`)
    }
  }
}

export async function importarFixture(request: APIRequestContext): Promise<{ creados: number; handles: string[] }> {
  const headers = { Authorization: `Bearer ${await tokenAdmin(request)}` }
  const fotos: Record<string, string> = {}
  for (const archivo of fotosFixture()) {
    const nombre = path.basename(archivo)
    const subida = await request.post(`${BACKEND_URL}/admin/uploads`, {
      headers,
      multipart: { files: { name: nombre, mimeType: "image/jpeg", buffer: fs.readFileSync(archivo) } },
    })
    if (!subida.ok()) throw new Error(`POST /admin/uploads falló: ${subida.status()} ${await subida.text()}`)
    const { files } = await subida.json()
    fotos[nombre] = files[0].url
  }
  const respuesta = await request.post(`${BACKEND_URL}/admin/catalog-import/importar`, {
    headers,
    data: { archivo_base64: fs.readFileSync(EXCEL_VALIDO).toString("base64"), fotos },
  })
  if (!respuesta.ok()) throw new Error(`importar falló: ${respuesta.status()} ${await respuesta.text()}`)
  return respuesta.json()
}
