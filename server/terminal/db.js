const { ApiError } = require('../vision-forge/errors');

let sqlClient = null;
let sqlForTests = null;

function createSqlClient() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new ApiError(503, 'Terminal database is not configured yet. Add DATABASE_URL in Vercel Environment Variables.');
  }

  const { neon } = require('@neondatabase/serverless');
  return neon(databaseUrl);
}

function getSql() {
  if (sqlForTests) return sqlForTests;

  if (!sqlClient) {
    sqlClient = createSqlClient();
  }

  return sqlClient;
}

function _setSqlForTests(sql) {
  sqlForTests = sql || null;
  sqlClient = null;
}

module.exports = {
  _setSqlForTests,
  getSql
};
