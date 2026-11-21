// Lectura del Excel de carga masiva (blueprint §5). TypeScript puro: sin dependencias de Medusa.
import ExcelJS from "exceljs"

export type FilaExcel = { fila: number; valores: Record<string, string> }

export type ExcelLeido = { encabezados: string[]; filas: FilaExcel[] }

// Cada celda se lee como texto recortado: números con String(), texto enriquecido concatenado,
// fórmulas por su resultado, hipervínculos por su texto y vacías como "".
export function textoCelda(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return ""
  if (valor instanceof Date) return valor.toISOString().trim()
  if (typeof valor === "object") {
    if ("richText" in valor && Array.isArray(valor.richText)) {
      return valor.richText.map((parte) => parte.text).join("").trim()
    }
    if ("formula" in valor || "sharedFormula" in valor) {
      const resultado = (valor as { result?: unknown }).result
      if (resultado === null || resultado === undefined || typeof resultado === "object") return ""
      return String(resultado).trim()
    }
    if ("text" in valor) return textoCelda((valor as { text: ExcelJS.CellValue }).text)
    if ("error" in valor) return ""
    return ""
  }
  return String(valor).trim()
}

export async function leerExcel(buffer: Buffer): Promise<ExcelLeido> {
  const libro = new ExcelJS.Workbook()
  try {
    await libro.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  } catch {
    throw new Error("E_EXCEL")
  }
  const hoja = libro.getWorksheet("Productos")
  if (!hoja) throw new Error("E_EXCEL")

  const filaEncabezados = hoja.getRow(1)
  const encabezados: string[] = []
  for (let c = 1; c <= filaEncabezados.cellCount; c++) {
    encabezados.push(textoCelda(filaEncabezados.getCell(c).value))
  }
  while (encabezados.length > 0 && encabezados[encabezados.length - 1] === "") encabezados.pop()

  const filas: FilaExcel[] = []
  for (let n = 2; n <= hoja.rowCount; n++) {
    const fila = hoja.getRow(n)
    const valores: Record<string, string> = {}
    let vacia = true
    encabezados.forEach((nombre, i) => {
      const texto = textoCelda(fila.getCell(i + 1).value)
      if (texto !== "") vacia = false
      valores[nombre] = texto
    })
    if (!vacia) filas.push({ fila: n, valores })
  }

  return { encabezados, filas }
}
