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

import {
  createConnectionPool,
  executeQuery,
  endConnection,
  getConfigFromEnv,
} from "./connection.js";
import { analyzeTables } from "./dbService.js";

/**
 * Create an MCP server with tools for MariaDB database access
 */
const server = new Server(
  {
    name: "mariadb-mcp-server",
    version: "0.0.1", // Consider incrementing version later
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
              description: `SQL query (only SELECT, ${
                process.env.MARIADB_ALLOW_INSERT ? "INSERT," : ""
              } ${process.env.MARIADB_ALLOW_UPDATE ? "UPDATE," : ""} ${
                process.env.MARIADB_ALLOW_DELETE ? "DELETE," : ""
              } SHOW, DESCRIBE, and EXPLAIN statements are allowed)`,
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

/**
 * Handler for MariaDB database access tools
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Log the raw incoming request *before* anything else
  console.error(`[Index Handler] Received tool call request: ${JSON.stringify(request)}`); // <-- Add log
  try {
    createConnectionPool();
  } catch (error) {
    console.error("[Fatal] Failed to initialize MariaDB connection:", error);
    process.exit(1);
  }

  try {
    switch (request.params.name) {
      case "list_databases": {
        console.error("[Tool] Executing list_databases");
        const { rows } = await executeQuery("SHOW DATABASES");
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

        const database = request.params.arguments?.database as
          | string
          | undefined;

        const { rows } = await executeQuery("SHOW FULL TABLES", [], database);

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
        const analysisResult = await analyzeTables(
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

        const query = request.params.arguments?.query as string;
        const database = request.params.arguments?.database as
          | string
          | undefined;

        if (!query) {
          throw new McpError(ErrorCode.InvalidParams, "Query is required");
        }

        const { rows } = await executeQuery(query, [], database);

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
        // Re-throw McpError so the server handles it correctly
        throw error;
    }

    // Otherwise, wrap it in a generic internal error McpError
    throw new McpError(
        ErrorCode.InternalError,
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

/**
 * Start the server using stdio transport
 */
async function main() {
  console.error("[Setup] Starting MariaDB MCP server");

  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[Setup] MariaDB MCP server running on stdio");
  } catch (error) {
    console.error("[Fatal] Failed to start server:", error);
    process.exit(1);
  }
}

// Handle process termination
process.on("SIGINT", async () => {
  console.error("[Shutdown] Closing MariaDB connection pool");
  await endConnection();
  process.exit(0);
});

// Start the server
main().catch((error) => {
  // Catch McpErrors specifically if needed, otherwise log generic fatal error
  if (error instanceof McpError) {
      console.error(`[Fatal MCP Error] Code: ${error.code}, Message: ${error.message}`);
  } else {
      console.error("[Fatal] Unhandled error:", error);
  }
  process.exit(1);
});
