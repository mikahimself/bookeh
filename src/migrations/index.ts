import * as migration_20261009_092900_users from './20261009_092900_users';
import * as migration_20261010_095151_visibility from './20261010_095151_visibility';

export const migrations = [
  {
    up: migration_20261009_092900_users.up,
    down: migration_20261009_092900_users.down,
    name: '20261009_092900_users',
  },
  {
    up: migration_20261010_095151_visibility.up,
    down: migration_20261010_095151_visibility.down,
    name: '20261010_095151_visibility'
  },
];
