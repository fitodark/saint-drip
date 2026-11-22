// Admin customization texts in English (chosen by the admin in Profile → Language, D22).
import type { es } from "./es"

export const en: typeof es = {
  cargaMasiva: {
    menu: "Bulk upload",
    titulo: "Bulk upload",
    descargarPlantilla: "Download template",
    excel: "Excel",
    excelAria: "Excel file (.xlsx)",
    fotos: "Photos",
    fotosAria: "Photos (.jpg)",
    nombresMalFormados: "These names do not follow the {{formato}} format: {{nombres}}",
    validar: "Validate",
    validando: "Validating…",
    importar: "Import",
    importando: "Importing…",
    errorValidar: "The file could not be validated",
    errorImportar: "The catalog could not be imported",
    creados: "{{count}} products created",
    resumen: "{{productos}} products · {{variantes}} variants",
    fila: "Row",
    columna: "Column",
    error: "Error",
    fotosFaltantes: "Missing photos",
    fotosSinUsar: "Unused photos",
    ninguna: "None",
  },
}
