/**
 * SQL query validators for MariaDB MCP server
 * Ensures that only allowed queries are executed based on configuration.
 */
import { MariaDBConfig } from "./types.js"; // Import config type if needed (though flags are passed directly)

// Command Categories
const DQL_COMMANDS = [ // Data Query Language (Always Allowed)
  "SELECT",
  "SHOW",
  "DESCRIBE",
  "DESC",
  "EXPLAIN",
];

const DML_COMMANDS = [ // Data Manipulation Language (Conditional)
  "INSERT",
  "UPDATE",
  "DELETE",
  "REPLACE",
  // Consider adding MERGE if applicable/needed
];

const DDL_COMMANDS = [ // Data Definition Language (Conditional)
  "CREATE",
  "ALTER",
  "DROP",
  "TRUNCATE",
  "RENAME",
  // Consider adding other DDL like COMMENT ON if needed
];

// List of always disallowed SQL commands (for security/stability)
const ALWAYS_DISALLOWED_COMMANDS = [
  "GRANT",
  "REVOKE",
  "SET", // Can change session variables, potentially unsafe
  "LOCK", // LOCK TABLES can cause deadlocks
  "UNLOCK", // UNLOCK TABLES
  "CALL", // Stored procedures might do anything
  "EXEC", // Synonyms for potentially unsafe operations
  "EXECUTE",
  "PREPARE", // Prepared statements handled differently
  "DEALLOCATE",
  "START", // Transaction control handled elsewhere if needed
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "SAVEPOINT",
  "USE", // Database context should be passed explicitly to executeQuery
  // Add others as needed, e.g., LOAD DATA INFILE
];

/**
 * Normalizes a SQL query by removing comments and reducing whitespace.
 * @param query SQL query string.
 * @returns Normalized query string in uppercase.
 */
function normalizeQuery(query: string): string {
  return query
    .replace(/--.*$/gm, "") // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // Remove multi-line comments
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim()
    .toUpperCase();
}

/**
 * Validates if a SQL query is allowed based on the configured permissions.
 * @param query SQL query to validate.
 * @param allowDml Whether DML operations are permitted.
 * @param allowDdl Whether DDL operations are permitted.
 * @returns true if the query is allowed, false otherwise.
 */
// Corrected name: isAllowedQuery
export function isAllowedQuery(query: string, allowDml: boolean, allowDdl: boolean): boolean {
  const normalizedQuery = normalizeQuery(query);

  if (!normalizedQuery) {
    console.error("[Validator] Query rejected: Empty query.");
    return false;
  }

  // Basic check for multiple statements (imperfect but catches simple cases)
  // We disallow semicolons unless it's the very last character.
  if (normalizedQuery.includes(";") && !normalizedQuery.endsWith(";")) {
     console.error("[Validator] Query rejected: Multiple statements detected (contains ';').");
     return false;
  }

  // Identify the first command word
  const command = normalizedQuery.split(/[\s;()]+/)[0];
  if (!command) {
     console.error("[Validator] Query rejected: Could not identify command.");
     return false; // Should not happen if normalizedQuery is not empty
  }

  // 1. Check if the command is *always* disallowed
  if (ALWAYS_DISALLOWED_COMMANDS.includes(command)) {
    console.error(`[Validator] Query rejected: Command '${command}' is always disallowed.`);
    return false;
  }

  // 2. Check DQL (always allowed)
  if (DQL_COMMANDS.includes(command)) {
    console.log(`[Validator] Query allowed: DQL command '${command}'.`);
    return true; // Multiple statements already checked
  }

  // 3. Check DML (allowed only if allowDml is true)
  if (DML_COMMANDS.includes(command)) {
    if (allowDml) {
      console.log(`[Validator] Query allowed: DML command '${command}' (DML enabled).`);
      return true; // Multiple statements already checked
    } else {
      console.error(`[Validator] Query rejected: DML command '${command}' requires MARIADB_ALLOW_DML=true.`);
      return false;
    }
  }

  // 4. Check DDL (allowed only if allowDdl is true)
  if (DDL_COMMANDS.includes(command)) {
    if (allowDdl) {
      console.log(`[Validator] Query allowed: DDL command '${command}' (DDL enabled).`);
      return true; // Multiple statements already checked
    } else {
      console.error(`[Validator] Query rejected: DDL command '${command}' requires MARIADB_ALLOW_DDL=true.`);
      return false;
    }
  }

  // 5. If the command is not in any recognized list, deny by default for safety.
  console.warn(`[Validator] Query rejected: Command '${command}' is not recognized or explicitly allowed.`);
  return false;
}

/**
 * Validates if a SQL query is safe and permitted to execute.
 * @param query SQL query to validate.
 * @param allowDml Whether DML operations are permitted.
 * @param allowDdl Whether DDL operations are permitted.
 * @throws Error if the query is not valid or not permitted.
 */
export function validateQuery(query: string, allowDml: boolean, allowDdl: boolean): void {
  console.error(`[Validator] Validating query (DML:${allowDml}, DDL:${allowDdl}): ${query.substring(0, 100)}...`);

  if (!query || typeof query !== "string") {
    throw new Error("Query must be a non-empty string");
  }

  // Pass permissions flags to the check function
  if (!isAllowedQuery(query, allowDml, allowDdl)) {
    // The specific reason is logged within isAllowedQuery
    throw new Error(
      "Query is not permitted. Check server logs for details (check command type, DML/DDL permissions, multiple statements, or disallowed commands)."
    );
  }

  console.error("[Validator] Query validated successfully.");
}
