# Plan: Extract Permission Logic into `permissionService.ts`

**Goal:** Improve code structure, testability, and separation of concerns by moving SQL query permission validation logic from `src/validators.ts` into a new, dedicated `src/permissionService.ts` module.

**Prerequisites:**
*   Access to the project's file system.
*   Ability to read, write, create, and delete files.
*   Ability to execute shell commands (`npm run build`, `npm test`).
*   The previous test refactoring (removing `test-tools.js`, creating `test/connection.test.ts`) has been completed.

---

## Phase 1: Create `permissionService.ts` and Migrate Logic

**Objective:** Create the new service file and move the core validation constants and functions into it.

**Step 1.1: Create `src/permissionService.ts`**
*   **Action:** Create a new file named `src/permissionService.ts`.
*   **Instruction:** Populate the new file with the following content. This includes the command category constants, the `normalizeQuery` helper, and the main checking function `checkPermissions` (renamed from `isAllowedQuery`).

    ```typescript
    /**
     * Service for validating SQL query permissions based on defined rules.
     */

    // Command Categories
    const DQL_COMMANDS = [ // Data Query Language (Always Allowed)
      "SELECT",
      "SHOW",
      "DESCRIBE",
      "DESC",
      "EXPLAIN",
    ];

    const DML_COMMANDS = [ // Data Manipulation Language (Conditional)
      "INSERT",
      "UPDATE",
      "DELETE",
      "REPLACE",
      // Consider adding MERGE if applicable/needed
    ];

    const DDL_COMMANDS = [ // Data Definition Language (Conditional)
      "CREATE",
      "ALTER",
      "DROP",
      "TRUNCATE",
      "RENAME",
      // Consider adding other DDL like COMMENT ON if needed
    ];

    // List of always disallowed SQL commands (for security/stability)
    const ALWAYS_DISALLOWED_COMMANDS = [
      "GRANT",
      "REVOKE",
      "SET", // Can change session variables, potentially unsafe
      "LOCK", // LOCK TABLES can cause deadlocks
      "UNLOCK", // UNLOCK TABLES
      "CALL", // Stored procedures might do anything
      "EXEC", // Synonyms for potentially unsafe operations
      "EXECUTE",
      "PREPARE", // Prepared statements handled differently
      "DEALLOCATE",
      "START", // Transaction control handled elsewhere if needed
      "BEGIN",
      "COMMIT",
      "ROLLBACK",
      "SAVEPOINT",
      "USE", // Database context should be passed explicitly to executeQuery
      // Add others as needed, e.g., LOAD DATA INFILE
    ];

    /**
     * Normalizes a SQL query by removing comments and reducing whitespace.
     * @param query SQL query string.
     * @returns Normalized query string in uppercase.
     */
    function normalizeQuery(query: string): string {
      if (!query || typeof query !== 'string') {
        return '';
      }
      return query
        .replace(/--.*$/gm, "") // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, "") // Remove multi-line comments
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim()
        .toUpperCase();
    }

    /**
     * Checks if a SQL query is allowed based on the configured permissions.
     * Logs the reason for rejection internally.
     * @param query SQL query to validate.
     * @param allowDml Whether DML operations are permitted.
     * @param allowDdl Whether DDL operations are permitted.
     * @returns true if the query is allowed, false otherwise.
     */
    export function checkPermissions(query: string, allowDml: boolean, allowDdl: boolean): boolean {
      const normalizedQuery = normalizeQuery(query);

      if (!normalizedQuery) {
        console.error("[PermissionService] Query rejected: Empty or invalid query.");
        return false;
      }

      // Basic check for multiple statements (imperfect but catches simple cases)
      // We disallow semicolons unless it's the very last character.
      if (normalizedQuery.includes(";") && !normalizedQuery.endsWith(";")) {
         console.error("[PermissionService] Query rejected: Multiple statements detected (contains ';').");
         return false;
      }

      // Identify the first command word
      const command = normalizedQuery.split(/[\s;()]+/)[0];
      if (!command) {
         console.error("[PermissionService] Query rejected: Could not identify command.");
         return false; // Should not happen if normalizedQuery is not empty
      }

      // 1. Check if the command is *always* disallowed
      if (ALWAYS_DISALLOWED_COMMANDS.includes(command)) {
        console.error(`[PermissionService] Query rejected: Command '${command}' is always disallowed.`);
        return false;
      }

      // 2. Check DQL (always allowed)
      if (DQL_COMMANDS.includes(command)) {
        // Don't log success here, too noisy. Log only rejections.
        // console.log(`[PermissionService] Query allowed: DQL command '${command}'.`);
        return true; // Multiple statements already checked
      }

      // 3. Check DML (allowed only if allowDml is true)
      if (DML_COMMANDS.includes(command)) {
        if (allowDml) {
          // console.log(`[PermissionService] Query allowed: DML command '${command}' (DML enabled).`);
          return true; // Multiple statements already checked
        } else {
          console.error(`[PermissionService] Query rejected: DML command '${command}' requires allowDml=true.`);
          return false;
        }
      }

      // 4. Check DDL (allowed only if allowDdl is true)
      if (DDL_COMMANDS.includes(command)) {
        if (allowDdl) {
          // console.log(`[PermissionService] Query allowed: DDL command '${command}' (DDL enabled).`);
          return true; // Multiple statements already checked
        } else {
          console.error(`[PermissionService] Query rejected: DDL command '${command}' requires allowDdl=true.`);
          return false;
        }
      }

      // 5. If the command is not in any recognized list, deny by default for safety.
      console.warn(`[PermissionService] Query rejected: Command '${command}' is not recognized or explicitly allowed.`);
      return false;
    }
    ```

