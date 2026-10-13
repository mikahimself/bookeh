import * as migration_20261009_092900_users from './20261009_092900_users'
import * as migration_20261010_095151_visibility from './20261010_095151_visibility'
import * as migration_20261012_173948_authors from './20261012_173948_authors'
import * as migration_20261012_184054_series from './20261012_184054_series'
import * as migration_20261013_122124_genres from './20261013_122124_genres'
import * as migration_20261013_123727_books from './20261013_123727_books'

export const migrations = [
  {
    up: migration_20261009_092900_users.up,
    down: migration_20261009_092900_users.down,
    name: '20261009_092900_users',
  },
  {
    up: migration_20261010_095151_visibility.up,
    down: migration_20261010_095151_visibility.down,
    name: '20261010_095151_visibility',
  },
  {
    up: migration_20261012_173948_authors.up,
    down: migration_20261012_173948_authors.down,
    name: '20261012_173948_authors',
  },
  {
    up: migration_20261012_184054_series.up,
    down: migration_20261012_184054_series.down,
    name: '20261012_184054_series',
  },
  {
    up: migration_20261013_122124_genres.up,
    down: migration_20261013_122124_genres.down,
    name: '20261013_122124_genres',
  },
  {
    up: migration_20261013_123727_books.up,
    down: migration_20261013_123727_books.down,
    name: '20261013_123727_books',
  },
]
