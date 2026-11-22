// Proveedor de notificaciones por email con Resend (blueprint paso 12). Solo se registra con RESEND_API_KEY.
import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils"
import type { ProviderSendNotificationDTO, ProviderSendNotificationResultsDTO } from "@medusajs/framework/types"
import { Resend } from "resend"

export type ResendOptions = { apiKey: string; from: string }

class ResendNotificationService extends AbstractNotificationProviderService {
  static identifier = "resend"

  protected readonly options_: ResendOptions
  protected readonly resend_: Resend

  static validateOptions(options: Record<string, unknown>) {
    if (!options.apiKey) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Resend requiere apiKey (RESEND_API_KEY)")
    if (!options.from) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Resend requiere from (EMAIL_FROM)")
  }

  constructor(_container: Record<string, unknown>, options: ResendOptions) {
    super()
    this.options_ = options
    this.resend_ = new Resend(options.apiKey)
  }

  async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    const content = notification.content ?? {}
    const { data, error } = await this.resend_.emails.send({
      from: notification.from || this.options_.from,
      to: notification.to,
      subject: content.subject ?? "",
      html: content.html ?? "",
      text: content.text ?? "",
    })
    if (error) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, error.message)
    return { id: data?.id }
  }
}

export default ResendNotificationService
