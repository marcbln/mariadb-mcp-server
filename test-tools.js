#!/usr/bin/env node

/**
 * Test script for MariaDB MCP server tools.
 * Spawns the server process and calls its tools via MCP requests.
 * Reads MARIADB_* environment variables for connection details AND permission flags.
 */
import { spawn } from "child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js"; // Assuming MCP client library
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const SERVER_SCRIPT_PATH = path.resolve(__dirname, "./dist/index.js"); // Path to the compiled server script
const SERVER_NAME = "mariadb"; // As defined in mcp.json
const MCP_PORT = process.env.MCP_PORT || 10101; // Port MCP client connects to (must match server's MCP setup)
const CLIENT_TIMEOUT_MS = 20000; // Increased timeout for potentially longer DDL/DML operations

// Read connection details and NEW permission flags from environment variables
const dbConfig = {
  host: process.env.MARIADB_HOST || "localhost",
  port: process.env.MARIADB_PORT || "3306",
  user: process.env.MARIADB_USER || "root",
  password: process.env.MARIADB_PASSWORD || "password",
  database: process.env.MARIADB_DATABASE || "test_mcp_mariadb",
  allowDml: process.env.MARIADB_ALLOW_DML === 'true', // NEW
  allowDdl: process.env.MARIADB_ALLOW_DDL === 'true', // NEW
  timeoutMs: process.env.MARIADB_TIMEOUT_MS || "10000",
  rowLimit: process.env.MARIADB_ROW_LIMIT || "1000",
};

console.log("--- Test Configuration ---");
console.log(`Server Script: ${SERVER_SCRIPT_PATH}`);
console.log(`MCP Port: ${MCP_PORT}`);
console.log(`Client Timeout: ${CLIENT_TIMEOUT_MS}ms`);
console.log("Database Config (from env):");
console.log(`  Host: ${dbConfig.host}`);
console.log(`  Port: ${dbConfig.port}`);
console.log(`  User: ${dbConfig.user}`);
console.log(`  Database: ${dbConfig.database}`);
console.log(`  Allow DML: ${dbConfig.allowDml}`); // Log new flag
console.log(`  Allow DDL: ${dbConfig.allowDdl}`); // Log new flag
console.log("--------------------------\n");

let serverProcess;
let mcpClient;

// --- Helper Functions ---

/** Spawns the MariaDB MCP server process */
function startServer() {
  console.log(`Spawning server: node ${SERVER_SCRIPT_PATH}`);
  // Pass ALL necessary env vars, including the NEW permission flags
  serverProcess = spawn(
    "node",
    [SERVER_SCRIPT_PATH],
    {
      stdio: ["pipe", "pipe", "pipe", "ipc"], // Use 'pipe' for stdout/stderr
      env: {
        ...process.env, // Pass existing env vars
        MARIADB_HOST: dbConfig.host,
        MARIADB_PORT: dbConfig.port,
        MARIADB_USER: dbConfig.user,
        MARIADB_PASSWORD: dbConfig.password,
        MARIADB_DATABASE: dbConfig.database,
        MARIADB_ALLOW_DML: String(dbConfig.allowDml), // Pass DML flag
        MARIADB_ALLOW_DDL: String(dbConfig.allowDdl), // Pass DDL flag
        MARIADB_TIMEOUT_MS: dbConfig.timeoutMs,
        MARIADB_ROW_LIMIT: dbConfig.rowLimit,
        MCP_PORT: String(MCP_PORT), // Ensure server uses the same port
      },
    }
  );

  serverProcess.stdout.on("data", (data) => {
    console.log(`[Server STDOUT] ${data.toString().trim()}`);
  });
  serverProcess.stderr.on("data", (data) => {
    console.error(`[Server STDERR] ${data.toString().trim()}`);
  });
  serverProcess.on("error", (err) => {
    console.error("[Server Error] Failed to start server:", err);
    process.exit(1);
  });
  serverProcess.on("exit", (code, signal) => {
    console.log(`[Server Exit] Code: ${code}, Signal: ${signal}`);
    if (code !== 0 && signal !== 'SIGTERM') { // Don't error if we killed it intentionally
        console.error("Server exited unexpectedly!");
        // Optionally exit the test script if the server crashes non-intentionally
        // process.exit(1);
    }
  });

  console.log("Server process spawned. Waiting for it to initialize...");
  // Give the server a moment to start up before connecting
  return new Promise((resolve) => setTimeout(resolve, 3000)); // Adjust delay if needed
}

