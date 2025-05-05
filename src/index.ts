#!/usr/bin/env node

/**
 * MariaDB Database Access MCP Server
 *
 * This MCP server provides access to MariaDB databases.
 * It allows:
 * - Listing available databases
 * - Listing tables in a database
 * - Analyzing table schemas (columns, FKs, indexes)
 * - Executing read-only SQL queries
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

import mariadb from "mariadb"; // Added import
import {
  createConnectionPool,
  executeQuery,
  endConnection,
  getConfigFromEnv,
  PoolConnectionDetails, // Added import
} from "./connection.js";
import { analyzeTables } from "./dbService.js";


/**
 * Create an MCP server with tools for MariaDB database access
 */
const server = new Server(
  {
    name: "mariadb-mcp-server",
    version: "0.0.2", // Consider incrementing version later
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Handler that lists available tools for MariaDB database access
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_databases",
        description: "List all accessible databases on the MariaDB server",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "list_tables",
        description: "List all tables in a specified database",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description:
                "Database name (optional, uses default if not specified)",
            },
          },
          required: [],
        },
      },
      // Removed describe_table, list_foreign_keys, list_indexes
      { // Added analyze_table_schema definition
        name: "analyze_table_schema",
        description: "Provides a comprehensive analysis of table schemas, including columns, foreign keys, and indexes, with varying levels of detail.",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description: "Database name (optional, uses default if not specified)",
            },
            table_names: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              description: "An array of table names to analyze.",
            },
            detail_level: {
              type: "string",
              enum: ["BASIC", "STANDARD", "FULL"],
              default: "STANDARD",
              description: "Level of detail: BASIC (columns), STANDARD (+FKs, index names), FULL (all details). Default: STANDARD",
            },
          },
          required: ["table_names"],
        },
      },
      {
        name: "execute_query",
        description: "Execute a SQL query",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: `SQL query to execute. SELECT, SHOW, DESCRIBE, EXPLAIN are always allowed. DML (INSERT, UPDATE, DELETE, REPLACE) requires MARIADB_ALLOW_DML=true. DDL (CREATE, ALTER, DROP, TRUNCATE) requires MARIADB_ALLOW_DDL=true. Other commands (GRANT, SET, etc.) and multiple statements are disallowed.`,
            },
            database: {
              type: "string",
              description:
                "Database name (optional, uses default if not specified)",
            },
          },
          required: ["query"],
        },
      },
    ],
  };
});

// Global variable to hold pool details. Initialized lazily.
let poolDetails: PoolConnectionDetails | null = null;

/**
 * Helper function to initialize the connection pool on demand.
 * Throws McpError if initialization fails.
 */
async function getOrCreatePoolDetails(): Promise<PoolConnectionDetails> {
  if (poolDetails) {
    return poolDetails;
  }

  console.error("[Lazy Init] Initializing MariaDB connection pool...");
  try {
    const config = getConfigFromEnv(); // Can throw config errors
    poolDetails = createConnectionPool(config); // Can throw pool creation errors
    console.error("[Lazy Init] Connection pool initialized successfully.");

    // Optional: Add a quick connection test
    const conn = await poolDetails.pool.getConnection();
    await conn.ping();
    await conn.release();
    console.error("[Lazy Init] Database connection verified.");

    return poolDetails;
  } catch (error) {
    console.error("[Fatal Lazy Init] Entered catch block. Error:", error); // <-- Add log
    // Ensure pool is null if initialization failed partially
    if (poolDetails?.pool) {
        try {
            console.error("[Fatal Lazy Init] Attempting pool cleanup..."); // <-- Add log
            await endConnection(poolDetails.pool);
            console.error("[Fatal Lazy Init] Pool cleanup successful."); // <-- Add log
        } catch (e) {
            console.error("[Fatal Lazy Init] Pool cleanup failed:", e); // <-- Add log
         }
    }
    poolDetails = null;
    // Convert initialization error to McpError
    const mcpErr = new McpError( // Create error first
        ErrorCode.InternalError, // Use standard InternalError for initialization failures
        `Failed to initialize database connection: ${error instanceof Error ? error.message : String(error)}`
    );
    console.error(`[Fatal Lazy Init] Throwing McpError: Code=${mcpErr.code}, Message=${mcpErr.message}`); // <-- Add log
    throw mcpErr; // Throw the created error
  }
}


