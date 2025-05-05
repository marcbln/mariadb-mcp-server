import mariadb from "mariadb"; // Added import
import { executeQuery, getConfigFromEnv, PoolConnectionDetails } from "./connection.js"; // Added PoolConnectionDetails
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { toCamelCase } from "./stringUtils.js";

/**
 * Enum defining the granular details that can be fetched for table schema analysis.
 */
export enum SchemaDetailFlag {
  COLUMNS_BASIC = "COLUMNS_BASIC", // Column Name, Type
  COLUMNS_FULL = "COLUMNS_FULL",   // All column attributes
  FOREIGN_KEYS = "FOREIGN_KEYS", // FK constraints + rules
  INDEXES_BASIC = "INDEXES_BASIC", // Index names and associated columns
  INDEXES_FULL = "INDEXES_FULL",   // All index attributes
}

/**
 * Maps the user-facing detail_level string to internal SchemaDetailFlags.
 */
const detailLevelToFlags: Record<string, SchemaDetailFlag[]> = {
  BASIC: [
      SchemaDetailFlag.COLUMNS_BASIC
  ],
  STANDARD: [
    SchemaDetailFlag.COLUMNS_BASIC,
    SchemaDetailFlag.FOREIGN_KEYS,
    SchemaDetailFlag.INDEXES_BASIC,
  ],
  FULL: [
    SchemaDetailFlag.COLUMNS_FULL,
    SchemaDetailFlag.FOREIGN_KEYS,
    SchemaDetailFlag.INDEXES_FULL,
  ],
};

/**
 * Analyzes the schema of one or more tables in a database based on the requested detail level.
 *
 * @param tableNames - An array of table names to analyze.
 * @param detailLevel - The requested level of detail ('BASIC', 'STANDARD', 'FULL').
 * @param database - Optional database name to use; overrides default from config.
 * @returns A promise resolving to an object where keys are table names and values
 *          are the analysis results for that table.
 */
export async function analyzeTables(
  poolDetails: PoolConnectionDetails, // Added poolDetails argument
  tableNames: string[],
  detailLevel: string,
  database?: string
): Promise<Record<string, any>> {
  if (!tableNames || tableNames.length === 0) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "table_names array cannot be empty"
    );
  }

  const effectiveDetailLevel = detailLevel?.toUpperCase() || "STANDARD";
  const flags =
    detailLevelToFlags[effectiveDetailLevel] ||
    detailLevelToFlags["STANDARD"]; // Default to STANDARD if invalid level provided

  const dbName = database || (await getConfigFromEnv()).database;
  if (!dbName) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Database name is required (either in arguments or environment config)"
    );
  }
   // Basic validation for database name
   if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid database name format.");
 }

  const results: Record<string, any> = {};

  for (const tableName of tableNames) {
     // Basic validation for table name
     if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        console.warn(`[Warning] Invalid table name format skipped: ${tableName}`);
        results[tableName] = { error: "Invalid table name format." };
        continue; // Skip this table
     }

     // --- ADD TABLE EXISTENCE CHECK ---
     try {
         const checkSql = `
             SELECT COUNT(*) as count
             FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = :dbName AND TABLE_NAME = :tableName;
         `;
         const { pool, allowDml, allowDdl } = poolDetails;
         const { rows: checkRows } = await executeQuery(pool, allowDml, allowDdl, checkSql, { dbName, tableName }, undefined);

         if (checkRows.length === 0 || checkRows[0].count === 0) {
             console.warn(`[Analyze] Table ${dbName}.${tableName} does not exist. Skipping analysis.`);
             results[tableName] = { error: `Table '${tableName}' does not exist in database '${dbName}'.` };
             continue; // Skip to the next table
         }
     } catch (checkError: any) {
         console.error(`[Error] Failed to check existence for table ${dbName}.${tableName}:`, checkError);
         results[tableName] = {
             error: `Failed to check existence for table '${tableName}': ${checkError.message || String(checkError)}`
         };
         continue; // Skip to the next table if check fails
     }
     // --- END TABLE EXISTENCE CHECK ---

    console.error(`[Analyze] Analyzing table: ${dbName}.${tableName} with flags: ${flags.join(', ')}`);
    const tableResult: any = {};

    try {
      // --- Fetch data based on flags ---

      // COLUMNS_FULL implies COLUMNS_BASIC, so check full first
      if (flags.includes(SchemaDetailFlag.COLUMNS_FULL)) {
        // Pass poolDetails down
        tableResult.columns = await fetchFullColumnDetails(poolDetails, dbName, tableName);
      } else if (flags.includes(SchemaDetailFlag.COLUMNS_BASIC)) {
        // Pass poolDetails down
        console.error(`[Analyze] Calling fetchBasicColumnDetails for ${dbName}.${tableName}`);
        tableResult.columns = await fetchBasicColumnDetails(poolDetails, dbName, tableName);
        console.error(`[Analyze] Returned from fetchBasicColumnDetails for ${dbName}.${tableName}`);
      }

      if (flags.includes(SchemaDetailFlag.FOREIGN_KEYS)) {
        // Pass poolDetails down
        tableResult.foreign_keys = await fetchForeignKeyDetails(poolDetails, dbName, tableName);
      }

      // INDEXES_FULL implies INDEXES_BASIC
      if (flags.includes(SchemaDetailFlag.INDEXES_FULL)) {
        // Pass poolDetails down
        tableResult.indexes = await fetchFullIndexDetails(poolDetails, dbName, tableName);
      } else if (flags.includes(SchemaDetailFlag.INDEXES_BASIC)) {
        // Pass poolDetails down
        tableResult.indexes = await fetchBasicIndexDetails(poolDetails, dbName, tableName);
      }

      results[tableName] = tableResult;

    } catch (error: any) {
        console.error(`[Error] Failed to analyze table ${dbName}.${tableName}:`, error);
        // Add error information specific to this table
        results[tableName] = {
            error: `Failed to analyze table: ${error.message || String(error)}`
        };
        // Decide if we should continue with other tables or re-throw
        // For now, let's continue and report errors per table
    }
  }

  return results;
}

