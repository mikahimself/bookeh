import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "loans" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"owner_id" integer NOT NULL,
  	"copy_id" integer NOT NULL,
  	"person_id" integer NOT NULL,
  	"lent_on" timestamp(3) with time zone NOT NULL,
  	"returned_on" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "loans_id" integer;
  ALTER TABLE "loans" ADD CONSTRAINT "loans_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "loans" ADD CONSTRAINT "loans_copy_id_copies_id_fk" FOREIGN KEY ("copy_id") REFERENCES "public"."copies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "loans" ADD CONSTRAINT "loans_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "loans_owner_idx" ON "loans" USING btree ("owner_id");
  CREATE INDEX "loans_copy_idx" ON "loans" USING btree ("copy_id");
  CREATE INDEX "loans_person_idx" ON "loans" USING btree ("person_id");
  CREATE INDEX "loans_updated_at_idx" ON "loans" USING btree ("updated_at");
  CREATE INDEX "loans_created_at_idx" ON "loans" USING btree ("created_at");
  CREATE UNIQUE INDEX "loans_copy_open_idx" ON "loans" USING btree ("copy_id") WHERE "loans"."returned_on" is null;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_loans_fk" FOREIGN KEY ("loans_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_loans_id_idx" ON "payload_locked_documents_rels" USING btree ("loans_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_loans_fk";
  DROP INDEX "payload_locked_documents_rels_loans_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "loans_id";
  ALTER TABLE "loans" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "loans" CASCADE;`)
}
