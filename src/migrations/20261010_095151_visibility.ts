import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_profile_visibility" AS ENUM('public', 'hidden');
  CREATE TYPE "public"."enum_users_collection_visibility" AS ENUM('open', 'closed');
  ALTER TABLE "users" ADD COLUMN "profile_visibility" "enum_users_profile_visibility" DEFAULT 'hidden' NOT NULL;
  ALTER TABLE "users" ADD COLUMN "collection_visibility" "enum_users_collection_visibility" DEFAULT 'closed' NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "profile_visibility";
  ALTER TABLE "users" DROP COLUMN "collection_visibility";
  DROP TYPE "public"."enum_users_profile_visibility";
  DROP TYPE "public"."enum_users_collection_visibility";`)
}