/**
 * Handler for MariaDB database access tools
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Log the raw incoming request *before* anything else
  console.error(`[Index Handler] Received tool call request: ${JSON.stringify(request)}`);

  // REMOVED Eager pool check. Will initialize lazily per tool.

  try {
    // Force pool initialization attempt immediately within the main try block
    console.error("[Index Handler] Attempting eager pool initialization for tool call...");
    const currentPoolDetails = await getOrCreatePoolDetails();
    console.error("[Index Handler] Eager pool initialization successful (or already initialized).");

    switch (request.params.name) {
      case "list_databases": {
        console.error("[Tool] Executing list_databases");
        // Use the already initialized pool details
        const { pool, allowDml, allowDdl } = currentPoolDetails;
        const { rows } = await executeQuery(pool, allowDml, allowDdl, "SHOW DATABASES");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(rows, null, 2),
            },
          ],
        };
      }

      case "list_tables": {
        console.error("[Tool] Executing list_tables");
        // Use the already initialized pool details
        const { pool, allowDml, allowDdl } = currentPoolDetails;

        const database = request.params.arguments?.database as
          | string
          | undefined;

        const { rows } = await executeQuery(pool, allowDml, allowDdl, "SHOW FULL TABLES", [], database);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(rows, null, 2),
            },
          ],
        };
      }

      // Removed cases for describe_table, list_foreign_keys, list_indexes

      case "analyze_table_schema": { // Added case for analyze_table_schema
        console.error("[Tool] Executing analyze_table_schema");
        // Use the already initialized pool details (variable name already matches)

        const args = request.params.arguments || {};
        const tableNames = args.table_names as string[] | undefined;
        const detailLevel = args.detail_level as string | undefined; // Will default inside analyzeDatabaseTables
        const database = args.database as string | undefined;

        // Basic validation moved inside analyzeDatabaseTables, but check array presence here
        if (!tableNames || !Array.isArray(tableNames) || tableNames.length === 0) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Missing or invalid 'table_names' argument: Must be a non-empty array of strings."
          );
        }

        // Log arguments just before calling the analysis function
        console.error(`[Index] Calling analyzeDatabaseTables with: tableNames=${JSON.stringify(tableNames)}, detailLevel=${detailLevel}, database=${database}`); // <-- Add log

        // Call the dedicated analysis function
        // Pass the lazily loaded poolDetails
        const analysisResult = await analyzeTables(
          currentPoolDetails, // Pass the connection details obtained lazily
          tableNames,
          detailLevel || "STANDARD", // Pass default explicitly if undefined
          database
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(analysisResult, null, 2),
            },
          ],
        };
      }

      case "execute_query": {
        console.error("[Tool] Executing execute_query");
        // Use the already initialized pool details
        const { pool, allowDml, allowDdl } = currentPoolDetails;

        const query = request.params.arguments?.query as string;
        const database = request.params.arguments?.database as
          | string
          | undefined;

        if (!query) {
          throw new McpError(ErrorCode.InvalidParams, "Query is required");
        }

        const { rows } = await executeQuery(pool, allowDml, allowDdl, query, [], database);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(rows, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
    }
  } catch (error) {
    console.error("[Error] Tool execution failed:", error);

    // Format error message for client
    // Check if it's already an McpError
    if (error instanceof McpError) {
        console.error(`[Error Handler] Re-throwing McpError: Code=${error.code}, Message=${error.message}`); // <-- Add log
        // Re-throw McpError so the server handles it correctly
        throw error;

    }

    // Otherwise, wrap it in a generic internal error McpError
    // Include connection details if available
    let errorMessage = `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`;
    if (poolDetails?.config) {
      // Include config details (including password as requested for dev)
      const { host, port, user, password, database } = poolDetails.config;
      errorMessage += ` | Connection Details: { host: ${host}, port: ${port}, user: ${user}, password: ${password}, database: ${database || '(default)'} }`;
    }
    throw new McpError(
        ErrorCode.InternalError,
        errorMessage
    );
  }
});

/**
 * Start the server using stdio transport
 */
async function main() {
  console.error("[Setup] Starting MariaDB MCP server");

  try {
    // REMOVED Eager pool initialization
    // console.error("[Setup] Initializing MariaDB connection pool...");
    // const config = getConfigFromEnv();
    // poolDetails = createConnectionPool(config); // Store pool details globally
    // console.error("[Setup] Connection pool initialized.");

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[Setup] MariaDB MCP server running on stdio. Pool will be initialized lazily.");
  } catch (error) {
    // This catch block now primarily handles server.connect errors
    console.error("[Fatal] Failed to start server:", error);
    // Pool wouldn't be initialized here anyway with lazy loading
    // if (poolDetails?.pool) {
    //     await endConnection(poolDetails.pool);
    // }
    process.exit(1); // Exit if server connection fails
  }
}

// Handle process termination
process.on("SIGINT", async () => {
  console.error("[Shutdown] Received SIGINT. Closing MariaDB connection pool...");
  // Pass the specific pool instance to endConnection
  if (poolDetails?.pool) {
      await endConnection(poolDetails.pool);
  } else {
      console.warn("[Shutdown] Pool was not initialized, nothing to close.");
  }
  process.exit(0);
});

// Start the server
main().catch((error) => {
  // Catch McpErrors specifically if needed, otherwise log generic fatal error
  if (error instanceof McpError) {
      console.error(`[Fatal Catch Block] Caught McpError. Code: ${error.code}, Message: ${error.message}`); // <-- Add log
      console.error(`[Fatal MCP Error] Code: ${error.code}, Message: ${error.message}`);
  } else {
      console.error("[Fatal] Unhandled error:", error);
  }
  process.exit(1);
});
