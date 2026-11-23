import { useEffect, useRef } from "react"

// a11y: cuando un paso del checkout se abre (cambia ?step=), mueve el foco a su título para que el
// teclado y el lector de pantalla no queden en <body>. No actúa en la carga inicial de la página.
export const useFocoPaso = (isOpen: boolean) => {
  const ref = useRef<HTMLHeadingElement>(null)
  const montado = useRef(false)

  useEffect(() => {
    if (montado.current && isOpen) ref.current?.focus()
    montado.current = true
  }, [isOpen])

  return ref
}
