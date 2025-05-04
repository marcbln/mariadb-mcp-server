**Goal:** Refactor the MariaDB MCP server to simplify permissions using `MARIADB_ALLOW_DML` and `MARIADB_ALLOW_DDL` environment variables, allowing `execute_query` to perform DML/DDL operations conditionally, while ensuring DQL is always permitted.

**Prerequisites:**
*   Access to the project's file system.
*   Ability to read, write, and replace content in files.
*   Ability to execute shell commands (like `npm run build`, `npm test`).

---

## Phase 1: Update Core Logic (Types, Config, Validation)

**Objective:** Modify the fundamental data structures and validation logic to support the new permission model.

**Step 1.1: Modify `MariaDBConfig` Type**
*   **File:** `src/types.ts`
*   **Action:** Replace the specific `allow_insert`, `allow_update`, `allow_delete` boolean properties with `allow_dml` and `allow_ddl`.
*   **Instruction:** Replace the existing `MariaDBConfig` interface definition with the following:
    ```typescript
    // MariaDB connection configuration
    export interface MariaDBConfig {
      host: string;
      port: number;
      user: string;
      password: string;
      database?: string;
      allow_dml: boolean; // Data Manipulation Language (INSERT, UPDATE, DELETE, REPLACE)
      allow_ddl: boolean; // Data Definition Language (CREATE, ALTER, DROP, TRUNCATE, RENAME)
    }
    ```

**Step 1.2: Update Configuration Loading**
*   **File:** `src/connection.ts`
*   **Action:** Modify the `getConfigFromEnv` function to read the new environment variables (`MARIADB_ALLOW_DML`, `MARIADB_ALLOW_DDL`) and populate the updated `MariaDBConfig` type. Remove parsing for the old variables.
*   **Instruction:** Replace the relevant lines inside the `getConfigFromEnv` function:
    *   **Remove** these lines:
        ```typescript
        const allow_insert = process.env.MARIADB_ALLOW_INSERT === "true";
        const allow_update = process.env.MARIADB_ALLOW_UPDATE === "true";
        const allow_delete = process.env.MARIADB_ALLOW_DELETE === "true";
        ```
    *   **Add** these lines in their place:
        ```typescript
        const allow_dml = process.env.MARIADB_ALLOW_DML === "true"; // Default false
        const allow_ddl = process.env.MARIADB_ALLOW_DDL === "true"; // Default false
        ```
    *   **Update** the logging within the function to show the new flags:
        *   Replace `allow_insert`, `allow_update`, `allow_delete` in the `console.error` call and the returned object with `allow_dml` and `allow_ddl`. The updated log object should look like:
          ```typescript
          console.error("[Setup] MariaDB configuration:", {
            host: host,
            port: port,
            user: user,
            database: database || "(default not set)",
            allow_dml: allow_dml, // New
            allow_ddl: allow_ddl, // New
          });
          ```
        *   The updated return statement should look like:
          ```typescript
          return {
            host,
            port,
            user,
            password,
            database,
            allow_dml, // New
            allow_ddl, // New
          };
          ```

