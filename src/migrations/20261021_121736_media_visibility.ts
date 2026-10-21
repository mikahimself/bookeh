import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Media rows before D28 are source downloads or admin back-office uploads, all
// readable by every signed-in user, so marking them shared changes no one's
// access. The default is dropped again to match the config, which has none (AD-4).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_media_visibility" AS ENUM('shared', 'private');
  ALTER TABLE "media" ADD COLUMN "visibility" "enum_media_visibility" DEFAULT 'shared' NOT NULL;
  ALTER TABLE "media" ALTER COLUMN "visibility" DROP DEFAULT;
  ALTER TABLE "media" ADD COLUMN "created_by_id" integer;
  ALTER TABLE "media" ADD CONSTRAINT "media_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "media_created_by_idx" ON "media" USING btree ("created_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" DROP CONSTRAINT "media_created_by_id_users_id_fk";
  
  DROP INDEX "media_created_by_idx";
  ALTER TABLE "media" DROP COLUMN "visibility";
  ALTER TABLE "media" DROP COLUMN "created_by_id";
  DROP TYPE "public"."enum_media_visibility";`)
}
