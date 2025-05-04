Okay, let's refactor the tests to focus solely on the database interaction and permission logic, removing the MCP layer testing.

We will:

1.  **Enhance `test/dbService.test.ts`**: Keep testing the `analyzeTables` functionality directly.
2.  **Create `test/connection.test.ts`**: Test `executeQuery` directly, specifically focusing on how it handles different query types (DQL, DML, DDL) based on the DML/DDL permission flags passed during pool creation.
3.  **Remove `test-tools.js`**: This script tests the MCP layer and is no longer needed for this focused testing.
4.  **Update `package.json`**: Remove the script for `test-tools.js` and adjust the main test script.
5.  **Keep `test-setup.js`**: This is still useful for initializing the database state needed for the direct tests.

---

**Phase 1: Update `test/dbService.test.ts`**

*   No major changes needed here, as it already tests the `dbService` directly. We'll just ensure it uses the test configuration properly.

*(No code changes needed for `test/dbService.test.ts` based on the last provided version, it looks good)*

---

**Phase 2: Create `test/connection.test.ts`**

*   **Action:** Create a new file `test/connection.test.ts`.
*   **Content:** Add the following code to test `executeQuery` with different permission settings.

```typescript
// test/connection.test.ts
import { createConnectionPool, endConnection, executeQuery } from "../src/connection";
import { MariaDBConfig } from "../src/types";

// Base test config - permissions will be overridden in describe blocks
const baseTestConfig: Omit<MariaDBConfig, 'allow_dml' | 'allow_ddl'> = {
    host: process.env.MARIADB_HOST || '127.0.0.1',
    port: parseInt(process.env.MARIADB_PORT || '10236', 10),
    user: process.env.MARIADB_USER || 'root',
    password: process.env.MARIADB_PASSWORD || '11111',
    database: 'mariadb_mcp_test_db', // Must match test-setup.js
};

const testDbName = baseTestConfig.database!;
const testTableName = 'test_connection_permissions'; // Use a dedicated table

// Helper function to manage pool creation/destruction per test suite
async function setupPoolWithPermissions(allow_dml: boolean, allow_ddl: boolean) {
    const config: MariaDBConfig = {
        ...baseTestConfig,
        allow_dml,
        allow_ddl,
    };
    // Ensure any existing pool is closed before creating a new one
    await endConnection();
    createConnectionPool(config); // Create pool with specific permissions
}

describe("executeQuery Permissions", () => {

    // Setup: Ensure test DB exists (assumes test-setup.js ran)
    // We'll manage the test table within the DDL tests or assume it exists for DML

    // == Scenario 1: DML=false, DDL=false (Default/Safest) ==
    describe("When DML=false, DDL=false", () => {
        beforeAll(async () => {
            await setupPoolWithPermissions(false, false);
            // Ensure the target table for DML tests exists if needed, drop the DDL test table
            try {
                await executeQuery(`DROP TABLE IF EXISTS ${testTableName}`, [], testDbName); // Cleanup DDL table
                // Ensure the 'test_users' table exists for SELECT/DML tests
                // (test-setup.js should have created this)
                await executeQuery(`SELECT 1 FROM test_users LIMIT 1`, [], testDbName);
            } catch (e) {
                console.warn(`Setup warning for DML=false/DDL=false: ${(e as Error).message}. Assuming test_users exists.`);
            }
        });
        afterAll(async () => await endConnection());

        it("should ALLOW DQL (SELECT)", async () => {
            await expect(executeQuery("SELECT 1 + 1 AS result", [], testDbName)).resolves.toBeDefined();
        });

        it("should ALLOW DQL (SHOW)", async () => {
            await expect(executeQuery("SHOW TABLES", [], testDbName)).resolves.toBeDefined();
        });

        it("should ALLOW DQL (DESCRIBE)", async () => {
             // Assuming test_users table exists from test-setup.js
            await expect(executeQuery("DESCRIBE test_users", [], testDbName)).resolves.toBeDefined();
        });

        it("should REJECT DML (INSERT)", async () => {
            const sql = `INSERT INTO test_users (name, email) VALUES ('test_reject', 'reject@example.com')`;
            await expect(executeQuery(sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        });

        it("should REJECT DML (UPDATE)", async () => {
            const sql = `UPDATE test_users SET age = 99 WHERE email = 'reject@example.com'`;
            await expect(executeQuery(sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        });

        it("should REJECT DML (DELETE)", async () => {
            const sql = `DELETE FROM test_users WHERE email = 'reject@example.com'`;
            await expect(executeQuery(sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        });

        it("should REJECT DDL (CREATE)", async () => {
            const sql = `CREATE TABLE ${testTableName} (id INT)`;
            await expect(executeQuery(sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        });

        it("should REJECT DDL (ALTER)", async () => {
            // Need a table to alter, this test might fail if CREATE is rejected first
            // Let's try altering the existing test_users table
            const sql = `ALTER TABLE test_users ADD COLUMN temp_col INT`;
            await expect(executeQuery(sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        });

        it("should REJECT DDL (DROP)", async () => {
            const sql = `DROP TABLE IF EXISTS test_users`; // Try dropping existing table
            await expect(executeQuery(sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        });
    });

    // == Scenario 2: DML=true, DDL=false ==
    describe("When DML=true, DDL=false", () => {
        const dmlTestEmail = 'dml_allowed@example.com';
        beforeAll(async () => {
            await setupPoolWithPermissions(true, false);
            // Cleanup previous test data and ensure DDL table doesn't exist
             try {
                await executeQuery(`DELETE FROM test_users WHERE email = '${dmlTestEmail}'`, [], testDbName);
                await executeQuery(`DROP TABLE IF EXISTS ${testTableName}`, [], testDbName); // Cleanup DDL table
            } catch (e) {
                 // If DML was rejected in previous run, the delete might fail, which is okay here.
                 // If DDL was rejected, drop will fail. Okay.
                 console.warn(`Setup warning for DML=true/DDL=false: ${(e as Error).message}`);
            }
        });
        afterAll(async () => {
            // Clean up inserted data
            try {
                 await executeQuery(`DELETE FROM test_users WHERE email = '${dmlTestEmail}'`, [], testDbName);
            } catch (e) { console.warn(`Cleanup warning DML=true: ${(e as Error).message}`); }
            await endConnection();
        });

        it("should ALLOW DQL (SELECT)", async () => {
            await expect(executeQuery("SELECT 1", [], testDbName)).resolves.toBeDefined();
        });

        it("should ALLOW DML (INSERT)", async () => {
            const sql = `INSERT INTO test_users (name, email) VALUES ('test_allow_dml', '${dmlTestEmail}')`;
            await expect(executeQuery(sql, [], testDbName)).resolves.toBeDefined();
            // Verify insert
            const check = await executeQuery(`SELECT COUNT(*) as count FROM test_users WHERE email = '${dmlTestEmail}'`, [], testDbName);
            expect(check.rows[0].count).toBe(1);
        });

         it("should ALLOW DML (UPDATE)", async () => {
            const sql = `UPDATE test_users SET age = 55 WHERE email = '${dmlTestEmail}'`;
            await expect(executeQuery(sql, [], testDbName)).resolves.toBeDefined();
            // Verify update
             const check = await executeQuery(`SELECT age FROM test_users WHERE email = '${dmlTestEmail}'`, [], testDbName);
             expect(check.rows[0].age).toBe(55);
        });

        it("should ALLOW DML (DELETE)", async () => {
            const sql = `DELETE FROM test_users WHERE email = '${dmlTestEmail}'`;
            await expect(executeQuery(sql, [], testDbName)).resolves.toBeDefined();
             // Verify delete
             const check = await executeQuery(`SELECT COUNT(*) as count FROM test_users WHERE email = '${dmlTestEmail}'`, [], testDbName);
             expect(check.rows[0].count).toBe(0);
        });

        it("should REJECT DDL (CREATE)", async () => {
            const sql = `CREATE TABLE ${testTableName} (id INT)`;
            await expect(executeQuery(sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        });

        it("should REJECT DDL (DROP)", async () => {
            const sql = `DROP TABLE IF EXISTS test_users`;
            await expect(executeQuery(sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        });
    });

    // == Scenario 3: DML=false, DDL=true ==
    describe("When DML=false, DDL=true", () => {
        beforeAll(async () => {
            await setupPoolWithPermissions(false, true);
            // Ensure DDL test table doesn't exist initially
            try {
                await executeQuery(`DROP TABLE IF EXISTS ${testTableName}`, [], testDbName);
            } catch (e) {
                 // If DDL was rejected in previous run, this fails, okay.
                 console.warn(`Setup warning for DML=false/DDL=true: ${(e as Error).message}`);
            }
        });
        afterAll(async () => {
             // Try to clean up DDL table if it exists
             try { await executeQuery(`DROP TABLE IF EXISTS ${testTableName}`, [], testDbName); } catch (e) {}
            await endConnection();
        });

        it("should ALLOW DQL (SELECT)", async () => {
            await expect(executeQuery("SELECT 1", [], testDbName)).resolves.toBeDefined();
        });

        it("should REJECT DML (INSERT)", async () => {
            const sql = `INSERT INTO test_users (name, email) VALUES ('test_reject_ddl', 'reject_ddl@example.com')`;
            await expect(executeQuery(sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        });

        it("should ALLOW DDL (CREATE)", async () => {
            const sql = `CREATE TABLE ${testTableName} (id INT PRIMARY KEY, name VARCHAR(50))`;
            await expect(executeQuery(sql, [], testDbName)).resolves.toBeDefined();
            // Verify by describing
            await expect(executeQuery(`DESCRIBE ${testTableName}`, [], testDbName)).resolves.toBeDefined();
        });

         it("should ALLOW DDL (ALTER)", async () => {
            // Assumes CREATE succeeded
            const sql = `ALTER TABLE ${testTableName} ADD COLUMN created_at TIMESTAMP`;
            await expect(executeQuery(sql, [], testDbName)).resolves.toBeDefined();
             // Verify by describing again
             const describeResult = await executeQuery(`DESCRIBE ${testTableName}`, [], testDbName);
             expect(describeResult.rows.some((col: any) => col.Field === 'created_at')).toBe(true);
        });

        it("should ALLOW DDL (DROP)", async () => {
             // Assumes CREATE/ALTER succeeded
            const sql = `DROP TABLE ${testTableName}`;
            await expect(executeQuery(sql, [], testDbName)).resolves.toBeDefined();
             // Verify by trying to describe (should fail)
            await expect(executeQuery(`DESCRIBE ${testTableName}`, [], testDbName)).rejects.toThrow();
        });
    });

     // == Scenario 4: DML=true, DDL=true ==
    describe("When DML=true, DDL=true", () => {
         const dmlTestEmail = 'dml_ddl_allowed@example.com';
         beforeAll(async () => {
            await setupPoolWithPermissions(true, true);
             // Cleanup previous test data and ensure DDL table doesn't exist
             try {
                await executeQuery(`DELETE FROM test_users WHERE email = '${dmlTestEmail}'`, [], testDbName);
                await executeQuery(`DROP TABLE IF EXISTS ${testTableName}`, [], testDbName);
            } catch (e) {
                 console.warn(`Setup warning for DML=true/DDL=true: ${(e as Error).message}`);
            }
        });
         afterAll(async () => {
             // Clean up inserted data and DDL table
             try { await executeQuery(`DELETE FROM test_users WHERE email = '${dmlTestEmail}'`, [], testDbName); } catch (e) {}
             try { await executeQuery(`DROP TABLE IF EXISTS ${testTableName}`, [], testDbName); } catch (e) {}
            await endConnection();
        });

         it("should ALLOW DQL (SELECT)", async () => {
            await expect(executeQuery("SELECT 1", [], testDbName)).resolves.toBeDefined();
        });

         it("should ALLOW DML (INSERT)", async () => {
            const sql = `INSERT INTO test_users (name, email) VALUES ('test_allow_both', '${dmlTestEmail}')`;
            await expect(executeQuery(sql, [], testDbName)).resolves.toBeDefined();
        });

         it("should ALLOW DDL (CREATE)", async () => {
            const sql = `CREATE TABLE ${testTableName} (id INT)`;
            await expect(executeQuery(sql, [], testDbName)).resolves.toBeDefined();
        });

         it("should ALLOW DDL (DROP)", async () => {
            const sql = `DROP TABLE ${testTableName}`;
            await expect(executeQuery(sql, [], testDbName)).resolves.toBeDefined();
        });
    });

});
```