**Step 1.2: Delete `src/validators.ts`**
*   **Action:** Delete the file `src/validators.ts`. Its contents have been moved or are no longer needed (like the `validateQuery` wrapper).

---

## Phase 2: Update Caller (`connection.ts`)

**Objective:** Modify `executeQuery` in `src/connection.ts` to use the new `permissionService`.

**Step 2.1: Modify `src/connection.ts` Imports**
*   **Action:** Edit `src/connection.ts`.
*   **Instruction:** Remove the line: `import { isAllowedQuery } from "./validators.js";`
*   **Instruction:** Add the line: `import { checkPermissions } from "./permissionService.js";`

**Step 2.2: Modify `src/connection.ts` `executeQuery` Function**
*   **Action:** Edit the `executeQuery` function within `src/connection.ts`.
*   **Instruction:** Find the permission check line:
    ```typescript
    if (!isAllowedQuery(sql, allowDml, allowDdl)) {
        throw new Error("Query not allowed");
    }
    ```
*   **Instruction:** Replace it with the call to the new service:
    ```typescript
    // Validate permissions using the dedicated service
    if (!checkPermissions(sql, allowDml, allowDdl)) {
      // checkPermissions logs the specific reason internally
      throw new Error("Query not permitted based on DML/DDL/Command restrictions.");
    }
    ```
*   **Instruction:** Remove the `validateQuery` function from `src/index.ts` imports and the call within the `execute_query` case, as the check is now done within `executeQuery`.
    *   **File:** `src/index.ts`
    *   **Remove Import:** `import { validateQuery } from "./validators.js";`
    *   **Remove Call:** In the `case "execute_query":` block, delete the lines:
        ```typescript
        // Validate the query using the configured permissions from the 'config' variable
        if (!config) {
             // This should ideally not happen if the above try/catch works
             throw new McpError(ErrorCode.InternalError, "Server configuration not loaded.");
        }
        console.error(`[Tool] Validating query. DML Allowed: ${config.allow_dml}, DDL Allowed: ${config.allow_ddl}`);
        validateQuery(query, config.allow_dml, config.allow_ddl); // Pass the flags
        ```

---

## Phase 3: Create Unit Tests for `permissionService.ts`

**Objective:** Create focused unit tests verifying all permission logic scenarios directly against `checkPermissions`.

**Step 3.1: Create `test/permissionService.test.ts`**
*   **Action:** Create a new file named `test/permissionService.test.ts`.
*   **Instruction:** Populate the file with comprehensive unit tests.

    ```typescript
    // test/permissionService.test.ts
    import { checkPermissions } from "../src/permissionService"; // Adjust path as necessary

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
    ```

---

## Phase 4: Refactor Integration Tests (`connection.test.ts`)

**Objective:** Streamline `test/connection.test.ts` to focus on verifying that `executeQuery` correctly integrates with `permissionService` and executes/rejects queries based on the outcome, rather than exhaustively re-testing every permission rule.

**Step 4.1: Modify `test/connection.test.ts`**
*   **Action:** Edit `test/connection.test.ts`.
*   **Instruction:** Add a comment at the top explaining the testing scope.
*   **Instruction:** Review the `describe` blocks for each permission scenario (`DML=false, DDL=false`, etc.).
    *   **KEEP** tests that verify *allowed* queries succeed (e.g., `SELECT` always works, `INSERT` works when `allowDml=true`, `CREATE` works when `allowDdl=true`). Include verification steps where appropriate (e.g., check data after insert/update/delete, check table existence after create/drop).
    *   **SIMPLIFY/REMOVE** redundant rejection tests. Instead of testing rejection for *every specific* DML/DDL command when its flag is false, keep only *one representative test* for DML rejection and one for DDL rejection within each scenario where they should be rejected. This proves `executeQuery` reacts correctly to the `false` return from `checkPermissions`.
    *   For example, in the `DML=false, DDL=false` block, keep `it("should REJECT DML (e.g., INSERT)", ...)` and `it("should REJECT DDL (e.g., CREATE)", ...)`, but remove the individual rejection tests for UPDATE, DELETE, ALTER, DROP.

