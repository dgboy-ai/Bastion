const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.BASTION_CONN, ssl: { rejectUnauthorized: false } });
(async () => {
  const before = await pool.query("SELECT COUNT(*)::int AS c FROM agent_memory WHERE agent_id IN ('soc-analyst','soc-responder')");
  console.log("soc memories before reset:", before.rows[0].c);
  const d1 = await pool.query("DELETE FROM agent_memory WHERE agent_id IN ('soc-analyst','soc-responder')");
  const d2 = await pool.query("DELETE FROM agent_audit WHERE agent_id IN ('soc-analyst','soc-responder')");
  const d3 = await pool.query("DELETE FROM agent_entities WHERE agent_id IN ('soc-analyst','soc-responder')");
  console.log("deleted:", d1.rowCount, d2.rowCount, d3.rowCount);
  const after = await pool.query("SELECT COUNT(*)::int AS c FROM agent_memory WHERE agent_id IN ('soc-analyst','soc-responder')");
  console.log("soc memories after reset:", after.rows[0].c);
  await pool.end();
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
