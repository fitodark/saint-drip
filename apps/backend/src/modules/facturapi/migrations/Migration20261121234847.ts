import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261121234847 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "cfdi_invoice" drop constraint if exists "cfdi_invoice_period_unique";`);
    this.addSql(`alter table if exists "cfdi_invoice" drop constraint if exists "cfdi_invoice_order_id_unique";`);
    this.addSql(`alter table if exists "cfdi_invoice" drop constraint if exists "cfdi_invoice_facturapi_id_unique";`);
    this.addSql(`create table if not exists "cfdi_invoice" ("id" text not null, "kind" text check ("kind" in ('individual', 'global')) not null, "order_id" text null, "period" text null, "order_ids" jsonb not null default '{"ids":[]}', "facturapi_id" text not null, "uuid" text not null, "rfc" text not null, "total" numeric not null, "status" text check ("status" in ('issued', 'cancelled')) not null default 'issued', "raw_total" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cfdi_invoice_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cfdi_invoice_facturapi_id_unique" ON "cfdi_invoice" ("facturapi_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cfdi_invoice_deleted_at" ON "cfdi_invoice" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cfdi_invoice_order_id_unique" ON "cfdi_invoice" ("order_id") WHERE kind = 'individual' AND deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cfdi_invoice_period_unique" ON "cfdi_invoice" ("period") WHERE kind = 'global' AND deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "cfdi_invoice" cascade;`);
  }

}