**Step 1.3: Refactor Query Validation Logic**
*   **File:** `src/validators.ts`
*   **Action:** Overhaul the validation logic in `isAlloowedQuery` (correcting typo to `isAllowedQuery`) and `validateQuery` to implement the new permission rules.
*   **Instruction 1.3.1:** Rename `isAlloowedQuery` to `isAllowedQuery`.
*   **Instruction 1.3.2:** Replace the entire content of `src/validators.ts` with the following code, which defines command categories and implements the new validation rules:
    ```typescript
    /**
     * SQL query validators for MariaDB MCP server
     * Ensures that only allowed queries are executed based on configuration.
     */
    import { MariaDBConfig } from "./types.js"; // Import config type if needed (though flags are passed directly)

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
      return query
        .replace(/--.*$/gm, "") // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, "") // Remove multi-line comments
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim()
        .toUpperCase();
    }

    /**
     * Validates if a SQL query is allowed based on the configured permissions.
     * @param query SQL query to validate.
     * @param allowDml Whether DML operations are permitted.
     * @param allowDdl Whether DDL operations are permitted.
     * @returns true if the query is allowed, false otherwise.
     */
    // Corrected name: isAllowedQuery
    export function isAllowedQuery(query: string, allowDml: boolean, allowDdl: boolean): boolean {
      const normalizedQuery = normalizeQuery(query);

      if (!normalizedQuery) {
        console.error("[Validator] Query rejected: Empty query.");
        return false;
      }

      // Basic check for multiple statements (imperfect but catches simple cases)
      // We disallow semicolons unless it's the very last character.
      if (normalizedQuery.includes(";") && !normalizedQuery.endsWith(";")) {
         console.error("[Validator] Query rejected: Multiple statements detected (contains ';').");
         return false;
      }

      // Identify the first command word
      const command = normalizedQuery.split(/[\s;()]+/)[0];
      if (!command) {
         console.error("[Validator] Query rejected: Could not identify command.");
         return false; // Should not happen if normalizedQuery is not empty
      }

      // 1. Check if the command is *always* disallowed
      if (ALWAYS_DISALLOWED_COMMANDS.includes(command)) {
        console.error(`[Validator] Query rejected: Command '${command}' is always disallowed.`);
        return false;
      }

      // 2. Check DQL (always allowed)
      if (DQL_COMMANDS.includes(command)) {
        console.log(`[Validator] Query allowed: DQL command '${command}'.`);
        return true; // Multiple statements already checked
      }

      // 3. Check DML (allowed only if allowDml is true)
      if (DML_COMMANDS.includes(command)) {
        if (allowDml) {
          console.log(`[Validator] Query allowed: DML command '${command}' (DML enabled).`);
          return true; // Multiple statements already checked
        } else {
          console.error(`[Validator] Query rejected: DML command '${command}' requires MARIADB_ALLOW_DML=true.`);
          return false;
        }
      }

      // 4. Check DDL (allowed only if allowDdl is true)
      if (DDL_COMMANDS.includes(command)) {
        if (allowDdl) {
          console.log(`[Validator] Query allowed: DDL command '${command}' (DDL enabled).`);
          return true; // Multiple statements already checked
        } else {
          console.error(`[Validator] Query rejected: DDL command '${command}' requires MARIADB_ALLOW_DDL=true.`);
          return false;
        }
      }

      // 5. If the command is not in any recognized list, deny by default for safety.
      console.warn(`[Validator] Query rejected: Command '${command}' is not recognized or explicitly allowed.`);
      return false;
    }

    /**
     * Validates if a SQL query is safe and permitted to execute.
     * @param query SQL query to validate.
     * @param allowDml Whether DML operations are permitted.
     * @param allowDdl Whether DDL operations are permitted.
     * @throws Error if the query is not valid or not permitted.
     */
    export function validateQuery(query: string, allowDml: boolean, allowDdl: boolean): void {
      console.error(`[Validator] Validating query (DML:${allowDml}, DDL:${allowDdl}): ${query.substring(0, 100)}...`);

      if (!query || typeof query !== "string") {
        throw new Error("Query must be a non-empty string");
      }

      // Pass permissions flags to the check function
      if (!isAllowedQuery(query, allowDml, allowDdl)) {
        // The specific reason is logged within isAllowedQuery
        throw new Error(
          "Query is not permitted. Check server logs for details (check command type, DML/DDL permissions, multiple statements, or disallowed commands)."
        );
      }

      console.error("[Validator] Query validated successfully.");
    }
    ```

---

## Phase 2: Integrate Validation into MCP Handler

**Objective:** Update the `execute_query` tool handler to use the new validation logic and permissions.

**Step 2.1: Modify `execute_query` Tool Definition**
*   **File:** `src/index.ts`
*   **Action:** Update the description of the `query` parameter within the `execute_query` tool definition in the `ListToolsRequestSchema` handler.
*   **Instruction:** Find the `execute_query` tool definition and modify the `description` field for the `query` property to:
    ```typescript
    description: `SQL query to execute. SELECT, SHOW, DESCRIBE, EXPLAIN are always allowed. DML (INSERT, UPDATE, DELETE, REPLACE) requires MARIADB_ALLOW_DML=true. DDL (CREATE, ALTER, DROP, TRUNCATE) requires MARIADB_ALLOW_DDL=true. Other commands (GRANT, SET, etc.) and multiple statements are disallowed.`,
    ```

**Step 2.2: Modify `execute_query` Tool Handler**
*   **File:** `src/index.ts`
*   **Action:** In the `CallToolRequestSchema` handler, within the `case "execute_query":` block, retrieve the permissions from the configuration and pass them to `validateQuery`.
*   **Instruction:**
    *   Ensure `validateQuery` is imported from `./validators.js`.
    *   Ensure `getConfigFromEnv` is imported from `./connection.js`.
    *   Inside the `server.setRequestHandler(CallToolRequestSchema, async (request) => { ... })` block, ensure the `config` variable is populated *before* the `switch` statement (as done in the previous patch):
        ```typescript
        let config;
        try {
          config = getConfigFromEnv(); // Get config early to check permissions
          createConnectionPool(config); // Pass config to potentially initialize pool
        } catch (error) {
          console.error("[Fatal] Failed to initialize MariaDB connection:", error);
          // Consider throwing an McpError here instead of exiting if initialization fails
          throw new McpError(ErrorCode.InternalError, `Failed to initialize database connection: ${error.message}`);
        }
        ```
    *   Inside the `case "execute_query":` block, **before** the `await executeQuery(...)` call, add the validation call:
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

