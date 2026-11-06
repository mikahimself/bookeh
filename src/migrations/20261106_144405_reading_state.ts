import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "user_books" ADD COLUMN "reading_since" timestamp(3) with time zone;
  ALTER TABLE "user_books" ADD COLUMN "finished_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "user_books" DROP COLUMN "reading_since";
  ALTER TABLE "user_books" DROP COLUMN "finished_at";`)
}
