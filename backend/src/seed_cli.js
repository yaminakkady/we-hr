'use strict';

const { createDatabase } = require('./db/database');
const { seedDatabase } = require('./db/seed');

const db = createDatabase();
const result = seedDatabase(db);
console.log(
  result.seeded
    ? 'We HR database seeded successfully with Egypt and Saudi Arabia multi-tenant demo records.'
    : 'We HR database already contains tenant records; skipping seed.'
);
