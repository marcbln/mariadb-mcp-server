#!/usr/bin/env node

/**
 * MariaDB Database Access MCP Server
 *
 * This MCP server provides access to MariaDB databases.
 * It allows:
 * - Listing available databases
 * - Listing tables in a database
 * - Describing table schemas
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

/**
 * Create an MCP server with tools for MariaDB database access
 */
const server = new Server(
  {
    name: "mariadb-mcp-server",
    version: "0.0.1",
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
      {
        name: "describe_table",
        description: "Show the schema for a specific table",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description:
                "Database name (optional, uses default if not specified)",
            },
            table: {
              type: "string",
              description: "Table name",
            },
          },
          required: ["table"],
        },
      },
      {
        name: "list_foreign_keys",
        description: "Lists all foreign key constraints defined on a specific table, showing which other tables/columns they reference",
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

      case "describe_table": {
        console.error("[Tool] Executing describe_table");

        const database = request.params.arguments?.database as
          | string
          | undefined;
        const table = request.params.arguments?.table as string;

        if (!table) {
          throw new McpError(ErrorCode.InvalidParams, "Table name is required");
        }

        const dbName = database || (await getConfigFromEnv()).database;
        if (!dbName) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "Database name is required (either in arguments or environment config)"
          );
        }

        const sql = `
          SELECT
              COLUMN_NAME AS Field,
              COLUMN_TYPE AS Type,
              IS_NULLABLE AS \`Null\`,
              COLUMN_KEY AS \`Key\`,
              COLUMN_DEFAULT AS \`Default\`,
              EXTRA AS Extra,
              COLUMN_COMMENT AS Comment
          FROM
              INFORMATION_SCHEMA.COLUMNS
          WHERE
              TABLE_SCHEMA = :dbName AND TABLE_NAME = :tableName
          ORDER BY
              ORDINAL_POSITION;
        `;

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
    return {
      content: [
        {
          type: "text",
          text: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
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
  console.error("[Fatal] Unhandled error:", error);
  process.exit(1);
});
