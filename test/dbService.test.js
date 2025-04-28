import { analyzeTables } from "../src/dbService.js";
import { getConfigFromEnv } from "../src/connection.js"; // Assuming getConfigFromEnv is needed for database name
// Note: This test suite assumes that the test database and tables have been set up
// by running the test-setup.js script (e.g., via `npm run test:setup`) before running these tests.
describe("dbService", () => {
    let testDbName;
    beforeAll(async () => {
        // Get the test database name from the environment configuration
        const config = await getConfigFromEnv();
        testDbName = config.database; // Assert as string since we check below
        if (!testDbName) {
            throw new Error("Test database name not configured in environment.");
        }
    });
    describe("analyzeTables", () => {
        it("should analyze table schema with BASIC detail level", async () => {
            const tableNames = ["test_users"];
            const detailLevel = "BASIC";
            const result = await analyzeTables(tableNames, detailLevel, testDbName);
            expect(result).toHaveProperty("test_users");
            expect(result.test_users).toHaveProperty("columns");
            expect(Array.isArray(result.test_users.columns)).toBe(true);
            expect(result.test_users.columns.length).toBeGreaterThan(0);
            // Basic check for column structure (name and type)
            result.test_users.columns.forEach((col) => {
                expect(col).toHaveProperty("name");
                expect(typeof col.name).toBe("string");
                expect(col).toHaveProperty("type");
                expect(typeof col.type).toBe("string");
            });
            // Ensure other details are NOT present in BASIC level
            expect(result.test_users).not.toHaveProperty("foreign_keys");
            expect(result.test_users).not.toHaveProperty("indexes");
        });
        it("should analyze table schema with STANDARD detail level", async () => {
            const tableNames = ["test_users", "test_orders"];
            const detailLevel = "STANDARD";
            const result = await analyzeTables(tableNames, detailLevel, testDbName);
            expect(result).toHaveProperty("test_users");
            expect(result.test_users).toHaveProperty("columns");
            expect(Array.isArray(result.test_users.columns)).toBe(true);
            expect(result.test_users.columns.length).toBeGreaterThan(0);
            expect(result.test_users).toHaveProperty("foreign_keys");
            expect(Array.isArray(result.test_users.foreign_keys)).toBe(true);
            expect(result.test_users).toHaveProperty("indexes");
            expect(Array.isArray(result.test_users.indexes)).toBe(true);
            // Check for expected foreign key structure (basic)
            const orderTableFKs = result.test_orders?.foreign_keys;
            expect(orderTableFKs).toBeDefined();
            expect(orderTableFKs.length).toBeGreaterThan(0);
            expect(orderTableFKs[0]).toHaveProperty("constraint_name");
            expect(orderTableFKs[0]).toHaveProperty("column_name");
            expect(orderTableFKs[0]).toHaveProperty("referenced_table");
            expect(orderTableFKs[0]).toHaveProperty("referenced_column");
            // Check for expected index structure (basic)
            const userTableIndexes = result.test_users?.indexes;
            expect(userTableIndexes).toBeDefined();
            expect(userTableIndexes.length).toBeGreaterThan(0);
            expect(userTableIndexes[0]).toHaveProperty("index_name");
        });
        it("should analyze table schema with FULL detail level", async () => {
            const tableNames = ["test_users", "test_orders"];
            const detailLevel = "FULL";
            const result = await analyzeTables(tableNames, detailLevel, testDbName);
            expect(result).toHaveProperty("test_users");
            expect(result.test_users).toHaveProperty("columns");
            expect(Array.isArray(result.test_users.columns)).toBe(true);
            expect(result.test_users.columns.length).toBeGreaterThan(0);
            expect(result.test_users).toHaveProperty("foreign_keys");
            expect(Array.isArray(result.test_users.foreign_keys)).toBe(true);
            expect(result.test_users).toHaveProperty("indexes");
            expect(Array.isArray(result.test_users.indexes)).toBe(true);
            // Check for expected full column structure
            const userTableColumns = result.test_users?.columns;
            expect(userTableColumns).toBeDefined();
            expect(userTableColumns.length).toBeGreaterThan(0);
            expect(userTableColumns[0]).toHaveProperty("is_nullable");
            expect(userTableColumns[0]).toHaveProperty("key");
            expect(userTableColumns[0]).toHaveProperty("default");
            expect(userTableColumns[0]).toHaveProperty("extra");
            expect(userTableColumns[0]).toHaveProperty("comment");
            expect(userTableColumns[0]).toHaveProperty("character_set");
            expect(userTableColumns[0]).toHaveProperty("collation");
            // Check for expected full foreign key structure
            const orderTableFKs = result.test_orders?.foreign_keys;
            expect(orderTableFKs).toBeDefined();
            expect(orderTableFKs.length).toBeGreaterThan(0);
            expect(orderTableFKs[0]).toHaveProperty("on_update");
            expect(orderTableFKs[0]).toHaveProperty("on_delete");
            // Check for expected full index structure
            const userTableIndexes = result.test_users?.indexes;
            expect(userTableIndexes).toBeDefined();
            expect(userTableIndexes.length).toBeGreaterThan(0);
            // Full index details from SHOW INDEX include more columns, e.g., Column_name, Seq_in_index, etc.
            expect(userTableIndexes[0]).toHaveProperty("Column_name");
            expect(userTableIndexes[0]).toHaveProperty("Seq_in_index");
            expect(userTableIndexes[0]).toHaveProperty("Collation");
            expect(userTableIndexes[0]).toHaveProperty("Cardinality");
        });
        it("should handle invalid table names gracefully", async () => {
            const tableNames = ["test_users", "invalid-table!"];
            const detailLevel = "STANDARD";
            const result = await analyzeTables(tableNames, detailLevel, testDbName);
            expect(result).toHaveProperty("test_users");
            expect(result.test_users).not.toHaveProperty("error"); // Valid table should not have an error
            expect(result).toHaveProperty("invalid-table!");
            expect(result["invalid-table!"]).toHaveProperty("error");
            expect(result["invalid-table!"].error).toContain("Invalid table name format.");
        });
        it("should throw error for empty tableNames array", async () => {
            const tableNames = [];
            const detailLevel = "STANDARD";
            await expect(analyzeTables(tableNames, detailLevel, testDbName)).rejects.toThrow("table_names array cannot be empty");
        });
        it("should use default database from config if not provided", async () => {
            // This test requires the MARIADB_DATABASE env var to be set to the test DB
            // Assuming test-setup.js or environment configuration handles this.
            const tableNames = ["test_users"];
            const detailLevel = "BASIC";
            // Call without providing database argument
            const result = await analyzeTables(tableNames, detailLevel);
            expect(result).toHaveProperty("test_users");
            expect(result.test_users).toHaveProperty("columns");
            expect(Array.isArray(result.test_users.columns)).toBe(true);
            expect(result.test_users.columns.length).toBeGreaterThan(0);
        });
    });
    // TODO: Add tests for individual fetch functions if deemed necessary
    // describe("fetchBasicColumnDetails", () => { ... });
    // describe("fetchFullColumnDetails", () => { ... });
    // describe("fetchForeignKeyDetails", () => { ... });
    // describe("fetchBasicIndexDetails", () => { ... });
    // describe("fetchFullIndexDetails", () => { ... });
});
