import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "genres" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"name_fi" varchar,
  	"name_key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "genres_id" integer;
  CREATE UNIQUE INDEX "genres_name_key_idx" ON "genres" USING btree ("name_key");
  CREATE INDEX "genres_updated_at_idx" ON "genres" USING btree ("updated_at");
  CREATE INDEX "genres_created_at_idx" ON "genres" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_genres_fk" FOREIGN KEY ("genres_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_genres_id_idx" ON "payload_locked_documents_rels" USING btree ("genres_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_genres_fk";
  DROP INDEX "payload_locked_documents_rels_genres_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "genres_id";
  ALTER TABLE "genres" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "genres" CASCADE;`)
}
