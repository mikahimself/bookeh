import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "wishlist_entries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"owner_id" integer NOT NULL,
  	"wishlist_id" integer NOT NULL,
  	"book_id" integer NOT NULL,
  	"for_person_id" integer,
  	"closed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "wishlist_entries_id" integer;
  ALTER TABLE "wishlist_entries" ADD CONSTRAINT "wishlist_entries_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wishlist_entries" ADD CONSTRAINT "wishlist_entries_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wishlist_entries" ADD CONSTRAINT "wishlist_entries_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wishlist_entries" ADD CONSTRAINT "wishlist_entries_for_person_id_people_id_fk" FOREIGN KEY ("for_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "wishlist_entries_owner_idx" ON "wishlist_entries" USING btree ("owner_id");
  CREATE INDEX "wishlist_entries_wishlist_idx" ON "wishlist_entries" USING btree ("wishlist_id");
  CREATE INDEX "wishlist_entries_book_idx" ON "wishlist_entries" USING btree ("book_id");
  CREATE INDEX "wishlist_entries_for_person_idx" ON "wishlist_entries" USING btree ("for_person_id");
  CREATE INDEX "wishlist_entries_updated_at_idx" ON "wishlist_entries" USING btree ("updated_at");
  CREATE INDEX "wishlist_entries_created_at_idx" ON "wishlist_entries" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_wishlist_entries_fk" FOREIGN KEY ("wishlist_entries_id") REFERENCES "public"."wishlist_entries"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_wishlist_entries_id_idx" ON "payload_locked_documents_rels" USING btree ("wishlist_entries_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_wishlist_entries_fk";
  DROP INDEX "payload_locked_documents_rels_wishlist_entries_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "wishlist_entries_id";
  ALTER TABLE "wishlist_entries" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "wishlist_entries" CASCADE;`)
}
