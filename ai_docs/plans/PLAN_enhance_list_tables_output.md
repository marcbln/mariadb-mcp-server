# Plan: Enhance `list_tables` Tool Output

**Goal:** Modify the `list_tables` tool in the `mariadb-mcp-server` to provide more detailed information about tables and views, similar to the phpMyAdmin interface, using standardized key names.

**Current Problem:**
- The tool currently uses `SHOW FULL TABLES`.
- Output includes raw, database-specific column names like `Tables_in_<db_name>` and `Table_type`.
- Lacks detailed metadata like Engine, Collation, Size, Row Count, etc.

**Revised Approach:**
1.  **Target File:** `src/index.ts` (specifically the `case "list_tables":` block).
2.  **Query Change:** Replace the `SHOW FULL TABLES` command with a `SELECT` query against the `INFORMATION_SCHEMA.TABLES` system table.
3.  **Query Details:**
    *   Filter by the target database name using `WHERE TABLE_SCHEMA = :databaseName`.
    *   Select the following columns, renaming them using `AS` for clean JSON keys:
        *   `TABLE_NAME AS name`
        *   `TABLE_TYPE AS type` (e.g., 'BASE TABLE', 'VIEW')
        *   `ENGINE AS engine`
        *   `TABLE_COLLATION AS collation`
        *   `DATA_LENGTH AS dataLength` (Size of data in bytes)
        *   `INDEX_LENGTH AS indexLength` (Size of indexes in bytes)
        *   `DATA_FREE AS dataFree` (Allocated but unused bytes)
        *   `AUTO_INCREMENT AS autoIncrement` (Next auto-increment value)
        *   `TABLE_ROWS AS rows` (Estimated number of rows)
        *   `TABLE_COMMENT AS comment`
    *   Order the results by `TABLE_NAME`.
4.  **Data Handling:** The `executeQuery` function will return rows with the specified aliases (`name`, `type`, `engine`, etc.). This array of objects can be directly stringified and returned as the tool's output.

**Example SQL Query:**

```sql
SELECT
    TABLE_NAME AS `name`,
    TABLE_TYPE AS `type`,
    ENGINE AS `engine`,
    TABLE_COLLATION AS `collation`,
    DATA_LENGTH AS `dataLength`,
    INDEX_LENGTH AS `indexLength`,
    DATA_FREE AS `dataFree`,
    AUTO_INCREMENT AS `autoIncrement`,
    TABLE_ROWS AS `rows`,
    TABLE_COMMENT AS `comment`
FROM
    INFORMATION_SCHEMA.TABLES
WHERE
    TABLE_SCHEMA = :databaseName -- Parameter for the database name
ORDER BY
    TABLE_NAME;
```

**Expected Output Format (JSON):**

```json
[
  {
    "name": "alternates",
    "type": "BASE TABLE",
    "engine": "InnoDB",
    "collation": "utf8_unicode_ci",
    "dataLength": 14172160,
    "indexLength": 12615680,
    "dataFree": 7340032,
    "autoIncrement": null,
    "rows": 287782,
    "comment": ""
  },
  {
    "name": "attributes",
    "type": "BASE TABLE",
    "engine": "InnoDB",
    // ... other fields
  }
  // ... more tables
]
```

**Next Step:** Switch to Code mode to implement these changes in `src/index.ts`.