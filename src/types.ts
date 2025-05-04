/**
 * Type definitions for MariaDB MCP server
 */

// MariaDB connection configuration
// MariaDB connection configuration
export interface MariaDBConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database?: string;
  allow_dml: boolean; // Data Manipulation Language (INSERT, UPDATE, DELETE, REPLACE)
  allow_ddl: boolean; // Data Definition Language (CREATE, ALTER, DROP, TRUNCATE, RENAME)
}

// Database information
export interface DatabaseInfo {
  name: string;
}

// Table information
export interface TableInfo {
  name: string;
  type: string;
}

// Column information
export interface ColumnInfo {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
}

// Query result
export interface QueryResult {
  rows: any[];
  fields: any[];
}
