import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_series_visibility" AS ENUM('shared', 'private');
  CREATE TABLE "series" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"name_key" varchar NOT NULL,
  	"visibility" "enum_series_visibility" NOT NULL,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "series_id" integer;
  ALTER TABLE "series" ADD CONSTRAINT "series_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "series_created_by_idx" ON "series" USING btree ("created_by_id");
  CREATE INDEX "series_updated_at_idx" ON "series" USING btree ("updated_at");
  CREATE INDEX "series_created_at_idx" ON "series" USING btree ("created_at");
  CREATE UNIQUE INDEX "series_name_key_shared_idx" ON "series" USING btree ("name_key") WHERE "series"."visibility" = 'shared';
  CREATE UNIQUE INDEX "series_created_by_name_key_private_idx" ON "series" USING btree ("created_by_id","name_key") WHERE "series"."visibility" = 'private';
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_series_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_series_id_idx" ON "payload_locked_documents_rels" USING btree ("series_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_series_fk";
  DROP INDEX "payload_locked_documents_rels_series_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "series_id";
  ALTER TABLE "series" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "series" CASCADE;
  DROP TYPE "public"."enum_series_visibility";`)
}
