import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "authors" DROP CONSTRAINT "authors_created_by_id_users_id_fk";
  
  ALTER TABLE "books" DROP CONSTRAINT "books_created_by_id_users_id_fk";
  
  ALTER TABLE "copies" DROP CONSTRAINT "copies_owner_id_users_id_fk";
  
  ALTER TABLE "copies" DROP CONSTRAINT "copies_book_id_books_id_fk";
  
  ALTER TABLE "loans" DROP CONSTRAINT "loans_owner_id_users_id_fk";
  
  ALTER TABLE "loans" DROP CONSTRAINT "loans_copy_id_copies_id_fk";
  
  ALTER TABLE "loans" DROP CONSTRAINT "loans_person_id_people_id_fk";
  
  ALTER TABLE "locations" DROP CONSTRAINT "locations_owner_id_users_id_fk";
  
  ALTER TABLE "media" DROP CONSTRAINT "media_created_by_id_users_id_fk";
  
  ALTER TABLE "people" DROP CONSTRAINT "people_owner_id_users_id_fk";
  
  ALTER TABLE "series" DROP CONSTRAINT "series_created_by_id_users_id_fk";
  
  ALTER TABLE "user_books" DROP CONSTRAINT "user_books_owner_id_users_id_fk";
  
  ALTER TABLE "user_books" DROP CONSTRAINT "user_books_book_id_books_id_fk";
  
  ALTER TABLE "wishlist_entries" DROP CONSTRAINT "wishlist_entries_owner_id_users_id_fk";
  
  ALTER TABLE "wishlist_entries" DROP CONSTRAINT "wishlist_entries_wishlist_id_wishlists_id_fk";
  
  ALTER TABLE "wishlist_entries" DROP CONSTRAINT "wishlist_entries_book_id_books_id_fk";
  
  ALTER TABLE "wishlist_entries" DROP CONSTRAINT "wishlist_entries_for_person_id_people_id_fk";
  
  ALTER TABLE "wishlists" DROP CONSTRAINT "wishlists_owner_id_users_id_fk";
  
  ALTER TABLE "authors" ADD CONSTRAINT "authors_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "books" ADD CONSTRAINT "books_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "copies" ADD CONSTRAINT "copies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "copies" ADD CONSTRAINT "copies_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "loans" ADD CONSTRAINT "loans_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "loans" ADD CONSTRAINT "loans_copy_id_copies_id_fk" FOREIGN KEY ("copy_id") REFERENCES "public"."copies"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "loans" ADD CONSTRAINT "loans_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "locations" ADD CONSTRAINT "locations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "people" ADD CONSTRAINT "people_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "series" ADD CONSTRAINT "series_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "user_books" ADD CONSTRAINT "user_books_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "user_books" ADD CONSTRAINT "user_books_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "wishlist_entries" ADD CONSTRAINT "wishlist_entries_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wishlist_entries" ADD CONSTRAINT "wishlist_entries_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wishlist_entries" ADD CONSTRAINT "wishlist_entries_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "wishlist_entries" ADD CONSTRAINT "wishlist_entries_for_person_id_people_id_fk" FOREIGN KEY ("for_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
  ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "authors" DROP CONSTRAINT "authors_created_by_id_users_id_fk";
  
  ALTER TABLE "books" DROP CONSTRAINT "books_created_by_id_users_id_fk";
  
  ALTER TABLE "copies" DROP CONSTRAINT "copies_owner_id_users_id_fk";
  
  ALTER TABLE "copies" DROP CONSTRAINT "copies_book_id_books_id_fk";
  
  ALTER TABLE "loans" DROP CONSTRAINT "loans_owner_id_users_id_fk";
  
  ALTER TABLE "loans" DROP CONSTRAINT "loans_copy_id_copies_id_fk";
  
  ALTER TABLE "loans" DROP CONSTRAINT "loans_person_id_people_id_fk";
  
  ALTER TABLE "locations" DROP CONSTRAINT "locations_owner_id_users_id_fk";
  
  ALTER TABLE "media" DROP CONSTRAINT "media_created_by_id_users_id_fk";
  
  ALTER TABLE "people" DROP CONSTRAINT "people_owner_id_users_id_fk";
  
  ALTER TABLE "series" DROP CONSTRAINT "series_created_by_id_users_id_fk";
  
  ALTER TABLE "user_books" DROP CONSTRAINT "user_books_owner_id_users_id_fk";
  
  ALTER TABLE "user_books" DROP CONSTRAINT "user_books_book_id_books_id_fk";
  
  ALTER TABLE "wishlist_entries" DROP CONSTRAINT "wishlist_entries_owner_id_users_id_fk";
  
  ALTER TABLE "wishlist_entries" DROP CONSTRAINT "wishlist_entries_wishlist_id_wishlists_id_fk";
  
  ALTER TABLE "wishlist_entries" DROP CONSTRAINT "wishlist_entries_book_id_books_id_fk";
  
  ALTER TABLE "wishlist_entries" DROP CONSTRAINT "wishlist_entries_for_person_id_people_id_fk";
  
  ALTER TABLE "wishlists" DROP CONSTRAINT "wishlists_owner_id_users_id_fk";
  
  ALTER TABLE "authors" ADD CONSTRAINT "authors_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "books" ADD CONSTRAINT "books_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "copies" ADD CONSTRAINT "copies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "copies" ADD CONSTRAINT "copies_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "loans" ADD CONSTRAINT "loans_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "loans" ADD CONSTRAINT "loans_copy_id_copies_id_fk" FOREIGN KEY ("copy_id") REFERENCES "public"."copies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "loans" ADD CONSTRAINT "loans_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "locations" ADD CONSTRAINT "locations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "people" ADD CONSTRAINT "people_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "series" ADD CONSTRAINT "series_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_books" ADD CONSTRAINT "user_books_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_books" ADD CONSTRAINT "user_books_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wishlist_entries" ADD CONSTRAINT "wishlist_entries_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wishlist_entries" ADD CONSTRAINT "wishlist_entries_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wishlist_entries" ADD CONSTRAINT "wishlist_entries_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wishlist_entries" ADD CONSTRAINT "wishlist_entries_for_person_id_people_id_fk" FOREIGN KEY ("for_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;`)
}
