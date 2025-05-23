// Note: This file tests the integration of executeQuery with the permission service.
// It verifies that allowed queries run and disallowed queries are rejected based on flags.
// Exhaustive testing of all command types against all permission flags
// is done in permissionService.test.ts.

// test/connection.test.ts
import mariadb from "mariadb"; // Added import
import { createConnectionPool, endConnection, executeQuery, PoolConnectionDetails } from "../src/connection.js"; // Added PoolConnectionDetails
import { MariaDBConfig } from "../src/types.js";

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

// REMOVED setupPoolWithPermissions helper function

describe("executeQuery Permissions", () => {

    // Setup: Ensure test DB exists (assumes test-setup.js ran)
    // We'll manage the test table within the DDL tests or assume it exists for DML

    // == Scenario 1: DML=false, DDL=false (Default/Safest) ==
    describe("When DML=false, DDL=false", () => {
        let currentPool: mariadb.Pool;
        let currentAllowDml: boolean;
        let currentAllowDdl: boolean;

        beforeAll(async () => {
            // Create pool specifically for this suite
            const config: MariaDBConfig = { ...baseTestConfig, allow_dml: false, allow_ddl: false };
            const poolDetails = createConnectionPool(config);
            currentPool = poolDetails.pool;
            currentAllowDml = poolDetails.allowDml;
            currentAllowDdl = poolDetails.allowDdl;

            // Ensure the target table for DML tests exists if needed, drop the DDL test table
            try {
                // Use the created pool and permissions for setup queries
                await executeQuery(currentPool, currentAllowDml, currentAllowDdl, `DROP TABLE IF EXISTS ${testTableName}`, [], testDbName); // Cleanup DDL table
                // Ensure the 'test_users' table exists for SELECT/DML tests
                await executeQuery(currentPool, currentAllowDml, currentAllowDdl, `SELECT 1 FROM test_users LIMIT 1`, [], testDbName);
            } catch (e) {
                console.warn(`Setup warning for DML=false/DDL=false: ${(e as Error).message}. Assuming test_users exists.`);
            }
        });

        afterAll(async () => await endConnection(currentPool)); // Pass the specific pool to end

        it("should ALLOW DQL (SELECT)", async () => {
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, "SELECT 1 + 1 AS result", [], testDbName)).resolves.toBeDefined();
        });

        it("should ALLOW DQL (SHOW)", async () => {
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, "SHOW TABLES", [], testDbName)).resolves.toBeDefined();
        });

        it("should ALLOW DQL (DESCRIBE)", async () => {
             // Assuming test_users table exists from test-setup.js
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, "DESCRIBE test_users", [], testDbName)).resolves.toBeDefined();
        });

        it("should REJECT DML (INSERT)", async () => {
            const sql = `INSERT INTO test_users (name, email) VALUES ('test_reject', 'reject@example.com')`;
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        });

        it("should REJECT DML (UPDATE)", async () => {
            const sql = `UPDATE test_users SET age = 99 WHERE email = 'reject@example.com'`;
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        });

        it("should REJECT DML (DELETE)", async () => {
            const sql = `DELETE FROM test_users WHERE email = 'reject@example.com'`;
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        });

        it("should REJECT DDL (CREATE)", async () => {
            const sql = `CREATE TABLE ${testTableName} (id INT)`;
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        });

        it("should REJECT DDL (ALTER)", async () => {
            // Need a table to alter, this test might fail if CREATE is rejected first
            // Let's try altering the existing test_users table
            const sql = `ALTER TABLE test_users ADD COLUMN temp_col INT`;
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        });

        it("should REJECT DDL (DROP)", async () => {
            const sql = `DROP TABLE IF EXISTS test_users`; // Try dropping existing table
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        });
    });

    // == Scenario 2: DML=true, DDL=false ==
    describe("When DML=true, DDL=false", () => {
        let currentPool: mariadb.Pool;
        let currentAllowDml: boolean;
        let currentAllowDdl: boolean;
        const dmlTestEmail = 'dml_allowed@example.com';

        beforeAll(async () => {
            // Create pool specifically for this suite
            const config: MariaDBConfig = { ...baseTestConfig, allow_dml: true, allow_ddl: false };
            const poolDetails = createConnectionPool(config);
            currentPool = poolDetails.pool;
            currentAllowDml = poolDetails.allowDml;
            currentAllowDdl = poolDetails.allowDdl;

            // Cleanup previous test data and ensure DDL table doesn't exist
             try {
                // Use the created pool and permissions for setup queries
                await executeQuery(currentPool, currentAllowDml, currentAllowDdl, `DELETE FROM test_users WHERE email = '${dmlTestEmail}'`, [], testDbName);
                await executeQuery(currentPool, currentAllowDml, currentAllowDdl, `DROP TABLE IF EXISTS ${testTableName}`, [], testDbName); // Cleanup DDL table
            } catch (e) {
                 // If DML was rejected in previous run, the delete might fail, which is okay here.
                 // If DDL was rejected, drop will fail. Okay.
                 console.warn(`Setup warning for DML=true/DDL=false: ${(e as Error).message}`);
            }
        });

        afterAll(async () => {
            // Clean up inserted data using the correct pool/permissions
            try {
                 await executeQuery(currentPool, currentAllowDml, currentAllowDdl, `DELETE FROM test_users WHERE email = '${dmlTestEmail}'`, [], testDbName);
            } catch (e) { console.warn(`Cleanup warning DML=true: ${(e as Error).message}`); }
            await endConnection(currentPool); // Pass the specific pool to end
        });

        it("should ALLOW DQL (SELECT)", async () => {
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, "SELECT 1", [], testDbName)).resolves.toBeDefined();
        });

        it("should ALLOW DML (INSERT)", async () => {
            const sql = `INSERT INTO test_users (name, email) VALUES ('test_allow_dml', '${dmlTestEmail}')`;
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).resolves.toBeDefined();
            // Verify insert
            const check = await executeQuery(currentPool, currentAllowDml, currentAllowDdl, `SELECT COUNT(*) as count FROM test_users WHERE email = '${dmlTestEmail}'`, [], testDbName);
            expect(check.rows[0].count).toBe(1);
        });

         it("should ALLOW DML (UPDATE)", async () => {
            const sql = `UPDATE test_users SET age = 55 WHERE email = '${dmlTestEmail}'`;
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).resolves.toBeDefined();
            // Verify update
             const check = await executeQuery(currentPool, currentAllowDml, currentAllowDdl, `SELECT age FROM test_users WHERE email = '${dmlTestEmail}'`, [], testDbName);
             expect(check.rows[0].age).toBe(55);
        });

        it("should ALLOW DML (DELETE)", async () => {
            const sql = `DELETE FROM test_users WHERE email = '${dmlTestEmail}'`;
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).resolves.toBeDefined();
             // Verify delete
             const check = await executeQuery(currentPool, currentAllowDml, currentAllowDdl, `SELECT COUNT(*) as count FROM test_users WHERE email = '${dmlTestEmail}'`, [], testDbName);
             expect(check.rows[0].count).toBe(0);
        });

        it("should REJECT DDL (CREATE)", async () => {
            const sql = `CREATE TABLE ${testTableName} (id INT)`;
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        });

        // Duplicate test removed for clarity, assuming it was accidental
        // it("should REJECT DDL (CREATE)", async () => {
        //     const sql = `CREATE TABLE ${testTableName} (id INT)`;
        //     await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        // });
    });

    // == Scenario 3: DML=false, DDL=true ==
    describe("When DML=false, DDL=true", () => {
        let currentPool: mariadb.Pool;
        let currentAllowDml: boolean;
        let currentAllowDdl: boolean;

        beforeAll(async () => {
            // Create pool specifically for this suite
            const config: MariaDBConfig = { ...baseTestConfig, allow_dml: false, allow_ddl: true };
            const poolDetails = createConnectionPool(config);
            currentPool = poolDetails.pool;
            currentAllowDml = poolDetails.allowDml;
            currentAllowDdl = poolDetails.allowDdl;

            // Ensure DDL test table doesn't exist initially
            try {
                // Use the created pool and permissions for setup queries
                await executeQuery(currentPool, currentAllowDml, currentAllowDdl, `DROP TABLE IF EXISTS ${testTableName}`, [], testDbName);
            } catch (e) {
                 // If DDL was rejected in previous run, this fails, okay.
                 console.warn(`Setup warning for DML=false/DDL=true: ${(e as Error).message}`);
            }
        });

        afterAll(async () => {
             // Try to clean up DDL table if it exists using the correct pool/permissions
             try { await executeQuery(currentPool, currentAllowDml, currentAllowDdl, `DROP TABLE IF EXISTS ${testTableName}`, [], testDbName); } catch (e) {}
            await endConnection(currentPool); // Pass the specific pool to end
        });

        it("should ALLOW DQL (SELECT)", async () => {
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, "SELECT 1", [], testDbName)).resolves.toBeDefined();
        });

        it("should REJECT DML (INSERT)", async () => {
            const sql = `INSERT INTO test_users (name, email) VALUES ('test_reject_ddl', 'reject_ddl@example.com')`;
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).rejects.toThrow(/Query not allowed|not permitted/);
        });

        it("should ALLOW DDL (CREATE)", async () => {
            const sql = `CREATE TABLE ${testTableName} (id INT PRIMARY KEY, name VARCHAR(50))`;
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).resolves.toBeDefined();
            // Verify by describing
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, `DESCRIBE ${testTableName}`, [], testDbName)).resolves.toBeDefined();
        });

         it("should ALLOW DDL (ALTER)", async () => {
            // Assumes CREATE succeeded
            const sql = `ALTER TABLE ${testTableName} ADD COLUMN created_at TIMESTAMP`;
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).resolves.toBeDefined();
             // Verify by describing again
             const describeResult = await executeQuery(currentPool, currentAllowDml, currentAllowDdl, `DESCRIBE ${testTableName}`, [], testDbName);
             expect(describeResult.rows.some((col: any) => col.Field === 'created_at')).toBe(true);
        });

        it("should ALLOW DDL (DROP)", async () => {
             // Assumes CREATE/ALTER succeeded
            const sql = `DROP TABLE ${testTableName}`;
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).resolves.toBeDefined();
             // Verify by trying to describe (should fail)
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, `DESCRIBE ${testTableName}`, [], testDbName)).rejects.toThrow();
        });
    });

     // == Scenario 4: DML=true, DDL=true ==
    describe("When DML=true, DDL=true", () => {
        let currentPool: mariadb.Pool;
        let currentAllowDml: boolean;
        let currentAllowDdl: boolean;
        const dmlTestEmail = 'dml_ddl_allowed@example.com';

        beforeAll(async () => {
            // Create pool specifically for this suite
            const config: MariaDBConfig = { ...baseTestConfig, allow_dml: true, allow_ddl: true };
            const poolDetails = createConnectionPool(config);
            currentPool = poolDetails.pool;
            currentAllowDml = poolDetails.allowDml;
            currentAllowDdl = poolDetails.allowDdl;

             // Cleanup previous test data and ensure DDL table doesn't exist
             try {
                // Use the created pool and permissions for setup queries
                await executeQuery(currentPool, currentAllowDml, currentAllowDdl, `DELETE FROM test_users WHERE email = '${dmlTestEmail}'`, [], testDbName);
                await executeQuery(currentPool, currentAllowDml, currentAllowDdl, `DROP TABLE IF EXISTS ${testTableName}`, [], testDbName);
            } catch (e) {
                 console.warn(`Setup warning for DML=true/DDL=true: ${(e as Error).message}`);
            }
        });

         afterAll(async () => {
             // Clean up inserted data and DDL table using the correct pool/permissions
             try { await executeQuery(currentPool, currentAllowDml, currentAllowDdl, `DELETE FROM test_users WHERE email = '${dmlTestEmail}'`, [], testDbName); } catch (e) {}
             try { await executeQuery(currentPool, currentAllowDml, currentAllowDdl, `DROP TABLE IF EXISTS ${testTableName}`, [], testDbName); } catch (e) {}
            await endConnection(currentPool); // Pass the specific pool to end
        });

         it("should ALLOW DQL (SELECT)", async () => {
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, "SELECT 1", [], testDbName)).resolves.toBeDefined();
        });

         it("should ALLOW DML (INSERT)", async () => {
            const sql = `INSERT INTO test_users (name, email) VALUES ('test_allow_both', '${dmlTestEmail}')`;
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).resolves.toBeDefined();
            // Verify insert
            const check = await executeQuery(currentPool, currentAllowDml, currentAllowDdl, `SELECT COUNT(*) as count FROM test_users WHERE email = '${dmlTestEmail}'`, [], testDbName);
            expect(check.rows[0].count).toBe(1);
        });

         it("should ALLOW DDL (CREATE)", async () => {
            const sql = `CREATE TABLE ${testTableName} (id INT PRIMARY KEY, name VARCHAR(50))`; // Use a more complete CREATE for verification
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).resolves.toBeDefined();
            // Verify by describing
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, `DESCRIBE ${testTableName}`, [], testDbName)).resolves.toBeDefined();
        });

         it("should ALLOW DDL (DROP)", async () => {
            const sql = `DROP TABLE ${testTableName}`;
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, sql, [], testDbName)).resolves.toBeDefined();
            // Verify by trying to describe (should fail)
            await expect(executeQuery(currentPool, currentAllowDml, currentAllowDdl, `DESCRIBE ${testTableName}`, [], testDbName)).rejects.toThrow();
        });
    });

});