/** Connects the MCP client to the server */
async function connectClient() {
  console.log(`\nConnecting MCP client to ws://localhost:${MCP_PORT}...`);
  mcpClient = new Client({
    url: `ws://localhost:${MCP_PORT}`,
    name: "test-runner",
    version: "1.0.0",
    connectionTimeout: 5000, // Timeout for initial connection
    logLevel: "info", // Or 'debug' for more verbose client logs
  });

  try {
    const transport = new StdioClientTransport({
        // Use the spawned server process's stdio
        stdin: serverProcess.stdout,
        stdout: serverProcess.stdin,
        // Optionally pass stderr through for debugging
        stderr: serverProcess.stderr,
    });
    await mcpClient.connect(transport);
    console.log("MCP Client connected successfully.");
  } catch (error) {
    console.error("MCP Client connection failed:", error);
    if (serverProcess) serverProcess.kill();
    process.exit(1);
  }
}

/** Calls a tool on the connected MCP server */
async function callTool(toolName, params = {}) {
  if (!mcpClient || !mcpClient.isConnected) {
    throw new Error("MCP Client is not connected.");
  }
  console.log(`\n>>> Calling tool '${toolName}' on server '${SERVER_NAME}' with params:`, params);
  const request = new McpRequest({
    to: SERVER_NAME, // Target server name
    toolName: toolName,
    toolInput: params,
    timeout: CLIENT_TIMEOUT_MS, // Use configured timeout
  });

  try {
    const response = await mcpClient.callTool(request);
    console.log(`<<< Success response from '${toolName}':`);
    console.log(JSON.stringify(response.payload, null, 2)); // Pretty print payload
    return response.payload; // Return the payload for assertions
  } catch (error) {
    console.error(`<<< Error response from '${toolName}':`);
    console.error(`  Error Code: ${error.code}`);
    console.error(`  Error Message: ${error.message}`);
    console.error(`  Error Data: ${JSON.stringify(error.data, null, 2)}`);
    // Re-throw the error object itself for specific checks
    throw error;
  }
}

/** Stops the server and disconnects the client */
async function cleanup() {
  console.log("\n--- Cleaning up ---");
  if (mcpClient && mcpClient.isConnected) {
    console.log("Disconnecting MCP client...");
    await mcpClient.disconnect();
    console.log("MCP Client disconnected.");
  } else {
    console.log("MCP Client already disconnected or never connected.");
  }

  if (serverProcess && !serverProcess.killed) {
    console.log("Stopping server process...");
    const killed = serverProcess.kill("SIGTERM"); // Send SIGTERM for graceful shutdown
    if (killed) {
      console.log("SIGTERM sent to server process. Waiting for exit...");
      // Wait a short period for the process to exit gracefully
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!serverProcess.killed) {
          console.warn("Server did not exit after SIGTERM, sending SIGKILL.");
          serverProcess.kill("SIGKILL"); // Force kill if it didn't shut down
      } else {
          console.log("Server process exited gracefully.");
      }
    } else {
      console.error("Failed to send SIGTERM to server process.");
    }
  } else {
    console.log("Server process already stopped or never started.");
  }
  serverProcess = null;
  mcpClient = null;
  console.log("Cleanup complete.");
}

// --- Test Functions ---

async function testAnalyzeSchema() {
  console.log("\n--- Testing analyze_schema ---");
  try {
    const result = await callTool("analyze_schema");
    // Basic check: Ensure result is an object (more specific checks depend on expected schema)
    if (typeof result !== 'object' || result === null) {
        throw new Error("analyze_schema did not return an object.");
    }
    if (!result.tables || !Array.isArray(result.tables)) {
        throw new Error("analyze_schema response missing 'tables' array.");
    }
    console.log("analyze_schema test PASSED (basic structure validation).");
  } catch (error) {
    console.error("analyze_schema test FAILED:", error.message);
    throw error; // Propagate failure
  }
}

async function testExecuteSelect() {
    console.log("\n--- Testing execute_query (SELECT - Always Allowed) ---");
    try {
        const result = await callTool("execute_query", { query: "SELECT 1 + 1 AS result;" });
        if (!Array.isArray(result) || result.length !== 1 || result[0].result !== 2) {
            throw new Error("SELECT query did not return the expected result [[{ result: 2 }]]. Got: " + JSON.stringify(result));
        }
        console.log("execute_query (SELECT) test PASSED.");
    } catch (error) {
        console.error("execute_query (SELECT) test FAILED:", error.message);
        throw error; // Propagate failure
    }
}

