/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");

async function main() {
  const client = new Client({
    connectionString: "postgresql://among:yIxLBZOZKwEw6-WwPq_54w@bastion-memory-29951.j77.aws-ap-south-1.cockroachlabs.cloud:26257/defaultdb",
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const tables = ["agent_memory", "agent_entities", "agent_relations", "agent_coordination"];
  for (const t of tables) {
    const cols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [t]);
    console.log(`\n=== ${t} ===`);
    cols.rows.forEach(r => console.log(`  ${r.column_name}  (${r.data_type})`));
    const sample = await client.query(`SELECT * FROM ${t} LIMIT 1`);
    if (sample.rows[0]) console.log("  SAMPLE:", JSON.stringify(sample.rows[0]).substring(0, 200));
  }

  await client.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
