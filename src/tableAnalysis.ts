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
  BASIC: [SchemaDetailFlag.COLUMNS_BASIC],
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