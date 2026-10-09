import * as migration_20261009_092900_users from './20261009_092900_users';

export const migrations = [
  {
    up: migration_20261009_092900_users.up,
    down: migration_20261009_092900_users.down,
    name: '20261009_092900_users'
  },
];
