import fs from "fs"
import path from "path"
import { buildPlantilla, COLUMNAS } from "../columns"
import { leerExcel } from "../parse"
import { emparejarFotos } from "../photos"
import { validarCatalogo } from "../validate"

const fixture = (nombre: string) => fs.readFileSync(path.join(__dirname, "../__fixtures__", nombre))

const tripletas = (errores: { fila: number; columna: string; codigo: string }[]) =>
  errores.map((e) => [e.fila, e.columna, e.codigo])

describe("carga masiva — librería", () => {
  it("plantilla-valida.xlsx: cero errores, 3 productos y 8 variantes", async () => {
    const resultado = validarCatalogo(await leerExcel(fixture("plantilla-valida.xlsx")))

    expect(resultado.errores).toEqual([])
    expect(resultado.valido).toBe(true)
    expect(resultado.productos).toHaveLength(3)
    expect(resultado.productos.reduce((n, p) => n + p.variantes.length, 0)).toBe(8)

    const hoodie = resultado.productos.find((p) => p.handle === "sd-hoodie-oversize-negro")!
    expect(hoodie.variantes).toHaveLength(4)
    expect(hoodie.variantes.every((v) => v.precio === 1299)).toBe(true)
    expect(hoodie.variantes.find((v) => v.valorOpcion === "M")!.existencia).toBe(8)

    const perfume = resultado.productos.find((p) => p.handle === "sd-perfume-noir-100")!
    expect(perfume.soloTerrestre).toBe(true)
    expect(perfume.estado).toBe("draft")
  })

  it("plantilla-con-errores.xlsx: las 6 tripletas en orden", async () => {
    const resultado = validarCatalogo(await leerExcel(fixture("plantilla-con-errores.xlsx")))

    expect(resultado.valido).toBe(false)
    expect(tripletas(resultado.errores)).toEqual([
      [3, "categoria", "E_INCONSISTENTE"],
      [4, "sku", "E_SKU_DUPLICADO"],
      [5, "precio_mxn", "E_PRECIO"],
      [6, "categoria", "E_CATEGORIA"],
      [7, "valor_opcion", "E_VALOR_OPCION"],
      [8, "existencia", "E_EXISTENCIA"],
    ])
  })

  it("handle existente: E_HANDLE_EXISTE en cada fila del handle", async () => {
    const leido = await leerExcel(fixture("plantilla-valida.xlsx"))
    const resultado = validarCatalogo({ ...leido, handlesExistentes: new Set(["sd-tenis-urban-blanco"]) })

    expect(tripletas(resultado.errores)).toEqual([
      [6, "handle", "E_HANDLE_EXISTE"],
      [7, "handle", "E_HANDLE_EXISTE"],
      [8, "handle", "E_HANDLE_EXISTE"],
    ])
  })

  it("encabezados alterados: un solo E_COLUMNAS en fila 1, columna precio_mxn", async () => {
    const leido = await leerExcel(fixture("plantilla-valida.xlsx"))
    const encabezados = [...leido.encabezados]
    encabezados[7] = "precio"
    const resultado = validarCatalogo({ ...leido, encabezados })

    expect(tripletas(resultado.errores)).toEqual([[1, "precio_mxn", "E_COLUMNAS"]])
  })

  it("variante repetida: E_VARIANTE_DUPLICADA", async () => {
    const leido = await leerExcel(fixture("plantilla-valida.xlsx"))
    const tallaM = leido.filas.find(
      (f) => f.valores.handle === "sd-hoodie-oversize-negro" && f.valores.valor_opcion === "M"
    )!
    const copia = { fila: 10, valores: { ...tallaM.valores, sku: "SD-HOOD-NEG-M2" } }
    const resultado = validarCatalogo({ ...leido, filas: [...leido.filas, copia] })

    expect(tripletas(resultado.errores)).toEqual([[10, "valor_opcion", "E_VARIANTE_DUPLICADA"]])
  })

  it("fotos: ordena por n, lista faltantes y sin usar", () => {
    const resultado = emparejarFotos(
      ["sd-hoodie-oversize-negro", "sd-tenis-urban-blanco", "sd-perfume-noir-100"],
      ["sd-hoodie-oversize-negro-2.jpg", "sd-hoodie-oversize-negro-1.jpg", "sd-tenis-urban-blanco-1.jpg", "foto-suelta.jpg"]
    )

    expect(resultado.faltantes).toEqual(["sd-perfume-noir-100"])
    expect(resultado.sinUsar).toEqual(["foto-suelta.jpg"])
    expect(resultado.porHandle["sd-hoodie-oversize-negro"]).toEqual([
      "sd-hoodie-oversize-negro-1.jpg",
      "sd-hoodie-oversize-negro-2.jpg",
    ])
  })

  it("plantilla generada: encabezados = COLUMNAS y cero filas", async () => {
    const leido = await leerExcel(await buildPlantilla())

    expect(leido.encabezados).toEqual([...COLUMNAS])
    expect(leido.filas).toEqual([])
  })
})
