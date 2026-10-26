import type { PostgresAdapterArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { uniqueIndex } from '@payloadcms/db-postgres/drizzle/pg-core'
import {
  ValidationError,
  type CollectionBeforeValidateHook,
  type CollectionConfig,
  type DateField,
  type FieldHook,
} from 'payload'

import { ownerAccess } from '@/access/owner'
import { ownerField } from '@/fields/owner'
import { ownedRelation } from '@/fields/relation'
import type { Loan } from '@/payload-types'

type PostgresSchemaHook = NonNullable<PostgresAdapterArgs['afterSchemaInit']>[number]

/** The UTC date of a parseable date value, otherwise null. */
const utcDate = (value: unknown): string | null => {
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

/**
 * Spine, Consistency Conventions → Dates: a calendar date is stored at 12:00
 * UTC of its UTC date, whatever time of day the write carried. Idempotent, so
 * an update that refills the stored value keeps it. Anything unparseable
 * passes through to Payload's date validation; empty stays empty.
 */
const toNoonUtc: FieldHook = ({ value }) => {
  const date = utcDate(value)
  return date ? `${date}T12:00:00.000Z` : value
}

const calendarDate = (name: string, required = false): DateField => ({
  name,
  type: 'date',
  required,
  // The admin picker already sets 12:00 UTC for a day-only date.
  admin: { date: { pickerAppearance: 'dayOnly' } },
  hooks: { beforeValidate: [toNoonUtc] },
})

/**
 * A loan is returned on or after the day it was lent. A collection hook, so
 * the error lands on `returnedOn` whichever field the write submitted; field
 * `beforeValidate` has already refilled both dates from the stored row on
 * update and moved them to noon UTC.
 */
const returnedNotBeforeLent: CollectionBeforeValidateHook<Loan> = ({ collection, data, req }) => {
  const lent = utcDate(data?.lentOn)
  const returned = utcDate(data?.returnedOn)
  if (lent && returned && returned < lent) {
    throw new ValidationError({
      collection: collection.slug,
      errors: [{ path: 'returnedOn', message: req.t('validation:invalidInput') }],
      req,
    })
  }
  return data
}

/**
 * Spine, AD-19: at most one open loan per copy. Collection `indexes` cannot
 * carry a `where`, so the partial unique index is added in `afterSchemaInit`
 * (as `catalogueIndexes.ts` does) and lands in the table's migration.
 */
export const openLoanIndex: PostgresSchemaHook = ({ schema, extendTable }) => {
  const loans = schema.tables.loans
  if (!loans) throw new Error('openLoanIndex: no table "loans"')
  extendTable({
    table: loans,
    extraConfig: (t) => ({
      copyOpen: uniqueIndex('loans_copy_open_idx')
        .on(t.copy)
        .where(sql`${t.returnedOn} is null`),
    }),
  })
  return schema
}

/**
 * Spine, AD-1/AD-8/AD-17/AD-19, FR-35/FR-36: one copy lent to one Person,
 * owned by one user. Private: the owner alone reads and writes, the admin
 * included. `copy` and `person` are the owner's own rows (`ownedRelation`).
 * A loan is never a location or a copy status: the copy keeps its location
 * while lent. `returnedOn` is empty while the loan is open; a returned loan
 * stays as history, and `openLoanIndex` allows one open loan per copy. From
 * 6.5 on `lib/loans` is its only writer.
 */
export const Loans: CollectionConfig = {
  slug: 'loans',
  access: ownerAccess,
  defaultSort: '-lentOn',
  admin: {
    group: 'My data',
    defaultColumns: ['copy', 'person', 'lentOn', 'returnedOn'],
  },
  hooks: { beforeValidate: [returnedNotBeforeLent] },
  fields: [
    ownerField(),
    ownedRelation('copies', { name: 'copy', required: true }),
    ownedRelation('people', { name: 'person', required: true }),
    calendarDate('lentOn', true),
    calendarDate('returnedOn'),
  ],
}
