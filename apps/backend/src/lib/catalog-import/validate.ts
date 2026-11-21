// Validación fila por fila del Excel de carga masiva (blueprint §5, tabla de reglas).
// TypeScript puro: sin dependencias de Medusa.
import { CATEGORIAS, COLUMNAS, TALLAS_ROPA, TIPOS_OPCION, type Columna, type TipoOpcion } from "./columns"
import type { FilaExcel } from "./parse"

export type ErrorFila = { fila: number; columna: string; codigo: string; mensaje: string }

export type VarianteImportada = {
  fila: number
  valorOpcion: string
  sku: string
  precio: number
  existencia: number
  pesoG: number
  largoCm: number
  anchoCm: number
  altoCm: number
}

export type ProductoImportado = {
  handle: string
  titulo: string
  descripcion: string
  categoria: string
  tipoOpcion: string
  soloTerrestre: boolean
  estado: "draft" | "published"
  variantes: VarianteImportada[]
}

export type ResultadoValidacion = { valido: boolean; productos: ProductoImportado[]; errores: ErrorFila[] }

const MENSAJES: Record<string, string> = {
  E_COLUMNAS: "Los encabezados de la hoja Productos no coinciden con la plantilla",
  E_SIN_FILAS: "El archivo no tiene filas con datos",
  E_REQUERIDO: "El valor es obligatorio",
  E_HANDLE: "El handle solo admite minúsculas, números y guiones (máx. 80 caracteres)",
  E_CATEGORIA: "La categoría debe ser ropa, tenis, joyeria, perfumes o accesorios",
  E_TIPO_OPCION: "El tipo de opción debe ser talla_ropa, talla_calzado, contenido_ml, medida o unica",
  E_VALOR_OPCION: "El valor de la opción no es válido para su tipo",
  E_SKU: "El SKU solo admite mayúsculas, números y guiones (3 a 40 caracteres)",
  E_SKU_DUPLICADO: "El SKU ya aparece en una fila anterior del archivo",
  E_PRECIO: "El precio debe ser mayor que 0, con punto decimal y hasta 2 decimales",
  E_EXISTENCIA: "La existencia debe ser un entero mayor o igual a 0",
  E_MEDIDA_PAQUETE: "Peso y medidas deben ser enteros mayores que 0",
  E_SI_NO: "El valor debe ser SI o NO",
  E_ESTADO: "El estado debe ser borrador o publicado",
  E_INCONSISTENTE: "El valor no coincide con la primera fila de este handle",
  E_VARIANTE_DUPLICADA: "Este valor de opción ya existe para el handle",
  E_HANDLE_EXISTE: "Ya existe un producto con este handle en la tienda",
  E_SKU_EXISTE: "Ya existe una variante con este SKU en la tienda",
}

const RE_HANDLE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const RE_SKU = /^[A-Z0-9-]{3,40}$/
const RE_PRECIO = /^\d{1,7}(\.\d{1,2})?$/
const RE_EXISTENCIA = /^\d{1,6}$/
const RE_MEDIDA = /^[1-9]\d{0,5}$/
const RE_CALZADO = /^\d{2}(\.5)?$/
const RE_ML = /^\d{1,4}$/

const CAMPOS_PRODUCTO: Columna[] = ["titulo", "descripcion", "categoria", "tipo_opcion", "solo_terrestre", "estado"]
const MEDIDAS: Columna[] = ["peso_g", "largo_cm", "ancho_cm", "alto_cm"]

const error = (fila: number, columna: string, codigo: string): ErrorFila => ({
  fila,
  columna,
  codigo,
  mensaje: MENSAJES[codigo],
})

export function valorOpcionValido(tipo: string, valor: string): boolean {
  switch (tipo as TipoOpcion) {
    case "talla_ropa":
      return TALLAS_ROPA.includes(valor)
    case "talla_calzado": {
      if (!RE_CALZADO.test(valor)) return false
      const n = Number(valor)
      return n >= 22 && n <= 31
    }
    case "contenido_ml": {
      if (!RE_ML.test(valor)) return false
      const n = Number(valor)
      return n >= 1 && n <= 1000
    }
    case "medida":
      return valor.length <= 20
    case "unica":
      return valor === "Única"
    default:
      return false
  }
}

// contenido_ml se guarda como "{n} ml"; los demás tipos, tal cual.
export function valorOpcionGuardado(tipo: string, valor: string): string {
  return tipo === "contenido_ml" ? `${Number(valor)} ml` : valor
}

