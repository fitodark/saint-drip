import { Text } from "@modules/common/components/ui"

import Medusa from "../../../common/icons/medusa"
import NextJs from "../../../common/icons/nextjs"

const MedusaCTA = () => {
  return (
    <Text className="flex gap-x-2 txt-compact-small-plus items-center">
      Con tecnología de
      <a href="https://www.medusajs.com" target="_blank" rel="noreferrer" aria-label="Medusa">
        <Medusa fill="var(--color-fg-muted)" className="fill-fg-muted" />
      </a>
      &
      <a href="https://nextjs.org" target="_blank" rel="noreferrer" aria-label="Next.js">
        <NextJs fill="var(--color-fg-muted)" />
      </a>
    </Text>
  )
}

export default MedusaCTA