// --- Placeholder functions for fetching details ---
// These will be implemented with actual SQL queries

export async function fetchBasicColumnDetails(
    poolDetails: PoolConnectionDetails, // Added poolDetails
    dbName: string,
    tableName: string
): Promise<any[]> {
  console.log(`[Stub] Fetching basic columns for ${dbName}.${tableName}`);
  // Placeholder SQL using INFORMATION_SCHEMA.COLUMNS
  const sql = `
    SELECT
        COLUMN_NAME AS \`name\`,
        COLUMN_TYPE AS \`type\`
    FROM
        INFORMATION_SCHEMA.COLUMNS
    WHERE
        TABLE_SCHEMA = :dbName AND TABLE_NAME = :tableName
    ORDER BY
        ORDINAL_POSITION;
  `;
  console.error(`[fetchBasicColumnDetails] Executing query for ${dbName}.${tableName}`);
  // Use new executeQuery signature
  const { pool, allowDml, allowDdl } = poolDetails;
  const { rows } = await executeQuery(pool, allowDml, allowDdl, sql, { dbName, tableName }, undefined);
  console.error(`[fetchBasicColumnDetails] Query finished for ${dbName}.${tableName}`);
  return rows;
}

export async function fetchFullColumnDetails(
    poolDetails: PoolConnectionDetails, // Added poolDetails
    dbName: string,
    tableName: string
): Promise<any[]> {
  console.log(`[Stub] Fetching full columns for ${dbName}.${tableName}`);
   // Placeholder SQL using INFORMATION_SCHEMA.COLUMNS - similar to old describe_table
   const sql = `
   SELECT
       COLUMN_NAME AS \`name\`,
       COLUMN_TYPE AS \`type\`,
       IS_NULLABLE AS \`isNullable\`,
       COLUMN_KEY AS \`columnKey\`,
       COLUMN_DEFAULT AS \`columnDefault\`,
       EXTRA AS \`extra\`,
       COLUMN_COMMENT AS \`comment\`,
       CHARACTER_SET_NAME as \`characterSet\`,
       COLLATION_NAME as \`collation\`
   FROM
       INFORMATION_SCHEMA.COLUMNS
   WHERE
       TABLE_SCHEMA = :dbName AND TABLE_NAME = :tableName
   ORDER BY
       ORDINAL_POSITION;
 `;
 // Use new executeQuery signature
 const { pool, allowDml, allowDdl } = poolDetails;
 const { rows } = await executeQuery(pool, allowDml, allowDdl, sql, { dbName, tableName }, undefined);
 return rows;
}