export function validarCatalogo(input: {
  encabezados: string[]
  filas: FilaExcel[]
  handlesExistentes?: Set<string>
  skusExistentes?: Set<string>
}): ResultadoValidacion {
  const { encabezados, filas } = input
  const handlesExistentes = input.handlesExistentes ?? new Set<string>()
  const skusExistentes = input.skusExistentes ?? new Set<string>()

  // Encabezados: igual a COLUMNAS, mismo orden. Un solo error en el primer encabezado distinto.
  const largo = Math.max(encabezados.length, COLUMNAS.length)
  for (let i = 0; i < largo; i++) {
    if (encabezados[i] !== COLUMNAS[i]) {
      const columna = COLUMNAS[i] ?? encabezados[i]
      return { valido: false, productos: [], errores: [error(1, columna, "E_COLUMNAS")] }
    }
  }

  if (filas.length === 0) {
    return { valido: false, productos: [], errores: [error(1, "handle", "E_SIN_FILAS")] }
  }

  const errores: ErrorFila[] = []
  const primeraPorHandle = new Map<string, Record<string, string>>()
  const valoresPorHandle = new Map<string, Set<string>>()
  const skusVistos = new Set<string>()

  for (const { fila, valores } of filas) {
    const v = (c: Columna) => valores[c] ?? ""
    const deFila: ErrorFila[] = []
    const agregar = (columna: Columna, codigo: string) => deFila.push(error(fila, columna, codigo))

    for (const columna of COLUMNAS) {
      if (v(columna) === "") agregar(columna, "E_REQUERIDO")
    }
    const lleno = (c: Columna) => v(c) !== ""

    const handle = v("handle")
    if (lleno("handle")) {
      if (handle.length > 80 || !RE_HANDLE.test(handle)) agregar("handle", "E_HANDLE")
      if (handlesExistentes.has(handle)) agregar("handle", "E_HANDLE_EXISTE")
    }
    if (lleno("categoria") && !(CATEGORIAS as readonly string[]).includes(v("categoria"))) {
      agregar("categoria", "E_CATEGORIA")
    }
    const tipoValido = (TIPOS_OPCION as readonly string[]).includes(v("tipo_opcion"))
    if (lleno("tipo_opcion") && !tipoValido) agregar("tipo_opcion", "E_TIPO_OPCION")
    if (lleno("valor_opcion") && tipoValido && !valorOpcionValido(v("tipo_opcion"), v("valor_opcion"))) {
      agregar("valor_opcion", "E_VALOR_OPCION")
    }
    if (lleno("sku")) {
      const sku = v("sku")
      if (!RE_SKU.test(sku)) agregar("sku", "E_SKU")
      if (skusVistos.has(sku)) agregar("sku", "E_SKU_DUPLICADO")
      if (skusExistentes.has(sku)) agregar("sku", "E_SKU_EXISTE")
      skusVistos.add(sku)
    }
    if (lleno("precio_mxn") && (!RE_PRECIO.test(v("precio_mxn")) || Number(v("precio_mxn")) <= 0)) {
      agregar("precio_mxn", "E_PRECIO")
    }
    if (lleno("existencia") && !RE_EXISTENCIA.test(v("existencia"))) agregar("existencia", "E_EXISTENCIA")
    for (const medida of MEDIDAS) {
      if (lleno(medida) && !RE_MEDIDA.test(v(medida))) agregar(medida, "E_MEDIDA_PAQUETE")
    }
    if (lleno("solo_terrestre") && v("solo_terrestre") !== "SI" && v("solo_terrestre") !== "NO") {
      agregar("solo_terrestre", "E_SI_NO")
    }
    if (lleno("estado") && v("estado") !== "borrador" && v("estado") !== "publicado") agregar("estado", "E_ESTADO")

    if (lleno("handle")) {
      const primera = primeraPorHandle.get(handle)
      if (!primera) {
        primeraPorHandle.set(handle, valores)
      } else {
        const distinto = CAMPOS_PRODUCTO.find((c) => (primera[c] ?? "") !== v(c))
        if (distinto) agregar(distinto, "E_INCONSISTENTE")
      }
      if (lleno("valor_opcion")) {
        const vistos = valoresPorHandle.get(handle) ?? new Set<string>()
        if (vistos.has(v("valor_opcion"))) agregar("valor_opcion", "E_VARIANTE_DUPLICADA")
        vistos.add(v("valor_opcion"))
        valoresPorHandle.set(handle, vistos)
      }
    }

    // Todas las fallas de la fila, en orden de columna (orden estable dentro de una columna).
    const indice = (c: string) => (COLUMNAS as readonly string[]).indexOf(c)
    deFila.sort((a, b) => indice(a.columna) - indice(b.columna))
    errores.push(...deFila)
  }

  // Lo que se crearía: handles distintos (en orden de aparición) y una variante por fila.
  const productos: ProductoImportado[] = []
  const porHandle = new Map<string, ProductoImportado>()
  for (const { fila, valores } of filas) {
    const v = (c: Columna) => valores[c] ?? ""
    let producto = porHandle.get(v("handle"))
    if (!producto) {
      producto = {
        handle: v("handle"),
        titulo: v("titulo"),
        descripcion: v("descripcion"),
        categoria: v("categoria"),
        tipoOpcion: v("tipo_opcion"),
        soloTerrestre: v("solo_terrestre") === "SI",
        estado: v("estado") === "publicado" ? "published" : "draft",
        variantes: [],
      }
      porHandle.set(producto.handle, producto)
      productos.push(producto)
    }
    producto.variantes.push({
      fila,
      valorOpcion: valorOpcionGuardado(producto.tipoOpcion, v("valor_opcion")),
      sku: v("sku"),
      precio: Number(v("precio_mxn")),
      existencia: Number(v("existencia")),
      pesoG: Number(v("peso_g")),
      largoCm: Number(v("largo_cm")),
      anchoCm: Number(v("ancho_cm")),
      altoCm: Number(v("alto_cm")),
    })
  }

  return { valido: errores.length === 0, productos, errores }
}
