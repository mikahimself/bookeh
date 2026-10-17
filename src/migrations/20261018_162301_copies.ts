import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_copies_status" AS ENUM('ordered', 'owned');
  CREATE TABLE "copies" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"owner_id" integer NOT NULL,
  	"book_id" integer NOT NULL,
  	"status" "enum_copies_status" DEFAULT 'owned' NOT NULL,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "copies_id" integer;
  ALTER TABLE "copies" ADD CONSTRAINT "copies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "copies" ADD CONSTRAINT "copies_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "copies_owner_idx" ON "copies" USING btree ("owner_id");
  CREATE INDEX "copies_book_idx" ON "copies" USING btree ("book_id");
  CREATE INDEX "copies_updated_at_idx" ON "copies" USING btree ("updated_at");
  CREATE INDEX "copies_created_at_idx" ON "copies" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_copies_fk" FOREIGN KEY ("copies_id") REFERENCES "public"."copies"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_copies_id_idx" ON "payload_locked_documents_rels" USING btree ("copies_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_copies_fk";
  DROP INDEX "payload_locked_documents_rels_copies_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "copies_id";
  ALTER TABLE "copies" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "copies" CASCADE;
  DROP TYPE "public"."enum_copies_status";`)
}
