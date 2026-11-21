import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Table, Text } from "@medusajs/ui"
import { useMemo, useState } from "react"
import { emparejarFotos, PATRON_FOTO } from "../../../lib/catalog-import/photos"
import { sdk } from "../../lib/sdk"

type ErrorFila = { fila: number; columna: string; codigo: string; mensaje: string }

type Reporte = {
  valido: boolean
  productos: number
  variantes: number
  errores: ErrorFila[]
  fotos_faltantes: string[]
  fotos_sin_usar: string[]
}

type Estado = "inactivo" | "validando" | "importando"

const leerBase64 = (archivo: File) =>
  new Promise<string>((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result).split(",")[1] ?? "")
    lector.onerror = () => reject(lector.error)
    lector.readAsDataURL(archivo)
  })

const ListaFotos = ({ titulo, nombres }: { titulo: string; nombres: string[] }) => (
  <div className="flex flex-col gap-y-1">
    <Text weight="plus">{titulo}</Text>
    {nombres.length === 0 ? (
      <Text className="text-ui-fg-subtle">Ninguna</Text>
    ) : (
      <ul className="list-disc pl-5">
        {nombres.map((n) => (
          <li key={n}>
            <Text>{n}</Text>
          </li>
        ))}
      </ul>
    )}
  </div>
)

const CargaMasivaPage = () => {
  const [excel, setExcel] = useState<File | null>(null)
  const [fotos, setFotos] = useState<File[]>([])
  const [reporte, setReporte] = useState<Reporte | null>(null)
  const [creados, setCreados] = useState<number | null>(null)
  const [estado, setEstado] = useState<Estado>("inactivo")
  const [falla, setFalla] = useState<string | null>(null)

  // Aviso previo: fotos cuyo nombre no sigue {handle}-{n}.jpg nunca se emparejarán con un producto.
  const nombresMalFormados = useMemo(() => {
    const nombres = fotos.map((f) => f.name)
    const handles = nombres.map((n) => n.match(PATRON_FOTO)?.[1]).filter((h): h is string => Boolean(h))
    return emparejarFotos([...new Set(handles)], nombres).sinUsar
  }, [fotos])

  const trabajando = estado !== "inactivo"

  const validar = async () => {
    if (!excel) return
    setEstado("validando")
    setFalla(null)
    setCreados(null)
    try {
      const archivo_base64 = await leerBase64(excel)
      const respuesta = await sdk.client.fetch<Reporte>("/admin/catalog-import/validar", {
        method: "POST",
        body: { archivo_base64, fotos: fotos.map((f) => f.name) },
      })
      setReporte(respuesta)
    } catch (e) {
      setReporte(null)
      setFalla(e instanceof Error ? e.message : "No se pudo validar el archivo")
    } finally {
      setEstado("inactivo")
    }
  }

  const importar = async () => {
    if (!excel || !reporte?.valido) return
    setEstado("importando")
    setFalla(null)
    try {
      const urls: Record<string, string> = {}
      for (const foto of fotos) {
        const { files } = await sdk.admin.upload.create({ files: [foto] })
        urls[foto.name] = files[0].url
      }
      const archivo_base64 = await leerBase64(excel)
      const respuesta = await sdk.client.fetch<{ creados: number; handles: string[] }>(
        "/admin/catalog-import/importar",
        { method: "POST", body: { archivo_base64, fotos: urls } }
      )
      setCreados(respuesta.creados)
      setReporte(null)
    } catch (e) {
      setFalla(e instanceof Error ? e.message : "No se pudo importar el catálogo")
    } finally {
      setEstado("inactivo")
    }
  }

  return (
    <Container className="flex flex-col gap-y-6 p-6">
      <div className="flex items-center justify-between">
        <Heading level="h1">Carga masiva</Heading>
        <a
          href="/admin/catalog-import/plantilla"
          download
          className="text-ui-fg-interactive txt-compact-small-plus hover:underline"
        >
          Descargar plantilla
        </a>
      </div>

      <div className="flex flex-col gap-y-4">
        <label className="flex flex-col gap-y-1">
          <Text weight="plus">Excel</Text>
          <input
            type="file"
            accept=".xlsx"
            aria-label="Archivo Excel (.xlsx)"
            onChange={(e) => {
              setExcel(e.target.files?.[0] ?? null)
              setReporte(null)
              setCreados(null)
            }}
          />
        </label>
        <label className="flex flex-col gap-y-1">
          <Text weight="plus">Fotos</Text>
          <input
            type="file"
            accept=".jpg,.jpeg"
            multiple
            aria-label="Fotos (.jpg)"
            onChange={(e) => {
              setFotos(Array.from(e.target.files ?? []))
              setReporte(null)
              setCreados(null)
            }}
          />
        </label>
        {nombresMalFormados.length > 0 && (
          <Text className="text-ui-fg-error">
            Estos nombres no siguen el formato {"{handle}-{n}.jpg"}: {nombresMalFormados.join(", ")}
          </Text>
        )}
      </div>

      <div className="flex gap-x-2">
        <Button variant="secondary" onClick={validar} disabled={!excel || trabajando}>
          {estado === "validando" ? "Validando…" : "Validar"}
        </Button>
        <Button onClick={importar} disabled={!reporte?.valido || trabajando}>
          {estado === "importando" ? "Importando…" : "Importar"}
        </Button>
      </div>

      {falla && <Text className="text-ui-fg-error">{falla}</Text>}

      {creados !== null && <Text weight="plus">{creados} productos creados</Text>}

      {reporte && (
        <div className="flex flex-col gap-y-4">
          <Text weight="plus">
            {reporte.productos} productos · {reporte.variantes} variantes
          </Text>

          {reporte.errores.length > 0 && (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Fila</Table.HeaderCell>
                  <Table.HeaderCell>Columna</Table.HeaderCell>
                  <Table.HeaderCell>Error</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {reporte.errores.map((e) => (
                  <Table.Row key={`${e.fila}-${e.columna}-${e.codigo}`}>
                    <Table.Cell>{e.fila}</Table.Cell>
                    <Table.Cell>{e.columna}</Table.Cell>
                    <Table.Cell>
                      {e.codigo}: {e.mensaje}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}

          <ListaFotos titulo="Fotos faltantes" nombres={reporte.fotos_faltantes} />
          <ListaFotos titulo="Fotos sin usar" nombres={reporte.fotos_sin_usar} />
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Carga masiva",
})

export default CargaMasivaPage
