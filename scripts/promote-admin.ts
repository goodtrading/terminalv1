/**
 * Promote a specific user to admin role and active status.
 * Usage: DATABASE_URL="..." tsx scripts/promote-admin.ts email@example.com
 */
import "dotenv/config";
import pg from "pg";

async function main() {
  const logPrefix = "[promote-admin]";
  console.log(logPrefix, "starting...");
  
  const email = process.argv[2];
  if (!email) {
    console.error(logPrefix, "ERROR: email argument required");
    console.error(logPrefix, "Usage: DATABASE_URL=\"...\" tsx scripts/promote-admin.ts email@example.com");
    process.exit(1);
  }
  
  console.log(logPrefix, "target email:", email);
  
  const url = process.env.DATABASE_URL;
  console.log(logPrefix, "DATABASE_URL present:", !!url);
  
  if (!url) {
    console.error(logPrefix, "DATABASE_URL is not set");
    process.exit(1);
  }
  
  const pool = new pg.Pool({ connectionString: url });
  
  try {
    console.log(logPrefix, "testing DB connection...");
    const testResult = await pool.query('SELECT 1');
    console.log(logPrefix, "DB connection test:", testResult.rows.length > 0 ? "OK" : "FAILED");
    
    console.log(logPrefix, "checking if user exists...");
    const userCheck = await pool.query('SELECT id, email, role, status FROM users WHERE email = $1', [email]);
    
    if (userCheck.rows.length === 0) {
      console.error(logPrefix, "ERROR: user not found with email:", email);
      process.exit(1);
    }
    
    const user = userCheck.rows[0];
    console.log(logPrefix, "user found:", { id: user.id, email: user.email, role: user.role, status: user.status });
    
    if (user.role === 'admin' && user.status === 'active') {
      console.log(logPrefix, "user is already admin and active - no changes needed");
      return;
    }
    
    console.log(logPrefix, "promoting user to admin and active status...");
    await pool.query(
      'UPDATE users SET role = $1, status = $2 WHERE email = $3',
      ['admin', 'active', email]
    );
    
    console.log(logPrefix, "user promoted successfully");
    
    const updatedCheck = await pool.query('SELECT id, email, role, status FROM users WHERE email = $1', [email]);
    const updatedUser = updatedCheck.rows[0];
    console.log(logPrefix, "updated user:", { id: updatedUser.id, email: updatedUser.email, role: updatedUser.role, status: updatedUser.status });
    
  } finally {
    await pool.end();
    console.log(logPrefix, "done");
  }
}

main().catch((e) => {
  console.error("[promote-admin] FAILED:", e);
  process.exit(1);
});
