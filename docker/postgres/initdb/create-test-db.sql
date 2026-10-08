-- Runs once, on an empty data directory, after POSTGRES_DB exists.
-- Inherits template1's locale: ICU fi-FI from POSTGRES_INITDB_ARGS.
CREATE DATABASE bookeh_test;
