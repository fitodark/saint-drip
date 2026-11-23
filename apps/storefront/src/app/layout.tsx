import { getBaseURL } from "@lib/util/env"
import WhatsAppButton from "@modules/common/components/whatsapp-button"
import { Metadata } from "next"
import { Archivo, Inter } from "next/font/google"
import "styles/globals.css"

// Tipografía de §7: Archivo expandida (eje wdth) para títulos e Inter para texto.
const display = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-display", display: "swap" })
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" })

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" data-mode="light" className={`${display.variable} ${body.variable}`}>
      <head>
        <link rel="ucp" href="/.well-known/ucp" />
      </head>
      <body className="bg-background text-fg font-sans">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-surface focus:px-4 focus:py-2 focus:text-fg"
        >
          Saltar al contenido
        </a>
        <main className="relative">{props.children}</main>
        <WhatsAppButton />
      </body>
    </html>
  )
}
