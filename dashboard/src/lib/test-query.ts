import { Client } from "pg";

async function main() {
  const connectionString = "postgresql://among:CRDB_PASSWORD_REMOVED@bastion-memory-29951.j77.aws-ap-south-1.cockroachlabs.cloud:26257/defaultdb?sslmode=require";
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log("Connected successfully to CockroachDB");
    
    // 1. Describe table agent_audit
    console.log("\n--- TABLE SCHEMA FOR agent_audit ---");
    const columns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'agent_audit'
    `);
    console.log(columns.rows);
    
    // 2. Query some rows from agent_audit
    console.log("\n--- SAMPLE ROWS FROM agent_audit ---");
    const sample = await client.query("SELECT * FROM agent_audit LIMIT 5");
    console.log(sample.rows);
    
  } catch (err: any) {
    console.error("Error executing query:", err.message);
  } finally {
    await client.end();
  }
}

main();
