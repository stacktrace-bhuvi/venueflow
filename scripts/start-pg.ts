import EmbeddedPostgres from 'embedded-postgres';

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: '.pgdata',
    port: 5432,
    user: 'postgres',
    password: 'password',
    persistent: true,
  });

  console.log('Starting Embedded PostgreSQL...');
  await pg.start();
  console.log('Embedded PostgreSQL is running on port 5432.');

  // Keep alive until terminated
  process.on('SIGINT', async () => {
    console.log('Stopping Embedded PostgreSQL...');
    await pg.stop();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    console.log('Stopping Embedded PostgreSQL...');
    await pg.stop();
    process.exit(0);
  });

  await new Promise(() => {});
}

main().catch((err) => {
  console.error('Failed to start Embedded PostgreSQL:', err);
  process.exit(1);
});
