import { executeQuery, getConfigFromEnv } from "./connection.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

/**
 * Enum defining the granular details that can be fetched for table schema analysis.
 */
export enum SchemaDetailFlag {
  COLUMNS_BASIC = "COLUMNS_BASIC", // Column Name, Type
  COLUMNS_FULL = "COLUMNS_FULL",   // All column attributes
  FOREIGN_KEYS = "FOREIGN_KEYS", // FK constraints + rules
  INDEXES_BASIC = "INDEXES_BASIC", // Index names only
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
export async function analyzeTables( // Renamed from analyzeDatabaseTables
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

    console.error(`[Analyze] Analyzing table: ${dbName}.${tableName} with flags: ${flags.join(', ')}`);
    const tableResult: any = {};

    try {
      // --- Fetch data based on flags ---

      // COLUMNS_FULL implies COLUMNS_BASIC, so check full first
      if (flags.includes(SchemaDetailFlag.COLUMNS_FULL)) {
        // TODO: Implement SQL query for full column details
        tableResult.columns = await fetchFullColumnDetails(dbName, tableName);
      } else if (flags.includes(SchemaDetailFlag.COLUMNS_BASIC)) {
        // TODO: Implement SQL query for basic column details
        console.error(`[Analyze] Calling fetchBasicColumnDetails for ${dbName}.${tableName}`);
        tableResult.columns = await fetchBasicColumnDetails(dbName, tableName);
        console.error(`[Analyze] Returned from fetchBasicColumnDetails for ${dbName}.${tableName}`);
      }

      if (flags.includes(SchemaDetailFlag.FOREIGN_KEYS)) {
        // TODO: Implement SQL query for foreign key details
        tableResult.foreign_keys = await fetchForeignKeyDetails(dbName, tableName);
      }

      // INDEXES_FULL implies INDEXES_BASIC
      if (flags.includes(SchemaDetailFlag.INDEXES_FULL)) {
        // TODO: Implement SQL query/command for full index details
        tableResult.indexes = await fetchFullIndexDetails(dbName, tableName);
      } else if (flags.includes(SchemaDetailFlag.INDEXES_BASIC)) {
        // TODO: Implement SQL query/command for basic index details
        tableResult.indexes = await fetchBasicIndexDetails(dbName, tableName);
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

export async function fetchBasicColumnDetails(dbName: string, tableName: string): Promise<any[]> {
  console.log(`[Stub] Fetching basic columns for ${dbName}.${tableName}`);
  // Placeholder SQL using INFORMATION_SCHEMA.COLUMNS
  const sql = `
    SELECT
        COLUMN_NAME AS name,
        COLUMN_TYPE AS type
    FROM
        INFORMATION_SCHEMA.COLUMNS
    WHERE
        TABLE_SCHEMA = :dbName AND TABLE_NAME = :tableName
    ORDER BY
        ORDINAL_POSITION;
  `;
  console.error(`[fetchBasicColumnDetails] Executing query for ${dbName}.${tableName}`);
  const { rows } = await executeQuery(sql, { dbName, tableName }, undefined);
  console.error(`[fetchBasicColumnDetails] Query finished for ${dbName}.${tableName}`);
  return rows;
}

export async function fetchFullColumnDetails(dbName: string, tableName: string): Promise<any[]> {
  console.log(`[Stub] Fetching full columns for ${dbName}.${tableName}`);
   // Placeholder SQL using INFORMATION_SCHEMA.COLUMNS - similar to old describe_table
   const sql = `
   SELECT
       COLUMN_NAME AS name,
       COLUMN_TYPE AS type,
       IS_NULLABLE AS is_nullable,
       COLUMN_KEY AS \`key\`,
       COLUMN_DEFAULT AS \`default\`,
       EXTRA AS extra,
       COLUMN_COMMENT AS comment,
       CHARACTER_SET_NAME as character_set,
       COLLATION_NAME as collation
   FROM
       INFORMATION_SCHEMA.COLUMNS
   WHERE
       TABLE_SCHEMA = :dbName AND TABLE_NAME = :tableName
   ORDER BY
       ORDINAL_POSITION;
 `;
 const { rows } = await executeQuery(sql, { dbName, tableName }, undefined);
 return rows;
}

export async function fetchForeignKeyDetails(dbName: string, tableName: string): Promise<any[]> {
  console.log(`[Stub] Fetching foreign keys for ${dbName}.${tableName}`);
  // Placeholder SQL using INFORMATION_SCHEMA.KEY_COLUMN_USAGE and REFERENTIAL_CONSTRAINTS
  const sql = `
    SELECT
        kcu.CONSTRAINT_NAME as constraint_name,
        kcu.COLUMN_NAME as column_name,
        kcu.REFERENCED_TABLE_SCHEMA as referenced_database,
        kcu.REFERENCED_TABLE_NAME as referenced_table,
        kcu.REFERENCED_COLUMN_NAME as referenced_column,
        rc.UPDATE_RULE as on_update,
        rc.DELETE_RULE as on_delete
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
  const { rows } = await executeQuery(sql, { dbName, tableName }, undefined);
  return rows;
}

export async function fetchBasicIndexDetails(dbName: string, tableName: string): Promise<any[]> {
  console.log(`[Stub] Fetching basic indexes for ${dbName}.${tableName}`);
  // Placeholder using SHOW INDEX - needs careful handling as it doesn't use placeholders well
  // Alternative: Query INFORMATION_SCHEMA.STATISTICS and group by index name
   const sql = `
   SELECT DISTINCT
       INDEX_NAME as index_name
   FROM
       INFORMATION_SCHEMA.STATISTICS
   WHERE
       TABLE_SCHEMA = :dbName
       AND TABLE_NAME = :tableName;
 `;
 const { rows } = await executeQuery(sql, { dbName, tableName }, undefined);
 return rows;
}

export async function fetchFullIndexDetails(dbName: string, tableName: string): Promise<any[]> {
  console.log(`[Stub] Fetching full indexes for ${dbName}.${tableName}`);
  // Placeholder using SHOW INDEX FROM \`table\` - requires db context
  // IMPORTANT: SHOW INDEX doesn't typically support placeholders for table name.
  // Relying on prior validation of tableName.
  const sql = `SHOW INDEX FROM \`${tableName}\``;
  // Pass dbName as the third argument to set the database context for the connection
  const { rows } = await executeQuery(sql, [], dbName);
  return rows;
}