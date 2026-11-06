import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Hand-edited (spine, AD-13): `acquired_at` cannot be added NOT NULL to a
// table with rows, so it is added nullable, filled with each copy's
// `created_at` as its Europe/Helsinki day at 12:00 UTC, then made required.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "copies" ADD COLUMN "acquired_at" timestamp(3) with time zone;
  UPDATE "copies" SET "acquired_at" = (("created_at" AT TIME ZONE 'Europe/Helsinki')::date + time '12:00') AT TIME ZONE 'UTC';
  ALTER TABLE "copies" ALTER COLUMN "acquired_at" SET NOT NULL;
  ALTER TABLE "copies" ADD COLUMN "price" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "copies" DROP COLUMN "acquired_at";
  ALTER TABLE "copies" DROP COLUMN "price";`)
}
