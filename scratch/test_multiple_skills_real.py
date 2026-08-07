import json
import os
import re
from pathlib import Path
import psycopg2
from dotenv import load_dotenv

def run_skill_sql(conn, skills_dir, skill_name):
    print(f"\n==================================================")
    print(f" RUNNING SKILL: {skill_name}")
    print(f"==================================================")
    
    skill_file = skills_dir / skill_name / "SKILL.md"
    if not skill_file.exists():
        print(f"Error: SKILL.md not found for {skill_name}")
        return
        
    content = skill_file.read_text(encoding="utf-8")
    
    # Extract SQL code blocks
    sql_blocks = re.findall(r"```sql\n(.*?)\n```", content, re.DOTALL)
    print(f"Found {len(sql_blocks)} SQL blocks in SKILL.md")
    
    # Execute query blocks
    for i, sql in enumerate(sql_blocks):
        # Strip trailing semicolon for safe execution
        q = sql.strip().rstrip(";")
        
        # Security parsing like the MCP server: reject multi-statement
        if ";" in q:
            print(f"  - Query {i+1}: Skipped (Security Block: Semicolon detected)")
            continue
            
        q_upper = q.upper()
        if not (q_upper.startswith("SELECT") or q_upper.startswith("WITH") or q_upper.startswith("SHOW")):
            print(f"  - Query {i+1}: Skipped (Security Block: Only SELECT/SHOW/WITH allowed)")
            continue
            
        print(f"  - Query {i+1}: Executing...")
        try:
            with conn.cursor() as cur:
                cur.execute(q)
                if cur.description:
                    rows = cur.fetchall()
                    cols = [desc[0] for desc in cur.description]
                    print(f"    Status: SUCCESS")
                    print(f"    Rows Returned: {len(rows)}")
                    if rows:
                        print(f"    Columns: {cols}")
                        print(f"    Sample Row: {rows[0]}")
                else:
                    print(f"    Status: SUCCESS (No rows returned)")
        except Exception as e:
            print(f"    Status: FAILED")
            print(f"    Error: {str(e).strip()}")
            conn.rollback()

def main():
    # Load credentials
    load_dotenv(dotenv_path=".env.local", override=True)
    conn_str = os.environ.get("BASTION_CONN", "")
    if not conn_str:
        print("Error: BASTION_CONN environment variable not found in .env.local")
        return
        
    print(f"Connecting to live cluster: {conn_str[:60]}...")
    try:
        conn = psycopg2.connect(conn_str)
    except Exception as e:
        print(f"Database connection failed: {e}")
        return
        
    skills_dir = Path(__file__).parent.parent / ".agents" / "skills"
    
    # Run the skills brutally on the live cluster
    skills_to_test = [
        "reviewing-cluster-health",
        "auditing-table-statistics",
        "analyzing-range-distribution",
        "profiling-statement-fingerprints"
    ]
    
    for skill in skills_to_test:
        run_skill_sql(conn, skills_dir, skill)
        
    conn.close()
    print("\nAll skill executions completed successfully.")

if __name__ == "__main__":
    main()