*   **Example Simplification (for `DML=false, DDL=false` block):**

    ```typescript
    // test/connection.test.ts

    // Add comment near the top:
    // Note: This file tests the integration of executeQuery with the permission service.
    // It verifies that allowed queries run and disallowed queries are rejected based on flags.
    // Exhaustive testing of all command types against all permission flags
    // is done in permissionService.test.ts.

    describe("executeQuery Permissions", () => {
        // ... setup ...

        describe("When DML=false, DDL=false", () => {
            // ... setup ...

            it("should ALLOW DQL (SELECT)", async () => { /* ... */ });
            it("should ALLOW DQL (SHOW)", async () => { /* ... */ });
            // Keep other DQL tests if desired

            // Simplified Rejection Tests:
            it("should REJECT DML (e.g., INSERT)", async () => {
                const sql = `INSERT INTO test_users (name, email) VALUES ('test_reject', 'reject@example.com')`;
                await expect(executeQuery(sql, [], testDbName)).rejects.toThrow(/Query not permitted|not allowed/);
            });

            it("should REJECT DDL (e.g., CREATE)", async () => {
                const sql = `CREATE TABLE ${testTableName} (id INT)`;
                await expect(executeQuery(sql, [], testDbName)).rejects.toThrow(/Query not permitted|not allowed/);
            });

            // REMOVE individual rejection tests for UPDATE, DELETE, ALTER, DROP from this block.
        });

        describe("When DML=true, DDL=false", () => {
             // ... setup ...

             it("should ALLOW DQL (SELECT)", async () => { /* ... */ });
             it("should ALLOW DML (INSERT)", async () => { /* ... includes verification ... */ });
             it("should ALLOW DML (UPDATE)", async () => { /* ... includes verification ... */ });
             it("should ALLOW DML (DELETE)", async () => { /* ... includes verification ... */ });

             // Simplified Rejection Test:
             it("should REJECT DDL (e.g., CREATE)", async () => {
                 const sql = `CREATE TABLE ${testTableName} (id INT)`;
                 await expect(executeQuery(sql, [], testDbName)).rejects.toThrow(/Query not permitted|not allowed/);
             });

             // REMOVE individual rejection test for DROP etc. from this block.
        });

         describe("When DML=false, DDL=true", () => {
            // ... setup ...

             it("should ALLOW DQL (SELECT)", async () => { /* ... */ });

             // Simplified Rejection Test:
             it("should REJECT DML (e.g., INSERT)", async () => {
                 const sql = `INSERT INTO test_users (name, email) VALUES ('test_reject_ddl', 'reject_ddl@example.com')`;
                 await expect(executeQuery(sql, [], testDbName)).rejects.toThrow(/Query not permitted|not allowed/);
             });

             it("should ALLOW DDL (CREATE)", async () => { /* ... includes verification ... */ });
             it("should ALLOW DDL (ALTER)", async () => { /* ... includes verification ... */ });
             it("should ALLOW DDL (DROP)", async () => { /* ... includes verification ... */ });

             // REMOVE individual rejection tests for UPDATE, DELETE etc.
        });

         describe("When DML=true, DDL=true", () => {
             // ... setup ...
             // Keep tests verifying that SELECT, INSERT, CREATE, DROP etc. all SUCCEED.
             // No rejection tests needed here as everything (except always disallowed) should pass.
             it("should ALLOW DQL (SELECT)", async () => { /* ... */ });
             it("should ALLOW DML (INSERT)", async () => { /* ... */ });
             it("should ALLOW DDL (CREATE)", async () => { /* ... */ });
             it("should ALLOW DDL (DROP)", async () => { /* ... */ });
        });
    });
    ```

---

## Phase 5: Build and Verify

**Objective:** Compile the code and run all tests to ensure the refactoring was successful.

**Step 5.1: Build the Project**
*   **Action:** Execute the build command in the terminal.
*   **Command:** `npm run build`
*   **Verification:** Ensure the command completes without TypeScript errors. Check that `dist/validators.js` is gone and `dist/permissionService.js` exists.

**Step 5.2: Run Tests**
*   **Action:** Run the main test script.
*   **Command:** `npm test`
*   **Verification:** Ensure all tests in `dbService.test.ts`, `permissionService.test.ts`, and the refactored `connection.test.ts` pass. Pay attention to the specific pass/fail counts for each file if reported by Jest.

---

**Completion:** Upon successful completion of all phases, the permission validation logic will be cleanly isolated in `src/permissionService.ts`, with dedicated unit tests in `test/permissionService.test.ts`. The `src/connection.ts` module will be simpler, focusing on execution, and its tests (`test/connection.test.ts`) will verify the correct integration with the permission service.

