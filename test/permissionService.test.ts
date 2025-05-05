// test/permissionService.test.ts
import { checkPermissions } from "../src/permissionService.js"; // Adjust path as necessary

describe("PermissionService: checkPermissions", () => {

    // --- DQL Tests (Should always be allowed) ---
    describe("DQL Queries", () => {
        const dqlQueries = [
            "SELECT * FROM users",
            "   SELECT id, name FROM products WHERE id = 1; ", // Extra whitespace and ending semicolon
            "SHOW DATABASES",
            "SHOW TABLES FROM my_db",
            "DESCRIBE users",
            "DESC orders",
            "EXPLAIN SELECT * FROM logs WHERE timestamp > NOW() - INTERVAL 1 HOUR",
            "/* Comment */ SELECT column /* another comment */ FROM table -- line comment",
        ];

        test.each(dqlQueries)("should ALLOW '%s' regardless of flags", (query) => {
            expect(checkPermissions(query, false, false)).toBe(true);
            expect(checkPermissions(query, true, false)).toBe(true);
            expect(checkPermissions(query, false, true)).toBe(true);
            expect(checkPermissions(query, true, true)).toBe(true);
        });
    });

    // --- DML Tests (Conditional on allowDml) ---
    describe("DML Queries", () => {
        const dmlQueries = [
            "INSERT INTO users (name, email) VALUES ('Test', 'test@example.com')",
            "UPDATE products SET price = 99.99 WHERE id = 5",
            "DELETE FROM logs WHERE timestamp < '2023-01-01'",
            "REPLACE INTO config (key, value) VALUES ('theme', 'dark')",
        ];

        test.each(dmlQueries)("should ALLOW '%s' when allowDml=true", (query) => {
            expect(checkPermissions(query, true, false)).toBe(true);
            expect(checkPermissions(query, true, true)).toBe(true);
        });

        test.each(dmlQueries)("should REJECT '%s' when allowDml=false", (query) => {
            expect(checkPermissions(query, false, false)).toBe(false);
            expect(checkPermissions(query, false, true)).toBe(false);
        });
    });

    // --- DDL Tests (Conditional on allowDdl) ---
    describe("DDL Queries", () => {
        const ddlQueries = [
            "CREATE TABLE new_table (id INT PRIMARY KEY)",
            "ALTER TABLE users ADD COLUMN last_login TIMESTAMP",
            "DROP TABLE old_logs",
            "TRUNCATE TABLE staging_data",
            "RENAME TABLE products TO items",
        ];

        test.each(ddlQueries)("should ALLOW '%s' when allowDdl=true", (query) => {
            expect(checkPermissions(query, false, true)).toBe(true);
            expect(checkPermissions(query, true, true)).toBe(true);
        });

        test.each(ddlQueries)("should REJECT '%s' when allowDdl=false", (query) => {
            expect(checkPermissions(query, false, false)).toBe(false);
            expect(checkPermissions(query, true, false)).toBe(false);
        });
    });

    // --- Always Disallowed Commands ---
    describe("Disallowed Commands", () => {
         const disallowedQueries = [
            "GRANT SELECT ON db.* TO 'user'@'localhost'",
            "REVOKE ALL PRIVILEGES ON *.* FROM 'user'@'%'",
            "SET SESSION sql_mode = 'TRADITIONAL'",
            "LOCK TABLES users WRITE",
            "UNLOCK TABLES",
            "CALL process_daily_sales()",
            "USE mysql",
            "BEGIN",
            "COMMIT",
            "ROLLBACK",
            "START TRANSACTION",
            "PREPARE stmt1 FROM 'SELECT * FROM users WHERE id = ?'",
            "EXECUTE stmt1 USING @user_id",
            "DEALLOCATE PREPARE stmt1",
         ];

         test.each(disallowedQueries)("should REJECT '%s' regardless of flags", (query) => {
            expect(checkPermissions(query, false, false)).toBe(false);
            expect(checkPermissions(query, true, false)).toBe(false);
            expect(checkPermissions(query, false, true)).toBe(false);
            expect(checkPermissions(query, true, true)).toBe(false);
         });
    });

    // --- Invalid and Edge Cases ---
    describe("Invalid / Edge Cases", () => {
        test("should REJECT empty string", () => {
            expect(checkPermissions("", false, false)).toBe(false);
        });

         test("should REJECT query with only comments", () => {
            expect(checkPermissions("-- SELECT * FROM users", false, false)).toBe(false);
            expect(checkPermissions("/* SELECT * FROM users */", false, false)).toBe(false);
        });

         test("should REJECT multiple statements (semicolon not at end)", () => {
            expect(checkPermissions("SELECT * FROM users; DELETE FROM logs;", true, true)).toBe(false);
            expect(checkPermissions("SELECT 1; SELECT 2", true, true)).toBe(false);
        });

         test("should ALLOW multiple statements if semicolon is at the very end", () => {
            // Note: This edge case might depend on exact DB behavior, but the validator allows it.
            expect(checkPermissions("SELECT * FROM users;", true, true)).toBe(true);
        });

         test("should REJECT unrecognized commands", () => {
            expect(checkPermissions("FLUSH PRIVILEGES", true, true)).toBe(false); // Example of unlisted command
            expect(checkPermissions("OPTIMIZE TABLE users", true, true)).toBe(false);
         });
    });
});