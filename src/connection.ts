/**
 * MariaDB connection management for MCP server
 */

import mariadb from "mariadb";
import { MariaDBConfig } from "./types.js";
import { checkPermissions } from "./permissionService.js";

// Default connection timeout in milliseconds
const DEFAULT_TIMEOUT = 10000;

// Default row limit for query results
const DEFAULT_ROW_LIMIT = 1000;

// REMOVED Module-level state:
// let pool: mariadb.Pool | null = null;
// let allowDml: boolean = false;
// let allowDdl: boolean = false;

// Define a type for the object returned by createConnectionPool
export interface PoolConnectionDetails {
  pool: mariadb.Pool;
  allowDml: boolean;
  allowDdl: boolean;
}

/**
 * Create a MariaDB connection pool and return it along with its permissions.
 * This function ALWAYS creates a new pool instance.
 */
export function createConnectionPool(config?: MariaDBConfig): PoolConnectionDetails {
  console.error("[Setup] Creating new MariaDB connection pool");

  // Determine configuration: use provided config or get from environment
  const poolConfig = config || getConfigFromEnv();
  console.error(`[Setup] Using configuration: ${config ? 'provided' : 'from environment'}`);

  // Extract permissions from the configuration
  const allowDml = poolConfig.allow_dml;
  const allowDdl = poolConfig.allow_ddl;

  let newPool: mariadb.Pool;
  try {
    console.error("[Setup] Creating new connection pool instance.");
    newPool = mariadb.createPool({
      host: poolConfig.host,
      port: poolConfig.port,
      user: poolConfig.user,
      password: poolConfig.password,
      database: poolConfig.database, // Use database from config
      bigIntAsNumber: true,
      connectionLimit: 2,
      connectTimeout: DEFAULT_TIMEOUT,
    });
    console.error("[Setup] New connection pool created successfully.");
  } catch (error) {
    console.error("[Error] Failed to create connection pool:", error);
    throw error; // Re-throw the error after logging
  }

  // Return the pool and its associated permissions
  return { pool: newPool, allowDml, allowDdl };
}

/**
 * Execute a query using a specific pool and permissions, with error handling and logging.
 */
export async function executeQuery(
  pool: mariadb.Pool, // Accept pool instance
  allowDml: boolean, // Accept DML permission
  allowDdl: boolean, // Accept DDL permission
  sql: string,
  params: any[] | { [key: string]: any } = [],
  database?: string
): Promise<{ rows: any; fields: mariadb.FieldInfo[] }> {
  console.error(`[Query] Executing: ${sql}`);

  // Pool must be provided now, remove the check and implicit creation
  if (!pool) {
     console.error("[Error] executeQuery called without a valid pool instance.");
     throw new Error("executeQuery requires a valid pool instance.");
  }

  let conn: mariadb.PoolConnection | null = null;
  try {
    // Get connection from the provided pool
    console.error("[Query] Acquiring new connection from pool...");
    conn = await pool.getConnection();
    console.error("[Query] Connection acquired successfully");

    // Use specific database if provided
    if (database) {
      console.error(`[Query] Using database: ${database}`);
      await conn.query(`USE \`${database}\``);
    }

    // Validate permissions using the provided flags and the dedicated service
    if (!checkPermissions(sql, allowDml, allowDdl)) {
      // checkPermissions logs the specific reason internally
      throw new Error("Query not permitted based on DML/DDL/Command restrictions.");
    }

    // Execute query with timeout
    const queryOptions: mariadb.QueryOptions = {
      metaAsArray: true,
      namedPlaceholders: true,
      sql,
      timeout: DEFAULT_TIMEOUT,
    };

    // If using named placeholders, pass the params object directly
    if (queryOptions.namedPlaceholders) {
      (queryOptions as any).values = params; // Pass the object as 'values'
    } else {
      // Otherwise, spread the array (original behavior)
      Object.assign(queryOptions, params);
    }

    console.error(`[Query] Executing conn.query for SQL: ${sql.substring(0, 100)}...`);
    const [rows, fields] = await conn.query(queryOptions);
    console.error(`[Query] Finished conn.query for SQL: ${sql.substring(0, 100)}...`);

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
      processedRows = rows;
    }

    // Apply row limit if result is an array
    const limitedRows =
      Array.isArray(processedRows) && processedRows.length > DEFAULT_ROW_LIMIT
        ? processedRows.slice(0, DEFAULT_ROW_LIMIT)
        : processedRows;

    // Log result summary
    console.error(
      `[Query] Success: ${
        Array.isArray(rows) ? rows.length : 1
      } rows returned with ${JSON.stringify(params)}`
    );

    return { rows: limitedRows, fields };
  } catch (error) {
    // Log before releasing in catch
    console.error("[Query] Error occurred. Attempting connection.release() in CATCH block...");
    if (conn) {
      try { await conn.release(); } catch (releaseError) { console.error("[Error] Failed to release connection in CATCH block:", releaseError); }
      console.error("[Query] Connection released in CATCH block.");
    }
    // Error is logged by the caller or test runner via the thrown error
    throw error;
  } finally {
    // Release connection back to pool
    // Log before releasing in finally
    console.error("[Query] Attempting connection.release() in FINALLY block...");
    if (conn) {
       try { await conn.release(); } catch (releaseError) { console.error("[Error] Failed to release connection in FINALLY block:", releaseError); }
      console.error("[Query] Connection released in FINALLY block.");
    }
  }
}

/**
 * Get MariaDB connection configuration from environment variables
 */
export function getConfigFromEnv(): MariaDBConfig {
  const host = process.env.MARIADB_HOST;
  const portStr = process.env.MARIADB_PORT;
  const user = process.env.MARIADB_USER;
  const password = process.env.MARIADB_PASSWORD;
  const database = process.env.MARIADB_DATABASE;
  const allow_dml = process.env.MARIADB_ALLOW_DML === "true"; // Default false
  const allow_ddl = process.env.MARIADB_ALLOW_DDL === "true"; // Default false

  if (!host) throw new Error("MARIADB_HOST environment variable is required");
  if (!user) throw new Error("MARIADB_USER environment variable is required");
  if (!password)
    throw new Error("MARIADB_PASSWORD environment variable is required");

  const port = portStr ? parseInt(portStr, 10) : 3306;

  console.error("[Setup] MariaDB configuration from Env:", {
    host: host,
    port: port,
    user: user,
    database: database || "(default not set)",
    allow_dml: allow_dml,
    allow_ddl: allow_ddl,
  });

  return {
    host,
    port,
    user,
    password,
    database,
    allow_dml,
    allow_ddl,
  };
}

/**
 * End a specific MariaDB connection pool.
 */
export async function endConnection(pool: mariadb.Pool | null) {
  if (pool) {
    console.error("[Teardown] Ending connection pool.");
    try {
        await pool.end();
        console.error("[Teardown] Connection pool ended successfully.");
    } catch (error) {
        console.error("[Error] Failed to end connection pool:", error);
        // Decide if we should throw here or just log
    }
  } else {
      console.warn("[Teardown] Attempted to end a null connection pool.");
  }
}