## Phase 3: Update Configuration Examples and Documentation

**Objective:** Align all user-facing examples and documentation with the new permission flags.

**Step 3.1: Update `.env.example`**
*   **File:** `.env.example`
*   **Action:** Replace the old `ALLOW_*` variables with the new `MARIADB_ALLOW_DML` and `MARIADB_ALLOW_DDL` variables, defaulting to `false`.
*   **Instruction:** Replace the content of `.env.example` with:
    ```dotenv
    MARIADB_HOST=localhost
    MARIADB_PORT=3306
    MARIADB_USER=your-user
    MARIADB_PASSWORD=your-password
    MARIADB_DATABASE=your-default-database
    MARIADB_ALLOW_DML=false # Allow INSERT, UPDATE, DELETE, REPLACE via execute_query
    MARIADB_ALLOW_DDL=false # Allow CREATE, ALTER, DROP, TRUNCATE via execute_query
    # MARIADB_TIMEOUT_MS=10000 (Example, keep if needed)
    # MARIADB_ROW_LIMIT=1000 (Example, keep if needed)
    ```

**Step 3.2: Update `mcp-settings-example.json`**
*   **File:** `mcp-settings-example.json`
*   **Action:** Update the `env` section to use the new flags.
*   **Instruction:** Replace the `env` block within the example:
    ```json
          "env": {
            "MARIADB_HOST": "localhost",
            "MARIADB_PORT": "3306",
            "MARIADB_USER": "your-user",
            "MARIADB_PASSWORD": "your-password",
            "MARIADB_DATABASE": "your-default-database",
            "MARIADB_ALLOW_DML": "false",
            "MARIADB_ALLOW_DDL": "false"
            // Add TIMEOUT_MS and ROW_LIMIT if desired
          },
    ```

**Step 3.3: Update `.roo/mcp.json` (if applicable)**
*   **File:** `.roo/mcp.json`
*   **Action:** Update the `env` section similarly.
*   **Instruction:** Replace the `env` block within the `mariadb` server definition:
    ```json
          "env": {
            "MARIADB_HOST": "localhost",
            "MARIADB_PORT": "10136", // Or your specific port
            "MARIADB_USER": "root",
            "MARIADB_PASSWORD": "11111", // Or your specific password
            "MARIADB_DATABASE": "t2", // Or your specific database
            "MARIADB_ALLOW_DML": "false", // Set to "true" to enable DML
            "MARIADB_ALLOW_DDL": "false", // Set to "true" to enable DDL
            "MARIADB_TIMEOUT_MS": "10000",
            "MARIADB_ROW_LIMIT": "1000"
          }
    ```

**Step 3.4: Update `README.md`**
*   **File:** `README.md`
*   **Action:** Update the environment variable list, MCP settings examples, and the `execute_query` tool description.
*   **Instruction:**
    *   In the "Configure environment variables" section, replace the list of `ALLOW_*` variables with:
        ```markdown
        - MARIADB_ALLOW_DML: `false` (Set to `true` to allow INSERT, UPDATE, DELETE, REPLACE queries via `execute_query`)
        - MARIADB_ALLOW_DDL: `false` (Set to `true` to allow CREATE, ALTER, DROP, TRUNCATE queries via `execute_query`)
        ```
    *   Update the `env` blocks in both MCP settings examples (NPM install and Build from Source) to match the structure shown in Step 3.2.
    *   In the "Available Tools" section, under `### execute_query`, replace the "Permissions" bullet point with:
        ```markdown
        - **Permissions**: DML (INSERT, UPDATE, DELETE, REPLACE) requires `MARIADB_ALLOW_DML=true`. DDL (CREATE, ALTER, DROP, TRUNCATE) requires `MARIADB_ALLOW_DDL=true`. SELECT, SHOW, DESCRIBE, EXPLAIN are always allowed. Other commands (GRANT, SET, etc.) and multiple statements are disallowed.
        ```
    *   Review the "Testing" section's environment variable examples and update them to use `MARIADB_ALLOW_DML=false` and `MARIADB_ALLOW_DDL=false` as the default examples.

---

## Phase 4: Update Testing

