Okay, here is a multi-phase plan designed for an AI agent to execute, focusing on implementing the improvements needed to answer the "describe the database content and relations" query.

This plan leverages the existing codebase structure and builds upon the recent changes (like the enhanced `describe_table`).

**Goal:** Enhance the `mariadb-mcp-server` to provide detailed schema, content structure, and relationship information via MCP tools.

**Prerequisites:** AI agent has access to the file system, can read/write files, and execute shell commands (like `npm run build`, `node`).

---

**Phase 1: Implement New Tools for Relationship and Index Discovery**

**Objective:** Add the `list_foreign_keys` and `list_indexes` tools.

**Step 1.1: Define `list_foreign_keys` Tool Metadata**

*   **Action:** Modify the file `src/index.ts`.
*   **Location:** Inside the `server.setRequestHandler(ListToolsRequestSchema, ...)` handler function's returned array (`tools: [...]`).
*   **Instruction:** Add the following tool definition object to the array:
    ```typescript
    {
      name: "list_foreign_keys",
      description: "Lists all foreign key constraints defined on a specific table, showing which other tables/columns they reference.",
      inputSchema: {
        type: "object",
        properties: {
          database: {
            type: "string",
            description: "Database name (optional, uses default if not specified)",
          },
          table: {
            type: "string",
            description: "The table to list foreign keys for",
          },
        },
        required: ["table"],
      },
    },
    ```

**Step 1.2: Implement `list_foreign_keys` Tool Logic**

*   **Action:** Modify the file `src/index.ts`.
*   **Location:** Inside the `server.setRequestHandler(CallToolRequestSchema, ...)` handler function's `switch (request.params.name)` block.
*   **Instruction:** Add the following `case` block:
    ```typescript
    case "list_foreign_keys": {
      console.error("[Tool] Executing list_foreign_keys");

      const database = request.params.arguments?.database as string | undefined;
      const table = request.params.arguments?.table as string;

      if (!table) {
        throw new McpError(ErrorCode.InvalidParams, "Table name is required");
      }
      // Basic validation for table name (adjust regex if needed)
      if (!/^[a-zA-Z0-9_]+$/.test(table)) {
         throw new McpError(ErrorCode.InvalidParams, "Invalid table name format.");
      }

      const dbName = database || (await getConfigFromEnv()).database;
      if (!dbName) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Database name is required (either in arguments or environment config)"
        );
      }
      // Basic validation for database name (adjust regex if needed)
       if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
         throw new McpError(ErrorCode.InvalidParams, "Invalid database name format.");
      }


      const sql = `
        SELECT
            CONSTRAINT_NAME,
            COLUMN_NAME,
            REFERENCED_TABLE_SCHEMA,
            REFERENCED_TABLE_NAME,
            REFERENCED_COLUMN_NAME
        FROM
            information_schema.KEY_COLUMN_USAGE
        WHERE
            TABLE_SCHEMA = :dbName
            AND TABLE_NAME = :tableName
            AND REFERENCED_TABLE_NAME IS NOT NULL;
      `;

      // Use undefined for the third argument as database context is in the WHERE clause
      const { rows } = await executeQuery(sql, { dbName, tableName: table }, undefined);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(rows, null, 2),
          },
        ],
      };
    }
    ```

**Step 1.3: Define `list_indexes` Tool Metadata**

*   **Action:** Modify the file `src/index.ts`.
*   **Location:** Inside the `server.setRequestHandler(ListToolsRequestSchema, ...)` handler function's returned array (`tools: [...]`).
*   **Instruction:** Add the following tool definition object to the array:
    ```typescript
    {
      name: "list_indexes",
      description: "Lists all indexes (including primary and unique keys) defined on a specific table.",
      inputSchema: {
        type: "object",
        properties: {
          database: {
            type: "string",
            description: "Database name (optional, uses default if not specified)",
          },
          table: {
            type: "string",
            description: "The table to list indexes for",
          },
        },
        required: ["table"],
      },
    },
    ```

