# Plan: Implement `analyze_table_schema` Tool

This plan outlines the steps to replace the `describe_table`, `list_foreign_keys`, and `list_indexes` tools with a single, more comprehensive `analyze_table_schema` tool in the MariaDB MCP server.

**Goal:** Provide a unified tool to analyze table schemas with varying levels of detail, improving the server's API and maintainability.

**Key Features:**
*   New tool: `analyze_table_schema`
*   Input Parameters:
    *   `table_names` (array of strings, required): List of tables to analyze.
    *   `detail_level` (enum: 'BASIC' | 'STANDARD' | 'FULL', optional, default: 'STANDARD'): Controls the level of detail returned.
    *   `database` (string, optional): Database context; uses default if not specified.
*   Output: JSON object where keys are table names and values are the analysis results for that table.
*   Internal flags for modularity.
*   Removes the old `describe_table`, `list_foreign_keys`, `list_indexes` tools.

**Implementation Phases:**

**Phase 1: Implementation**

1.  **Create `src/tableAnalysis.ts`:**
    *   Define the `SchemaDetailFlag` enum: `COLUMNS_BASIC`, `COLUMNS_FULL`, `FOREIGN_KEYS`, `INDEXES_BASIC`, `INDEXES_FULL`.
    *   Define the mapping from the user `detail_level` string to an array/set of `SchemaDetailFlag`s:
        *   `'BASIC'`: `[SchemaDetailFlag.COLUMNS_BASIC]`
        *   `'STANDARD'`: `[SchemaDetailFlag.COLUMNS_BASIC, SchemaDetailFlag.FOREIGN_KEYS, SchemaDetailFlag.INDEXES_BASIC]`
        *   `'FULL'`: `[SchemaDetailFlag.COLUMNS_FULL, SchemaDetailFlag.FOREIGN_KEYS, SchemaDetailFlag.INDEXES_FULL]`
    *   Implement the main analysis function: `export async function analyzeDatabaseTables(tableNames: string[], detailLevel: string, database?: string): Promise<Record<string, any>>`.
        *   This function will contain the core logic: determining flags, looping through tables, conditionally fetching data based on flags using SQL queries (`INFORMATION_SCHEMA`, `SHOW INDEX`), and aggregating results into a per-table structure.
        *   Import and use `executeQuery` from `./connection.js`.
        *   Handle errors (e.g., table not found).
        *   Return the aggregated result object (e.g., `{ "tableName1": { details... }, "tableName2": { details... } }`).
2.  **Update `src/index.ts`:**
    *   **Define New Tool Schema:** Add the `analyze_table_schema` tool definition to the `ListToolsRequestSchema` handler (input schema: `table_names`, `detail_level`, `database`).
    *   **Implement Tool Logic:**
        *   Add a `case 'analyze_table_schema':` block in the `CallToolRequestSchema` handler.
        *   Import `analyzeDatabaseTables` from `./tableAnalysis.js`.
        *   Retrieve arguments, validate `table_names`.
        *   Call `await analyzeDatabaseTables(...)`.
        *   Format the result into the standard MCP tool response structure (`content: [{ type: 'text', text: JSON.stringify(...) }]`).
        *   Include error handling.
    *   **Remove Old Tools:** Delete schema definitions and `case` blocks for `describe_table`, `list_foreign_keys`, `list_indexes`.

**Phase 2: Testing (in `test-tools.js`)**

1.  **Remove Old Tests:** Delete test calls for `describe_table`, `list_foreign_keys`, `list_indexes`.
2.  **Add New Tests:**
    *   Create test cases for `analyze_table_schema`.
    *   Test with single/multiple tables for each `detail_level`.
    *   Test the default `detail_level`.
    *   Test error handling (missing `table_names`, non-existent table).
    *   Adjust assertions for the new JSON output structure.

**Phase 3: Documentation (in `README.md`)**

1.  **Update "Available Tools" Section:**
    *   Remove sections for `describe_table`, `list_foreign_keys`, `list_indexes`.
    *   Add a detailed section for `analyze_table_schema`, documenting purpose, parameters, detail levels, example usage, and output structures for each level.
2.  **Review General Description/Testing Section:** Update if necessary.

**Phase 4: Project Summary (This File)**

1.  This document serves as the plan record.

---