/**
 * Saint Drip store setup. IDEMPOTENT: every block checks before it creates, so running it twice is a
 * supported path (Bootstrap runs it; steps 6, 7 and 8 re-run it to link newly registered providers).
 *
 * Run: npm --prefix apps/backend run seed   (→ medusa exec ./src/scripts/seed-saint-drip.ts)
 * Tests call the default export directly with the test container.
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createProductCategoriesWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  createUserAccountWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateRegionsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"

export const SEED = {
  storeName: "Saint Drip",
  salesChannel: "Tienda en línea",
  publishableKeyTitle: "Storefront Saint Drip",
  region: "México",
  stockLocation: "Almacén Principal",
  shippingProfile: "Perfil general",
  fulfillmentSet: "Envíos México",
  serviceZone: "Toda la República",
  adminEmail: "admin@saintdrip.local",
  categories: [
    { name: "Ropa", handle: "ropa" },
    { name: "Tenis", handle: "tenis" },
    { name: "Joyería", handle: "joyeria" },
    { name: "Perfumes", handle: "perfumes" },
    { name: "Accesorios", handle: "accesorios" },
  ],
  // Must match getFulfillmentOptions() of the Envia provider (step 8) — blueprint §19.6 reconciliation.
  enviaProviderId: "envia_envia",
  enviaOptions: [
    { id: "envia-terrestre", name: "Envío terrestre", label: "Terrestre", description: "3 a 5 días hábiles" },
    { id: "envia-express", name: "Envío express", label: "Express", description: "1 a 2 días hábiles" },
  ],
} as const

export default async function seedSaintDrip({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const storeService = container.resolve(Modules.STORE)
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)
  const regionService = container.resolve(Modules.REGION)
  const taxService = container.resolve(Modules.TAX)
  const stockService = container.resolve(Modules.STOCK_LOCATION)
  const fulfillmentService = container.resolve(Modules.FULFILLMENT)
  const apiKeyService = container.resolve(Modules.API_KEY)
  const productService = container.resolve(Modules.PRODUCT)
  const paymentService = container.resolve(Modules.PAYMENT)
  const userService = container.resolve(Modules.USER)
  const authService = container.resolve(Modules.AUTH)

  // 1. Sales channel
  let [salesChannel] = await salesChannelService.listSalesChannels({ name: SEED.salesChannel })
  if (!salesChannel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: SEED.salesChannel }] },
    })
    salesChannel = result[0]
  }

  // 2. Store: MXN is the only currency in v1 (USD is a v2 region — blueprint §1 Non-Goals)
  const [store] = await storeService.listStores()
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        name: SEED.storeName,
        supported_currencies: [{ currency_code: "mxn", is_default: true }],
        default_sales_channel_id: salesChannel.id,
      },
    },
  })

  // 3. Region México — prices are IVA-inclusive, as Mexican consumers expect
  let [region] = await regionService.listRegions({ name: SEED.region })
  if (!region) {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: SEED.region,
            currency_code: "mxn",
            countries: ["mx"],
            automatic_taxes: true,
            is_tax_inclusive: true,
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    })
    region = result[0]
  }

  // 4. Tax region MX, IVA 16 %
  const [taxRegion] = await taxService.listTaxRegions({ country_code: "mx" })
  if (!taxRegion) {
    await createTaxRegionsWorkflow(container).run({
      input: [{ country_code: "mx", provider_id: "tp_system", default_tax_rate: { name: "IVA", code: "IVA", rate: 16 } }],
    })
  }

  // 5. Payment providers of the region = every enabled provider; the manual system provider is
  //    dropped in production so the storefront never offers "manual payment".
  const providers = await paymentService.listPaymentProviders({ is_enabled: true })
  const providerIds = providers
    .map((p) => p.id)
    .filter((id) => process.env.NODE_ENV !== "production" || id !== "pp_system_default")
  await updateRegionsWorkflow(container).run({
    input: { selector: { id: region.id }, update: { payment_providers: providerIds } },
  })

  // 6. Stock location (single warehouse in v1; the model already supports more)
  let [location] = await stockService.listStockLocations({ name: SEED.stockLocation })
  if (!location) {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: SEED.stockLocation,
            address: {
              address_1: "Centro",
              city: "Huajuapan de León",
              province: "Oaxaca",
              postal_code: "69000",
              country_code: "mx",
            },
          },
        ],
      },
    })
    location = result[0]
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: location.id, add: [salesChannel.id] },
    })
  }

  // 7. Shipping profile + fulfillment set with one service zone covering Mexico
  let [profile] = await fulfillmentService.listShippingProfiles({ type: "default" })
  if (!profile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: SEED.shippingProfile, type: "default" }] },
    })
    profile = result[0]
  }
  let [fulfillmentSet] = await fulfillmentService.listFulfillmentSets(
    { name: SEED.fulfillmentSet },
    { relations: ["service_zones"] }
  )
  if (!fulfillmentSet) {
    fulfillmentSet = await fulfillmentService.createFulfillmentSets({
      name: SEED.fulfillmentSet,
      type: "shipping",
      service_zones: [{ name: SEED.serviceZone, geo_zones: [{ country_code: "mx", type: "country" }] }],
    })
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
      [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
    })
    ;[fulfillmentSet] = await fulfillmentService.listFulfillmentSets(
      { id: fulfillmentSet.id },
      { relations: ["service_zones"] }
    )
  }

  // 8. Envia shipping options — only once the Envia provider is registered (blueprint step 8)
  const enviaProviders = await fulfillmentService.listFulfillmentProviders({ id: [SEED.enviaProviderId] })
  if (enviaProviders.length > 0) {
    const { data: locations } = await query.graph({
      entity: "stock_location",
      fields: ["id", "fulfillment_providers.id"],
      filters: { id: location.id },
    })
    const linked = (locations[0]?.fulfillment_providers ?? []).some((p: { id?: string } | null) => p?.id === SEED.enviaProviderId)
    if (!linked) {
      await link.create({
        [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
        [Modules.FULFILLMENT]: { fulfillment_provider_id: SEED.enviaProviderId },
      })
    }
    const existing = (await fulfillmentService.listShippingOptions({ fulfillment_set_id: fulfillmentSet.id })).filter(
      (e) => e.provider_id === SEED.enviaProviderId
    )
    for (const option of SEED.enviaOptions) {
      if (existing.some((e) => (e.data as { id?: string } | null)?.id === option.id)) continue
      await createShippingOptionsWorkflow(container).run({
        input: [
          {
            name: option.name,
            price_type: "calculated",
            provider_id: SEED.enviaProviderId,
            service_zone_id: fulfillmentSet.service_zones[0].id,
            shipping_profile_id: profile.id,
            type: { label: option.label, description: option.description, code: option.id },
            data: { id: option.id },
            rules: [
              { attribute: "enabled_in_store", value: "true", operator: "eq" },
              { attribute: "is_return", value: "false", operator: "eq" },
            ],
          },
        ],
      })
    }
  }

  // 9. Publishable API key for the storefront
  let [apiKey] = await apiKeyService.listApiKeys({ title: SEED.publishableKeyTitle, type: "publishable" })
  if (!apiKey) {
    const { result } = await createApiKeysWorkflow(container).run({
      input: { api_keys: [{ title: SEED.publishableKeyTitle, type: "publishable", created_by: "" }] },
    })
    apiKey = result[0]
    await linkSalesChannelsToApiKeyWorkflow(container).run({ input: { id: apiKey.id, add: [salesChannel.id] } })
  }

  // 10. The five categories of the catalog (handles are the values of the Excel column `categoria`)
  const handles = SEED.categories.map((c) => c.handle)
  const existingCategories = await productService.listProductCategories({ handle: handles })
  const missing = SEED.categories.filter((c) => !existingCategories.some((e) => e.handle === c.handle))
  if (missing.length > 0) {
    await createProductCategoriesWorkflow(container).run({
      input: { product_categories: missing.map((c) => ({ name: c.name, handle: c.handle, is_active: true })) },
    })
  }

  // 11. Admin user (email/password provider)
  const [admin] = await userService.listUsers({ email: SEED.adminEmail })
  if (!admin) {
    const password = process.env.SEED_ADMIN_PASSWORD
    if (!password) throw new Error("seed-saint-drip: SEED_ADMIN_PASSWORD no está definido")
    const { success, authIdentity, error } = await authService.register("emailpass", {
      url: "",
      headers: {},
      query: {},
      protocol: "http",
      body: { email: SEED.adminEmail, password },
    })
    if (!success || !authIdentity) throw new Error(`seed-saint-drip: no se pudo registrar al admin: ${error}`)
    await createUserAccountWorkflow(container).run({
      input: { authIdentityId: authIdentity.id, userData: { email: SEED.adminEmail } },
    })
  }

  logger.info("seed-saint-drip: ok")
}
