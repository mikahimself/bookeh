import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "user_books" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"owner_id" integer NOT NULL,
  	"book_id" integer NOT NULL,
  	"title" varchar,
  	"subtitle" varchar,
  	"series_id" integer,
  	"series_index" numeric,
  	"publisher" varchar,
  	"year" numeric,
  	"language" varchar,
  	"pages" numeric,
  	"description" varchar,
  	"overridden" jsonb DEFAULT '[]'::jsonb,
  	"read" boolean DEFAULT false,
  	"rating" numeric,
  	"rated_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "user_books_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"authors_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "user_books_id" integer;
  ALTER TABLE "user_books" ADD CONSTRAINT "user_books_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_books" ADD CONSTRAINT "user_books_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_books" ADD CONSTRAINT "user_books_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_books_rels" ADD CONSTRAINT "user_books_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user_books"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "user_books_rels" ADD CONSTRAINT "user_books_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "user_books_owner_idx" ON "user_books" USING btree ("owner_id");
  CREATE INDEX "user_books_book_idx" ON "user_books" USING btree ("book_id");
  CREATE INDEX "user_books_series_idx" ON "user_books" USING btree ("series_id");
  CREATE INDEX "user_books_updated_at_idx" ON "user_books" USING btree ("updated_at");
  CREATE INDEX "user_books_created_at_idx" ON "user_books" USING btree ("created_at");
  CREATE UNIQUE INDEX "owner_book_idx" ON "user_books" USING btree ("owner_id","book_id");
  CREATE INDEX "user_books_rels_order_idx" ON "user_books_rels" USING btree ("order");
  CREATE INDEX "user_books_rels_parent_idx" ON "user_books_rels" USING btree ("parent_id");
  CREATE INDEX "user_books_rels_path_idx" ON "user_books_rels" USING btree ("path");
  CREATE INDEX "user_books_rels_authors_id_idx" ON "user_books_rels" USING btree ("authors_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_books_fk" FOREIGN KEY ("user_books_id") REFERENCES "public"."user_books"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_user_books_id_idx" ON "payload_locked_documents_rels" USING btree ("user_books_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_user_books_fk";
  DROP INDEX "payload_locked_documents_rels_user_books_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "user_books_id";
  ALTER TABLE "user_books_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "user_books" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "user_books_rels" CASCADE;
  DROP TABLE "user_books" CASCADE;`)
}