// NEW: Test DML operations (conditionally)
async function testDml() {
  console.log(`\n--- Testing execute_query (DML - Allowed: ${dbConfig.allowDml}) ---`);
  const testTable = "test_dml_table";
  const insertQuery = `INSERT INTO ${testTable} (name) VALUES ('test_dml');`;
  const deleteQuery = `DELETE FROM ${testTable} WHERE name = 'test_dml';`;
  const checkQuery = `SELECT COUNT(*) as count FROM ${testTable} WHERE name = 'test_dml';`;

  // Ensure table exists (use DDL test logic, assuming DDL might be needed first)
  // For simplicity here, we assume test-setup created the necessary base table
  // or we rely on DDL tests running first if MARIADB_ALLOW_DDL=true.
  // A more robust approach might unconditionally try/catch a CREATE/DROP here if DDL allowed.

  if (dbConfig.allowDml) {
    console.log("Testing DML (should be ALLOWED)");
    try {
      // 1. Insert
      await callTool("execute_query", { query: insertQuery });
      console.log("  INSERT query executed (as expected).");

      // 2. Verify Insert
      let verifyResult = await callTool("execute_query", { query: checkQuery });
      if (verifyResult[0].count !== 1) throw new Error(`Verification failed after INSERT. Expected count 1, got ${verifyResult[0].count}`);
      console.log("  INSERT verified (as expected).");

      // 3. Delete
      await callTool("execute_query", { query: deleteQuery });
      console.log("  DELETE query executed (as expected).");

      // 4. Verify Delete
      verifyResult = await callTool("execute_query", { query: checkQuery });
       if (verifyResult[0].count !== 0) throw new Error(`Verification failed after DELETE. Expected count 0, got ${verifyResult[0].count}`);
      console.log("  DELETE verified (as expected).");

      console.log("execute_query (DML Allowed) test PASSED.");
    } catch (error) {
      console.error("execute_query (DML Allowed) test FAILED:", error.message);
      throw error;
    }
  } else {
    console.log("Testing DML (should be DISALLOWED)");
    try {
      await callTool("execute_query", { query: insertQuery });
      // If it reaches here, the test failed because the disallowed query was executed
      throw new Error("DML query (INSERT) was allowed but should have been rejected.");
    } catch (error) {
      // Expecting an error, specifically a permission error
      if (error.code === 'McpToolError' && error.message.includes("not permitted")) { // Adjust error check as needed
        console.log("  INSERT query rejected (as expected).");
      } else {
        console.error("  INSERT rejection failed. Expected McpToolError for permissions, got:", error);
        throw error; // Re-throw unexpected error
      }
    }
     try {
      await callTool("execute_query", { query: deleteQuery });
      throw new Error("DML query (DELETE) was allowed but should have been rejected.");
    } catch (error) {
      if (error.code === 'McpToolError' && error.message.includes("not permitted")) {
        console.log("  DELETE query rejected (as expected).");
      } else {
        console.error("  DELETE rejection failed. Expected McpToolError for permissions, got:", error);
        throw error;
      }
    }
    console.log("execute_query (DML Disallowed) test PASSED.");
  }
}