export async function fetchForeignKeyDetails(
    poolDetails: PoolConnectionDetails, // Added poolDetails
    dbName: string,
    tableName: string
): Promise<any[]> {
  console.log(`[Stub] Fetching foreign keys for ${dbName}.${tableName}`);
  // Placeholder SQL using INFORMATION_SCHEMA.KEY_COLUMN_USAGE and REFERENTIAL_CONSTRAINTS
  const sql = `
    SELECT
        kcu.CONSTRAINT_NAME as \`constraintName\`,
        kcu.COLUMN_NAME as \`columnName\`,
        kcu.REFERENCED_TABLE_SCHEMA as \`referencedDatabase\`,
        kcu.REFERENCED_TABLE_NAME as \`referencedTable\`,
        kcu.REFERENCED_COLUMN_NAME as \`referencedColumn\`,
        rc.UPDATE_RULE as \`onUpdate\`,
        rc.DELETE_RULE as \`onDelete\`
    FROM
        information_schema.KEY_COLUMN_USAGE kcu
    JOIN
        information_schema.REFERENTIAL_CONSTRAINTS rc
        ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME AND kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
    WHERE
        kcu.TABLE_SCHEMA = :dbName
        AND kcu.TABLE_NAME = :tableName
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL;
  `;
  // Use new executeQuery signature
  const { pool, allowDml, allowDdl } = poolDetails;
  const { rows } = await executeQuery(pool, allowDml, allowDdl, sql, { dbName, tableName }, undefined);
  return rows;
}

export async function fetchBasicIndexDetails(
    poolDetails: PoolConnectionDetails, // Added poolDetails
    dbName: string,
    tableName: string
): Promise<{ indexName: string; columns: string[] }[]> { // Updated return type
  console.log(`[Stub] Fetching basic indexes (with columns) for ${dbName}.${tableName}`);
  // Query INFORMATION_SCHEMA.STATISTICS to get index and column names
  const sql = `
    SELECT
        INDEX_NAME as \`indexName\`,
        COLUMN_NAME as \`columnName\`,
        SEQ_IN_INDEX as \`seqInIndex\` -- To maintain column order
    FROM
        INFORMATION_SCHEMA.STATISTICS
    WHERE
        TABLE_SCHEMA = :dbName
        AND TABLE_NAME = :tableName
    ORDER BY
        INDEX_NAME,
        SEQ_IN_INDEX;
  `;
  // Use new executeQuery signature
  const { pool, allowDml, allowDdl } = poolDetails;
  const { rows: rawRows } = await executeQuery(pool, allowDml, allowDdl, sql, { dbName, tableName }, undefined);

  // Process rows to group columns by index name
  const indexes: Record<string, string[]> = {};
  for (const row of rawRows) {
    if (!indexes[row.indexName]) {
      indexes[row.indexName] = [];
    }
    indexes[row.indexName].push(row.columnName);
  }

  // Convert the grouped object into the desired array format
  const result = Object.entries(indexes).map(([indexName, columns]) => ({
    indexName: indexName,
    columns: columns,
  }));

  return result;
}

export async function fetchFullIndexDetails(
    poolDetails: PoolConnectionDetails, // Added poolDetails
    dbName: string,
    tableName: string
): Promise<any[]> {
  console.log(`[Stub] Fetching full indexes for ${dbName}.${tableName}`);
  // Placeholder using SHOW INDEX FROM \`table\` - requires db context
  // IMPORTANT: SHOW INDEX doesn't typically support placeholders for table name.
  // Relying on prior validation of tableName.
  const sql = `SHOW INDEX FROM \`${tableName}\``;
  // Pass dbName as the third argument to set the database context for the connection
  // Use new executeQuery signature
  const { pool, allowDml, allowDdl } = poolDetails;
  const { rows } = await executeQuery(pool, allowDml, allowDdl, sql, [], dbName);
  // Transform keys to camelCase
  return rows.map((row: any) => {
    const camelCaseRow: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      // Ensure key is treated as string before passing to toCamelCase
      camelCaseRow[toCamelCase(String(key))] = value;
    }
    return camelCaseRow;
  });
}