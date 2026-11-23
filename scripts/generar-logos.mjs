// Genera los logos del storefront a partir de los originales de la marca en docs/ (D27).
//   docs/logo_white.jpg (HEIF: trazo negro sobre blanco) → public/marca/logo-oscuro.png y logo-claro.png,
//     con fondo transparente: el blanco se vuelve transparente y el trazo toma el color del token de §7.
//   docs/logo_black.JPG (círculo negro) → src/app/icon.png (pestaña) y src/app/apple-icon.png (inicio iOS).
// Uso (desde la raíz): node scripts/generar-logos.mjs
import path from "node:path"
import { createRequire } from "node:module"

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..")
const sharp = createRequire(path.join(raiz, "apps/storefront/package.json"))("sharp")
const sf = (...p) => path.join(raiz, "apps/storefront", ...p)

// Valores de --color-fg y --color-primary-fg (apps/storefront/src/styles/globals.css).
const FG = { r: 10, g: 10, b: 10 }
const PRIMARY_FG = { r: 244, g: 244, b: 241 }

async function trazo(color, salida) {
  // Alfa = qué tan oscuro es cada pixel; el color es plano. Se recorta el margen y se deja a 600 px de ancho.
  const gris = await sharp(path.join(raiz, "docs/logo_white.jpg")).grayscale().negate().toColourspace("b-w").raw().toBuffer({ resolveWithObject: true })
  const { width, height } = gris.info
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const a = gris.data[i] < 24 ? 0 : gris.data[i]
    rgba[i * 4] = color.r
    rgba[i * 4 + 1] = color.g
    rgba[i * 4 + 2] = color.b
    rgba[i * 4 + 3] = a
  }
  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .trim({ threshold: 0 })
    .resize({ width: 600, withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toFile(salida)
}

async function icono(lado, salida) {
  // Recorta al círculo (el original trae margen blanco) y lo deja cuadrado.
  await sharp(path.join(raiz, "docs/logo_black.JPG"))
    .trim({ background: "#ffffff", threshold: 40 })
    .resize(lado, lado, { fit: "contain", background: "#ffffff" })
    .png()
    .toFile(salida)
}

await trazo(FG, sf("public/marca/logo-oscuro.png"))
await trazo(PRIMARY_FG, sf("public/marca/logo-claro.png"))
await icono(512, sf("src/app/icon.png"))
await icono(180, sf("src/app/apple-icon.png"))
console.log("generar-logos: ok")