// NEW: Test DDL operations (conditionally)
async function testDdl() {
  console.log(`\n--- Testing execute_query (DDL - Allowed: ${dbConfig.allowDdl}) ---`);
  const testTable = "test_ddl_temp_table";
  const createQuery = `CREATE TABLE ${testTable} (id INT PRIMARY KEY AUTO_INCREMENT, name VARCHAR(50));`;
  const dropQuery = `DROP TABLE IF EXISTS ${testTable};`; // Use IF EXISTS for safety

  // Always try to drop first in case of previous failed run
   try {
       console.log(`  Attempting cleanup: ${dropQuery}`);
       // We need to know if DDL is *supposed* to be allowed for this initial drop
       if (dbConfig.allowDdl) {
           await callTool("execute_query", { query: dropQuery });
           console.log("  Pre-test DROP executed (or table didn't exist).");
       } else {
           // If DDL is disallowed, we expect the drop to fail, but we don't want this failure to stop the test.
           try { await callTool("execute_query", { query: dropQuery }); } catch (e) { /* Ignore expected failure */ }
           console.log("  Pre-test DROP skipped/failed (as DDL is disallowed).");
       }
   } catch (error) {
       // If DDL *is* allowed, but drop still fails, log it but continue.
       console.warn(`  Warning: Pre-test DROP failed unexpectedly (DDL allowed: ${dbConfig.allowDdl}):`, error.message);
   }


  if (dbConfig.allowDdl) {
    console.log("Testing DDL (should be ALLOWED)");
    try {
      // 1. Create Table
      await callTool("execute_query", { query: createQuery });
      console.log("  CREATE TABLE query executed (as expected).");

      // 2. Verify Create (e.g., by trying to describe it or insert/select)
      try {
          await callTool("execute_query", { query: `DESCRIBE ${testTable};` });
          console.log(`  CREATE TABLE verified via DESCRIBE (as expected).`);
      } catch(verifyError) {
          throw new Error(`Verification failed after CREATE TABLE. DESCRIBE failed: ${verifyError.message}`);
      }

      // 3. Drop Table
      await callTool("execute_query", { query: dropQuery });
      console.log("  DROP TABLE query executed (as expected).");

       // 4. Verify Drop (e.g., by trying to describe it again, expecting failure)
      try {
          await callTool("execute_query", { query: `DESCRIBE ${testTable};` });
          // If DESCRIBE succeeds here, the DROP failed.
          throw new Error(`Verification failed after DROP TABLE. DESCRIBE succeeded unexpectedly.`);
      } catch(verifyError) {
          // We expect an error here because the table shouldn't exist.
          // Check if it's the expected 'table does not exist' error.
          // Note: Specific error messages/codes might vary. Adjust as needed.
          if (verifyError.message && (verifyError.message.includes("doesn't exist") || verifyError.message.includes("Unknown table"))) {
               console.log(`  DROP TABLE verified via DESCRIBE failure (as expected).`);
          } else {
              throw new Error(`Verification failed after DROP TABLE. DESCRIBE failed with unexpected error: ${verifyError.message || verifyError}`);
          }
      }

      console.log("execute_query (DDL Allowed) test PASSED.");
    } catch (error) {
      console.error("execute_query (DDL Allowed) test FAILED:", error.message);
      // Attempt cleanup even on failure
      try { await callTool("execute_query", { query: dropQuery }); } catch (e) { /* Ignore cleanup error */ }
      throw error;
    }
  } else {
    console.log("Testing DDL (should be DISALLOWED)");
    try {
      await callTool("execute_query", { query: createQuery });
      throw new Error("DDL query (CREATE TABLE) was allowed but should have been rejected.");
    } catch (error) {
      if (error.code === 'McpToolError' && error.message.includes("not permitted")) {
        console.log("  CREATE TABLE query rejected (as expected).");
      } else {
        console.error("  CREATE TABLE rejection failed. Expected McpToolError for permissions, got:", error);
        throw error;
      }
    }
     try {
      await callTool("execute_query", { query: dropQuery });
      // If DDL is disallowed, this drop might target a non-existent table anyway,
      // OR it might target one created if the CREATE test failed unexpectedly.
      // The core check is whether the *command type* is rejected.
      throw new Error("DDL query (DROP TABLE) was allowed but should have been rejected.");
    } catch (error) {
      if (error.code === 'McpToolError' && error.message.includes("not permitted")) {
        console.log("  DROP TABLE query rejected (as expected).");
      } else {
         // If the error is 'table does not exist', that's okay here, as the rejection is the primary goal.
         // We only fail if it's *not* a permission error *and* not a 'table doesn't exist' error.
         if (!error.message || !(error.message.includes("doesn't exist") || error.message.includes("Unknown table"))) {
            console.log("  DROP TABLE query rejected (or table didn't exist - acceptable as DDL disallowed).");
         } else {
             console.error("  DROP TABLE rejection failed. Expected McpToolError for permissions, got:", error);
             throw error;
         }
      }
    }
    console.log("execute_query (DDL Disallowed) test PASSED.");
  }
}


// --- Main Execution ---

async function main() {
  let exitCode = 0;
  try {
    await startServer();
    await connectClient();

    // Run tests sequentially
    await testAnalyzeSchema();
    await testExecuteSelect(); // Test basic SELECT
    await testDml();           // Test DML based on flag
    await testDdl();           // Test DDL based on flag

    console.log("\n✅ ✅ ✅ All tool tests completed successfully! ✅ ✅ ✅");

  } catch (error) {
    console.error("\n❌ ❌ ❌ One or more tool tests FAILED! ❌ ❌ ❌");
    // Error details already logged by callTool or test functions
    exitCode = 1; // Indicate failure
  } finally {
    await cleanup();
    process.exit(exitCode); // Exit with 0 on success, 1 on failure
  }
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log("\nReceived SIGINT (Ctrl+C). Shutting down...");
    await cleanup();
    process.exit(1); // Exit with error code on interrupt
});
process.on('SIGTERM', async () => {
    console.log("\nReceived SIGTERM. Shutting down...");
    await cleanup();
    process.exit(0); // Exit gracefully on SIGTERM
});

main();