**Objective:** Ensure tests are updated to reflect the new configuration structure and add specific tests for DML/DDL permissions.

**Step 4.1: Update `test-setup.js`**
*   **File:** `test-setup.js`
*   **Action:** Modify the script to read and log the new environment variables.
*   **Instruction:**
    *   Replace the lines reading `MARIADB_ALLOW_INSERT/UPDATE/DELETE` with:
        ```javascript
        allowDml:    process.env.MARIADB_ALLOW_DML === 'true',
        allowDdl:    process.env.MARIADB_ALLOW_DDL === 'true',
        ```
    *   Update the initial `console.log` statements to show `Allow DML:` and `Allow DDL:`.
    *   Update the final `console.log(JSON.stringify(...))` block showing MCP settings to use `MARIADB_ALLOW_DML` and `MARIADB_ALLOW_DDL` in the `env` object.

**Step 4.2: Update `test/dbService.test.ts`**
*   **File:** `test/dbService.test.ts`
*   **Action:** Update the hardcoded test configuration to use the new permission flags.
*   **Instruction:** Modify the `testConfig` object:
    *   Remove `allow_insert`, `allow_update`, `allow_delete`.
    *   Add:
        ```typescript
        allow_dml: false, // Or true if dbService tests require DML implicitly? Unlikely.
        allow_ddl: false, // DDL not tested directly by dbService analyzeTables.
        ```

**Step 4.3: Enhance `test-tools.js`**
*   **File:** `test-tools.js`
*   **Action:** Modify the script to read the new flags, pass them to the spawned server, and add new test functions (`testDml`, `testDdl`) that conditionally execute DML/DDL queries based on the flags.
*   **Instruction:** Replace the entire content of `test-tools.js` with the code provided in the previous response (Patch for `test-tools.js`), which includes:
    *   Reading `MARIADB_ALLOW_DML` / `MARIADB_ALLOW_DDL`.
    *   Passing these flags to the `spawn` environment.
    *   Keeping the `testAnalyzeSchema` function.
    *   Adding `testDml` function to test INSERT/DELETE conditionally.
    *   Adding `testDdl` function to test CREATE/DROP TABLE conditionally.
    *   Calling these new test functions from `main`.
    *   Increased timeout for `callTool`.

---

## Phase 5: Build and Verify

**Objective:** Compile the modified code and run tests to ensure everything works as expected.

**Step 5.1: Build the Project**
*   **Action:** Execute the build command in the terminal.
*   **Command:** `npm run build`
*   **Verification:** Ensure the command completes without TypeScript errors.

**Step 5.2: Run Setup Script**
*   **Action:** Run the test setup script. Ensure relevant MARIADB environment variables (HOST, PORT, USER, PASSWORD) are set.
*   **Command:** `npm run test:setup`
*   **Verification:** Ensure the script completes successfully, creating the test database and tables.

**Step 5.3: Run Tool Tests**
*   **Action:** Run the tool test script. Set `MARIADB_ALLOW_DML` and `MARIADB_ALLOW_DDL` environment variables as needed to test both allowed and disallowed scenarios.
*   **Command Example (DML/DDL Disabled):** `export MARIADB_ALLOW_DML=false MARIADB_ALLOW_DDL=false && node test-tools.js`
*   **Command Example (DML Enabled, DDL Disabled):** `export MARIADB_ALLOW_DML=true MARIADB_ALLOW_DDL=false && node test-tools.js`
*   **Command Example (Both Enabled):** `export MARIADB_ALLOW_DML=true MARIADB_ALLOW_DDL=true && node test-tools.js`
*   **Verification:** Observe the output. Ensure:
    *   DQL tests (`SELECT`) pass regardless of flags.
    *   DML tests (`INSERT`, `DELETE`) pass *only* when `MARIADB_ALLOW_DML=true` and fail otherwise.
    *   DDL tests (`CREATE TABLE`, `DROP TABLE`) pass *only* when `MARIADB_ALLOW_DDL=true` and fail otherwise.
    *   Schema analysis tests still pass.

**Step 5.4: Run DB Service Tests (Optional but Recommended)**
*   **Action:** Run the Jest tests for the dbService.
*   **Command:** `npm run test:db` or `npx jest test/dbService.test.ts`
*   **Verification:** Ensure all tests pass.

---

**Completion:** Upon successful completion of all phases and verification steps, the MariaDB MCP server will be updated with the simplified permission model, allowing conditional DML/DDL execution via the `execute_query` tool, controlled by the `MARIADB_ALLOW_DML` and `MARIADB_ALLOW_DDL` environment variables. All documentation and examples will be aligned with this new model.
