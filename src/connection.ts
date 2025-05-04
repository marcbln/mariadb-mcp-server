/**
 * MariaDB connection management for MCP server
 */

import mariadb from "mariadb";
import { MariaDBConfig } from "./types.js";
import { isAlloowedQuery } from "./validators.js";

// Default connection timeout in milliseconds
const DEFAULT_TIMEOUT = 10000;

// Default row limit for query results
const DEFAULT_ROW_LIMIT = 1000;

let pool: mariadb.Pool | null = null;

/**
 * Create a MariaDB connection pool
 */
export function createConnectionPool(config?: MariaDBConfig): mariadb.Pool {
  console.error("[Setup] Creating/Retrieving MariaDB connection pool");

  // If a pool already exists, return it
  if (pool) {
    console.error("[Setup] Connection pool already exists, returning existing pool.");
    return pool;
  }

  // Determine configuration: use provided config or get from environment
  const poolConfig = config || getConfigFromEnv();
  console.error(`[Setup] Using configuration: ${config ? 'provided' : 'from environment'}`);

  try {
    console.error("[Setup] Creating new connection pool instance.");
    pool = mariadb.createPool({
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

  return pool;
}

/**
 * Execute a query with error handling and logging
 */
export async function executeQuery(
  sql: string,
  params: any[] | { [key: string]: any } = [],
  database?: string
): Promise<{ rows: any; fields: mariadb.FieldInfo[] }> {
  console.error(`[Query] Executing: ${sql}`);
  // Create connection pool if not already created
  if (!pool) {
    console.error("[Setup] Connection pool not found, creating a new one");
    // If the pool doesn't exist here, it means it wasn't initialized externally (e.g., by tests)
    // So, create it using environment variables as the default behavior for the main application.
    pool = createConnectionPool(); // Calls the modified function without args, using env vars
  }
  let conn: mariadb.PoolConnection | null = null;
  try {
    // Get connection from pool
    console.error("[Query] Acquiring new connection from pool...");
    conn = await pool.getConnection();
    console.error("[Query] Connection acquired successfully");

    // Use specific database if provided
    if (database) {
      console.error(`[Query] Using database: ${database}`);
      await conn.query(`USE \`${database}\``);
    }
    if (!isAlloowedQuery(sql)) {
      throw new Error("Query not allowed");
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

    console.error(`[Query] Executing conn.query for SQL: ${sql.substring(0, 100)}...`); // <-- Add log before query
    const [rows, fields] = await conn.query(queryOptions);
    console.error(`[Query] Finished conn.query for SQL: ${sql.substring(0, 100)}...`); // <-- Add log after query

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
    console.error("[Query] Error occurred. Attempting connection.release() in CATCH block..."); // <-- Add log
    if (conn) {
      conn.release();
      console.error("[Query] Connection released in CATCH block."); // <-- Add log
    }
    console.error("[Error] Query execution failed:", error);
    throw error;
  } finally {
    // Release connection back to pool
    // Log before releasing in finally
    console.error("[Query] Attempting connection.release() in FINALLY block..."); // <-- Add log
    if (conn) {
      conn.release();
      console.error("[Query] Connection released in FINALLY block."); // <-- Add log
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
  const allow_insert = process.env.MARIADB_ALLOW_INSERT === "true";
  const allow_update = process.env.MARIADB_ALLOW_UPDATE === "true";
  const allow_delete = process.env.MARIADB_ALLOW_DELETE === "true";

  if (!host) throw new Error("MARIADB_HOST environment variable is required");
  if (!user) throw new Error("MARIADB_USER environment variable is required");
  if (!password)
    throw new Error("MARIADB_PASSWORD environment variable is required");

  const port = portStr ? parseInt(portStr, 10) : 3306;

  console.error("[Setup] MariaDB configuration:", {
    host: host,
    port: port,
    user: user,
    database: database || "(default not set)",
  });

  return {
    host,
    port,
    user,
    password,
    database,
    allow_insert,
    allow_update,
    allow_delete,
  };
}

export function endConnection() {
  if (pool) {
    return pool.end();
  }
}
