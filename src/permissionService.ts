/**
 * Service for validating SQL query permissions based on defined rules.
 */

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
  if (!query || typeof query !== 'string') {
    return '';
  }
  return query
    .replace(/--.*$/gm, "") // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // Remove multi-line comments
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim()
    .toUpperCase();
}

/**
 * Checks if a SQL query is allowed based on the configured permissions.
 * Logs the reason for rejection internally.
 * @param query SQL query to validate.
 * @param allowDml Whether DML operations are permitted.
 * @param allowDdl Whether DDL operations are permitted.
 * @returns true if the query is allowed, false otherwise.
 */
export function checkPermissions(query: string, allowDml: boolean, allowDdl: boolean): boolean {
console.log(`[PermissionService DEBUG] checkPermissions called with query: "${query}", allowDml: ${allowDml}, allowDdl: ${allowDdl}`);
  const normalizedQuery = normalizeQuery(query);

  if (!normalizedQuery) {
    console.error("[PermissionService] Query rejected: Empty or invalid query.");
console.log("[PermissionService DEBUG] Returning false due to empty/invalid query.");
    return false;
  }

  // Check for multiple statements more robustly.
  // Trim potential trailing semicolon first.
  const trimmedQuery = normalizedQuery.endsWith(';')
    ? normalizedQuery.slice(0, -1)
    : normalizedQuery;

  // If there's still a semicolon after trimming the potential last one, reject.
  if (trimmedQuery.includes(";")) {
     console.error("[PermissionService] Query rejected: Multiple statements detected (contains ';').");
     return false;
  }

  // Identify the first command word
  const command = normalizedQuery.split(/[\s;()]+/)[0];
  if (!command) {
     console.error("[PermissionService] Query rejected: Could not identify command.");
     return false; // Should not happen if normalizedQuery is not empty
  }

  // 1. Check if the command is *always* disallowed
  if (ALWAYS_DISALLOWED_COMMANDS.includes(command)) {
    console.error(`[PermissionService] Query rejected: Command '${command}' is always disallowed.`);
    return false;
  }

  // 2. Check DQL (always allowed)
  if (DQL_COMMANDS.includes(command)) {
    // Don't log success here, too noisy. Log only rejections.
    // console.log(`[PermissionService] Query allowed: DQL command '${command}'.`);
    return true; // Multiple statements already checked
  }

  // 3. Check DML (allowed only if allowDml is true)
  if (DML_COMMANDS.includes(command)) {
    if (allowDml) {
      // console.log(`[PermissionService] Query allowed: DML command '${command}' (DML enabled).`);
      return true; // Multiple statements already checked
    } else {
      console.error(`[PermissionService] Query rejected: DML command '${command}' requires allowDml=true.`);
      return false;
    }
  }

  // 4. Check DDL (allowed only if allowDdl is true)
  if (DDL_COMMANDS.includes(command)) {
    if (allowDdl) {
      // console.log(`[PermissionService] Query allowed: DDL command '${command}' (DDL enabled).`);
      return true; // Multiple statements already checked
    } else {
      console.error(`[PermissionService] Query rejected: DDL command '${command}' requires allowDdl=true.`);
      return false;
    }
  }

  // 5. If the command is not in any recognized list, deny by default for safety.
  console.warn(`[PermissionService] Query rejected: Command '${command}' is not recognized or explicitly allowed.`);
  return false;
}