import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Google Books' top-level categories (English, verbatim) with draft Finnish names. */
export const SYSTEM_GENRES: readonly (readonly [name: string, nameFi: string])[] = [
  ['Antiques & Collectibles', 'Antiikki ja keräily'],
  ['Architecture', 'Arkkitehtuuri'],
  ['Art', 'Taide'],
  ['Bibles', 'Raamatut'],
  ['Biography & Autobiography', 'Elämäkerrat ja omaelämäkerrat'],
  ['Body, Mind & Spirit', 'Keho, mieli ja henkisyys'],
  ['Business & Economics', 'Liike-elämä ja talous'],
  ['Comics & Graphic Novels', 'Sarjakuvat ja sarjakuvaromaanit'],
  ['Computers', 'Tietotekniikka'],
  ['Cooking', 'Ruoanlaitto'],
  ['Crafts & Hobbies', 'Käsityöt ja harrastukset'],
  ['Design', 'Muotoilu'],
  ['Drama', 'Näytelmät'],
  ['Education', 'Koulutus'],
  ['Family & Relationships', 'Perhe ja ihmissuhteet'],
  ['Fiction', 'Kaunokirjallisuus'],
  ['Foreign Language Study', 'Vieraiden kielten opiskelu'],
  ['Games & Activities', 'Pelit ja leikit'],
  ['Gardening', 'Puutarhanhoito'],
  ['Health & Fitness', 'Terveys ja kuntoilu'],
  ['History', 'Historia'],
  ['House & Home', 'Koti ja asuminen'],
  ['Humor', 'Huumori'],
  ['Juvenile Fiction', 'Lasten ja nuorten kaunokirjallisuus'],
  ['Juvenile Nonfiction', 'Lasten ja nuorten tietokirjat'],
  ['Language Arts & Disciplines', 'Kielitiede ja kirjoittaminen'],
  ['Law', 'Oikeustiede'],
  ['Literary Collections', 'Kirjallisuuskokoelmat'],
  ['Literary Criticism', 'Kirjallisuudentutkimus'],
  ['Mathematics', 'Matematiikka'],
  ['Medical', 'Lääketiede'],
  ['Music', 'Musiikki'],
  ['Nature', 'Luonto'],
  ['Performing Arts', 'Esittävät taiteet'],
  ['Pets', 'Lemmikit'],
  ['Philosophy', 'Filosofia'],
  ['Photography', 'Valokuvaus'],
  ['Poetry', 'Runous'],
  ['Political Science', 'Valtio-oppi'],
  ['Psychology', 'Psykologia'],
  ['Reference', 'Hakuteokset'],
  ['Religion', 'Uskonto'],
  ['Science', 'Luonnontieteet'],
  ['Self-Help', 'Elämäntaito'],
  ['Social Science', 'Yhteiskuntatieteet'],
  ['Sports & Recreation', 'Urheilu ja vapaa-aika'],
  ['Study Aids', 'Opiskeluoppaat'],
  ['Technology & Engineering', 'Tekniikka'],
  ['Transportation', 'Liikenne'],
  ['Travel', 'Matkailu'],
  ['True Crime', 'True crime'],
  ['Young Adult Fiction', 'Nuortenkirjallisuus'],
  ['Young Adult Nonfiction', 'Nuorten tietokirjat'],
]

// All seed names are plain ASCII, so lower-casing equals toNameKey().
const values = sql.join(
  SYSTEM_GENRES.map(([name, nameFi]) => sql`(${name}, ${nameFi}, ${name.toLowerCase()})`),
  sql`, `,
)

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    INSERT INTO "genres" ("name", "name_fi", "name_key")
    VALUES ${values}
    ON CONFLICT ("name_key") DO UPDATE SET "name_fi" = EXCLUDED."name_fi"
    WHERE "genres"."name_fi" IS NULL OR btrim("genres"."name_fi") = ''`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "genres" g
    USING (VALUES ${values}) AS seed ("name", "name_fi", "name_key")
    WHERE g."name_key" = seed."name_key"
      AND g."name" = seed."name"
      AND g."name_fi" = seed."name_fi"
      AND NOT EXISTS (SELECT 1 FROM "books_rels" r WHERE r."genres_id" = g."id")`)
}
