import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_books_visibility" AS ENUM('shared', 'private');
  CREATE TABLE "books" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"isbn13" varchar,
  	"title" varchar NOT NULL,
  	"subtitle" varchar,
  	"series_id" integer,
  	"series_index" numeric,
  	"publisher" varchar,
  	"year" numeric,
  	"language" varchar,
  	"pages" numeric,
  	"description" varchar,
  	"cover_id" integer,
  	"source" varchar,
  	"raw_metadata" jsonb,
  	"visibility" "enum_books_visibility" NOT NULL,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "books_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "books_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"authors_id" integer,
  	"genres_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "books_id" integer;
  ALTER TABLE "books" ADD CONSTRAINT "books_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "books" ADD CONSTRAINT "books_cover_id_media_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "books" ADD CONSTRAINT "books_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "books_texts" ADD CONSTRAINT "books_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "books_rels" ADD CONSTRAINT "books_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "books_rels" ADD CONSTRAINT "books_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "books_rels" ADD CONSTRAINT "books_rels_genres_fk" FOREIGN KEY ("genres_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "books_series_idx" ON "books" USING btree ("series_id");
  CREATE INDEX "books_cover_idx" ON "books" USING btree ("cover_id");
  CREATE INDEX "books_created_by_idx" ON "books" USING btree ("created_by_id");
  CREATE INDEX "books_updated_at_idx" ON "books" USING btree ("updated_at");
  CREATE INDEX "books_created_at_idx" ON "books" USING btree ("created_at");
  CREATE UNIQUE INDEX "books_isbn13_shared_idx" ON "books" USING btree ("isbn13") WHERE "books"."visibility" = 'shared';
  CREATE UNIQUE INDEX "books_created_by_isbn13_private_idx" ON "books" USING btree ("created_by_id","isbn13") WHERE "books"."visibility" = 'private';
  CREATE INDEX "books_texts_order_parent" ON "books_texts" USING btree ("order","parent_id");
  CREATE INDEX "books_rels_order_idx" ON "books_rels" USING btree ("order");
  CREATE INDEX "books_rels_parent_idx" ON "books_rels" USING btree ("parent_id");
  CREATE INDEX "books_rels_path_idx" ON "books_rels" USING btree ("path");
  CREATE INDEX "books_rels_authors_id_idx" ON "books_rels" USING btree ("authors_id");
  CREATE INDEX "books_rels_genres_id_idx" ON "books_rels" USING btree ("genres_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_books_fk" FOREIGN KEY ("books_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_books_id_idx" ON "payload_locked_documents_rels" USING btree ("books_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_books_fk";
  DROP INDEX "payload_locked_documents_rels_books_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "books_id";
  ALTER TABLE "books_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "books_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "books" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "books_texts" CASCADE;
  DROP TABLE "books_rels" CASCADE;
  DROP TABLE "books" CASCADE;
  DROP TYPE "public"."enum_books_visibility";`)
}