---

**Phase 3: Remove `test-tools.js`**

*   **Action:** Delete the file `test-tools.js`.

---

**Phase 4: Update `package.json`**

*   **Action:** Modify the `scripts` section in `package.json`.
*   **Instruction:**
    *   Remove the `"test:tools": "node test-tools.js",` line.
    *   Remove the `"test:db": "..."` line (it's redundant now).
    *   Add or modify the main `"test"` script to run setup and then all Jest tests.

```json
{
  "name": "mariadb-mcp-server",
  "version": "0.0.1",
  // ... other properties ...
  "scripts": {
    "build": "tsc && node -e \"require('fs').chmodSync('dist/index.js', '755')\"",
    "prepare": "npm run build",
    "watch": "tsc --watch",
    "inspector": "npx @modelcontextprotocol/inspector dist/index.js",
    "test:setup": "node test-setup.js",
    "test": "npm run test:setup && npx jest" // Runs setup, then ALL *.test.ts files
    // Removed test:tools and test:db
  },
  // ... rest of package.json ...
}
```

---

**Phase 5: Run the Tests**

1.  Ensure your MariaDB server is running and accessible with the credentials defined in your environment (or `.env` file if `test-setup.js` and tests load it).
2.  Run the setup and tests:
    ```bash
    # Make sure MARIADB_* env vars are set appropriately for test-setup.js
    # (host, port, user, password - DML/DDL flags don't strictly matter for setup)
    npm test
    ```

You should see output from `test-setup.js` followed by Jest's test results for `dbService.test.ts` and `connection.test.ts`. The `connection.test.ts` results will show whether DML/DDL queries were correctly allowed or rejected based on the permissions set for each test scenario.
