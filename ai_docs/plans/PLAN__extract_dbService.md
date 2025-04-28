# Plan: Extract Database Logic into `dbService.ts`

**Goal:** Improve testability and code structure by separating the core database interaction logic from the MCP server communication layer. This will allow for direct unit/integration testing of the database functions, bypassing potential issues in the MCP layer or SDK during testing.

**Steps:**

1.  **Create `src/dbService.ts` Module:**
    *   Create a new file: `src/dbService.ts`.
    *   Define and export functions within this module to encapsulate database operations. Initially, focus on the table analysis functionality.
    *   **Action:** Move the following functions from `src/tableAnalysis.ts` to `src/dbService.ts` and export them:
        *   `analyzeDatabaseTables` (potentially renamed, e.g., `analyzeTables`)
        *   `fetchBasicColumnDetails`
        *   `fetchFullColumnDetails`
        *   `fetchForeignKeyDetails`
        *   `fetchBasicIndexDetails`
        *   `fetchFullIndexDetails`
    *   **Dependency:** Ensure `src/dbService.ts` imports `executeQuery` and `getConfigFromEnv` from `src/connection.ts`.

2.  **Refactor `src/tableAnalysis.ts`:**
    *   **Action:** Remove the functions that were moved to `src/dbService.ts`.
    *   **Outcome:** This file might become empty or contain only type definitions/enums if they weren't moved. Consider removing the file if it becomes empty.

3.  **Refactor MCP Handler (`src/index.ts`):**
    *   **Action:** Modify the `CallToolRequestSchema` handler in `src/index.ts`.
    *   Import the necessary functions (e.g., `analyzeTables`) from the new `src/dbService.ts`.
    *   In the `case "analyze_table_schema":` block:
        *   Replace the direct call to the old `analyzeDatabaseTables` with a call to the imported service function (e.g., `await dbService.analyzeTables(...)`).
        *   Continue to handle MCP argument parsing (`request.params.arguments`) before calling the service and formatting the service's return value into the MCP response structure.
    *   **Goal:** The MCP handler should act as a thin translation layer.

4.  **Create Direct Database Service Tests:**
    *   **Action:** Create a new test file, e.g., `test/dbService.test.ts` (adjust path/name as needed).
    *   **Setup:** This test file will need access to a configured test database. It can either:
        *   Run the `test-setup.js` script programmatically before tests.
        *   Import and reuse setup logic from `test-setup.js`.
        *   Assume `npm run test:setup` has been run beforehand.
    *   **Testing:**
        *   Import the service functions directly from `src/dbService.ts`.
        *   Write test cases using a testing framework (like Jest, Mocha, or Node's built-in `assert`) to call the service functions (e.g., `await dbService.analyzeTables(...)`) with various inputs (different tables, detail levels).
        *   Assert that the returned data matches the expected schema information from the test database.
    *   **Benefit:** These tests run independently of the MCP server process and protocol.

5.  **Update `package.json`:**
    *   **Action:** Add a new script to run the `dbService.test.ts` tests. This might involve using `ts-node` or compiling the tests first.
    *   Example: `"test:db": "ts-node test/dbService.test.ts"` (requires `ts-node` dev dependency).

6.  **Address `test-tools.js`:**
    *   **Decision:** Decide the future role of `test-tools.js`.
    *   **Option A (Recommended):** Keep it as an *end-to-end* test. It verifies that the MCP server correctly receives requests, calls the `dbService`, and returns formatted responses. The original timeout issue might be resolved by this refactor, or it might persist, indicating a deeper issue (potentially SDK).
    *   **Option B:** Deprecate or remove `test-tools.js` if the direct `dbService` tests are deemed sufficient.

**Expected Outcome:**

*   Core database logic is isolated in `src/dbService.ts`.
*   Direct, reliable tests for database functionality exist in `test/dbService.test.ts`.
*   `src/index.ts` is simplified, focusing on MCP communication.
*   Clearer separation of concerns, improving maintainability.
*   The original timeout issue in `test-tools.js` is either resolved or more clearly isolated to the MCP communication layer/SDK.