**Step 1.4: Implement `list_indexes` Tool Logic**

*   **Action:** Modify the file `src/index.ts`.
*   **Location:** Inside the `server.setRequestHandler(CallToolRequestSchema, ...)` handler function's `switch (request.params.name)` block.
*   **Instruction:** Add the following `case` block:
    ```typescript
    case "list_indexes": {
      console.error("[Tool] Executing list_indexes");

      const database = request.params.arguments?.database as string | undefined;
      const table = request.params.arguments?.table as string;

      if (!table) {
        throw new McpError(ErrorCode.InvalidParams, "Table name is required");
      }
      // Basic validation for table name (adjust regex if needed for safety)
       if (!/^[a-zA-Z0-9_]+$/.test(table)) {
         throw new McpError(ErrorCode.InvalidParams, "Invalid table name format.");
      }

      const dbName = database || (await getConfigFromEnv()).database;
      // Although SHOW INDEX FROM `db`.`table` might work, using the connection's
      // database context is generally safer and more common.
      if (!dbName) {
         throw new McpError(
          ErrorCode.InvalidParams,
          "Database name is required for context (either in arguments or environment config)"
        );
      }
       // Basic validation for database name (adjust regex if needed)
       if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
         throw new McpError(ErrorCode.InvalidParams, "Invalid database name format.");
      }

      // IMPORTANT: SHOW INDEX doesn't typically support placeholders.
      // We rely on prior validation of the table name.
      const sql = `SHOW INDEX FROM \`${table}\``;

      // Pass dbName as the third argument to set the database context for the connection
      const { rows } = await executeQuery(sql, [], dbName);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(rows, null, 2),
          },
        ],
      };
    }
    ```

**Step 1.5: Build the Project**

*   **Action:** Execute a shell command in the project's root directory.
*   **Command:** `npm run build`
*   **Verification:** Ensure the command completes without errors and the `dist/` directory is updated.

---

**Phase 2: Update Testing and Documentation**

**Objective:** Ensure the new tools are tested and documented correctly.

**Step 2.1: Update Test Setup (`test-setup.js`) for Relations and Indexes**

*   **Action:** Modify the file `test-setup.js`.
*   **Location:** Inside the `createTestTable` async function.
*   **Instruction:** Modify the function to create a second table with a foreign key and add an index to the `users` table. Replace the existing `createTestTable` function with this:
    ```javascript
    async function createTestTable() {
      await pool.query(`USE ${TEST_DB}`);
      // Drop tables if they exist (in order to handle FK constraints)
      await pool.query(`DROP TABLE IF EXISTS orders`);
      await pool.query(`DROP TABLE IF EXISTS ${TEST_TABLE}`);

      // Create users table with an index
      await pool.query(`
        CREATE TABLE ${TEST_TABLE} (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL COMMENT 'User full name',
          email VARCHAR(100) NOT NULL COMMENT 'User email address',
          age INT COMMENT 'User age',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY \`idx_email\` (email) COMMENT 'Ensure email is unique'
        ) COMMENT='Stores user information';
      `);
      console.log(`   - Table '${TEST_TABLE}' created with index.`);

      // Create orders table with a foreign key
      await pool.query(`
         CREATE TABLE orders (
           order_id INT AUTO_INCREMENT PRIMARY KEY,
           user_id INT,
           product_name VARCHAR(100),
           order_date DATE,
           CONSTRAINT fk_user_order FOREIGN KEY (user_id) REFERENCES ${TEST_TABLE}(id) ON DELETE SET NULL
         ) COMMENT='Stores user orders';
      `);
       console.log(`   - Table 'orders' created with foreign key.`);
    }
    ```
*   **Note:** Also update the `insertSampleData` function in `test-setup.js` to insert some data into the `orders` table, linking it to the users, if desired for more comprehensive testing later.

**Step 2.2: Update Tool Tests (`test-tools.js`)**

*   **Action:** Modify the file `test-tools.js`.
*   **Location:** Inside the `main` async function, after the existing tool tests.
*   **Instruction:** Add calls to test the new tools:
    ```javascript
    // Inside main() after the existing execute_query test...

    // Test list_foreign_keys (on orders table, which has the FK)
    console.log('\n5. Testing list_foreign_keys tool...');
    const fkResult = await callTool(server, 'list_foreign_keys', {
      database: config.database,
      table: 'orders' // Test on the table with the FK constraint
    });
    console.log('Result:', JSON.stringify(fkResult, null, 2));


    // Test list_indexes (on users table, which has PK and unique index)
    console.log('\n6. Testing list_indexes tool...');
    const indexResult = await callTool(server, 'list_indexes', {
      database: config.database,
      table: 'users' // Test on the table with indexes
    });
    console.log('Result:', JSON.stringify(indexResult, null, 2));

    console.log('\nAll tests completed successfully!'); // Move this line down
    ```

**Step 2.3: Update Documentation (`README.md`)**

*   **Action:** Modify the file `README.md`.
*   **Location:** In the "Available Tools" section.
*   **Instruction:** Add documentation for the new tools:
    ```markdown
    ### list_foreign_keys
    Lists all foreign key constraints defined *on* a specific table, showing which other tables/columns they reference.

    **Parameters**:
    - `database` (optional): Database name (uses default if not specified)
    - `table` (required): The table to list foreign keys for

    **Example**:
    ```json
    {
      "server_name": "mariadb",
      "tool_name": "list_foreign_keys",
      "arguments": {
        "database": "my_database",
        "table": "orders"
      }
    }
    ```

    ### list_indexes
    Lists all indexes (including primary and unique keys) defined on a specific table.

    **Parameters**:
    - `database` (optional): Database name (uses default if not specified)
    - `table` (required): The table to list indexes for

    **Example**:
    ```json
    {
      "server_name": "mariadb",
      "tool_name": "list_indexes",
      "arguments": {
        "database": "my_database",
        "table": "users"
      }
    }
    ```

**Step 2.4: Run Tests**

*   **Action:** Execute shell commands in the project's root directory.
*   **Commands:**
    1.  `npm run test:setup` (Make sure environment variables like `MARIADB_USER`, `MARIADB_PASSWORD` are set)
    2.  `npm run test:tools` (Make sure environment variables are set, including `MARIADB_DATABASE=teste_db`)
*   **Verification:** Ensure both setup and tool tests complete successfully, showing results for the new tools.

---

**Phase 3: Improve Connection Management (Recommended Stability Fix)**

**Objective:** Implement proper connection handling from the pool for better reliability.

**Step 3.1: Modify `executeQuery` for Correct Pooling**

*   **Action:** Modify the file `src/connection.ts`.
*   **Location:** Refactor the `executeQuery` function.
*   **Instruction:** Replace the entire `executeQuery` function with the following version, which gets a connection per query and releases it:
    ```typescript
    export async function executeQuery(
      sql: string,
      params: any[] | { [key: string]: any } = [],
      database?: string
    ): Promise<{ rows: any; fields: mariadb.FieldInfo[] }> {
      console.error(`[Query] Executing: ${sql} with params ${JSON.stringify(params)} ${database ? `on db ${database}`: ''}`);

      // Create connection pool if not already created
      if (!pool) {
        console.error("[Setup] Connection pool not found, creating a new one");
        pool = createConnectionPool();
      }

      let connection: mariadb.PoolConnection | null = null; // Connection variable is now local

      try {
        // Get a fresh connection from the pool for this query
        console.error("[Query] Getting connection from pool");
        connection = await pool.getConnection();
        console.error("[Query] Connection acquired");

        // Use specific database if provided for this connection
        if (database) {
          console.error(`[Query] Using database: ${database}`);
          await connection.query(`USE \`${database}\``); // Ensure database name is escaped/validated if needed
        }

        // Validate query (optional based on config/trust)
        if (!isAlloowedQuery(sql)) { // Keep or remove validation based on requirements
          throw new Error(`Query not allowed: ${sql}`);
        }

        // Prepare query options
        const queryOptions: mariadb.QueryOptions = {
          metaAsArray: true, // Keep response structure consistent
          sql,
          timeout: DEFAULT_TIMEOUT, // Use configured timeout
          namedPlaceholders: typeof params === 'object' && !Array.isArray(params), // Detect named placeholders
        };

        // Assign parameters correctly
        if (queryOptions.namedPlaceholders) {
           (queryOptions as any).values = params; // Pass object for named placeholders
        } else if (Array.isArray(params) && params.length > 0) {
           (queryOptions as any).values = params; // Pass array for positional placeholders (?)
        }


        // Execute query
        console.error(`[Query] Running query with options: ${JSON.stringify(queryOptions)}`);
        const [rows, fields] = await connection.query(queryOptions);
        console.error(`[Query] Query successful, received ${Array.isArray(rows) ? rows.length : 'non-array'} result`);


        // Process rows to convert Buffer objects to hex strings
        let processedRows;
        if (Array.isArray(rows)) {
          processedRows = rows.map(row => {
            const processedRow = {...row};
            for (const key in processedRow) {
              if (Buffer.isBuffer(processedRow[key])) {
                processedRow[key] = processedRow[key].toString('hex');
              }
            }
            return processedRow;
          });
        } else {
          processedRows = rows; // Handle non-array results (e.g., OK packets)
        }

        // Apply row limit if result is an array
        const rowLimit = parseInt(process.env.MARIADB_ROW_LIMIT || `${DEFAULT_ROW_LIMIT}`, 10);
        const limitedRows =
          Array.isArray(processedRows) && processedRows.length > rowLimit
            ? processedRows.slice(0, rowLimit)
            : processedRows;

        // Log result summary
        const returnedRowCount = Array.isArray(limitedRows) ? limitedRows.length : (limitedRows ? 1 : 0);
        console.error(`[Query] Success: ${returnedRowCount} rows returned.`);
        if (Array.isArray(processedRows) && processedRows.length > rowLimit) {
             console.warn(`[Query] Result truncated to ${rowLimit} rows.`);
        }


        return { rows: limitedRows, fields };

      } catch (error) {
        // Log detailed error
        console.error("[Error] Query execution failed:", error instanceof Error ? error.message : error);
        // Consider logging stack trace in debug mode: console.error(error);
        throw error; // Re-throw the error to be handled by the caller
      } finally {
        // **Crucially**, release the connection back to the pool
        if (connection) {
          try {
             await connection.release();
             console.error("[Query] Connection released back to pool");
          } catch (releaseError) {
             console.error("[Error] Failed to release connection:", releaseError);
          }
        }
      }
    }
    ```

**Step 3.2: Remove Global Connection Variable**

*   **Action:** Modify the file `src/connection.ts`.
*   **Instruction:** Delete the line `let connection: mariadb.PoolConnection | null = null;` near the top of the file (below the `pool` variable).

**Step 3.3: Build and Test Again**

*   **Action:** Execute shell commands.
*   **Commands:**
    1.  `npm run build`
    2.  `npm run test:tools` (or `npm test`)
*   **Verification:** Ensure all tests still pass. Observe console logs for "[Query] Getting connection from pool" and "[Query] Connection released back to pool" messages for each tool call.

---

**Completion:**

After successfully completing these phases, the `mariadb-mcp-server` will have the necessary tools (`list_tables`, `describe_table`, `list_foreign_keys`, `list_indexes`) for an AI agent to gather comprehensive information about database content structure and relations. The connection management will also be more robust.