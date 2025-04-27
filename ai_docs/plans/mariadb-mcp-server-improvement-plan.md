# MariaDB MCP Server Improvement Plan

## 1. Current Issues and Limitations

Based on the code review, I've identified several areas for improvement:

1. **Connection Management**: The server creates a new connection pool but reuses a single connection, which can lead to potential issues with connection timeouts and resource management.

2. **Error Handling**: Error reporting could be more specific and helpful for debugging purposes.

3. **Security Vulnerabilities**: The validation logic has potential SQL injection vulnerabilities.

4. **Missing Features**: Several planned features are incomplete (based on TODOs in environment variables).

5. **Response Format**: Currently only returning JSON, which may not be optimal for all AI assistant interactions.

6. **Configuration**: Environment variable parsing is scattered and inconsistent.

7. **Query Result Handling**: Limited processing of different data types and large result sets.

## 2. Improvement Roadmap

### Phase 1: Core Stability and Security Improvements

#### 1.1 Connection Management
- Replace the global connection variable with proper connection handling from the pool
- Implement connection timeout handling and automatic reconnection
- Add connection health checks

#### 1.2 SQL Injection Protection
- Implement parameterized queries throughout
- Improve query validation with proper SQL parsing
- Add escaping for table and database names

#### 1.3 Error Handling
- Create standardized error types and response formats
- Add detailed logging with different severity levels
- Implement proper error propagation to the client

### Phase 2: Feature Completion

#### 2.1 Permission System
- Implement all planned permission flags (SELECT, CREATE, DROP, etc.)
- Add table/schema-level permissions
- Create a permission reporting tool

#### 2.2 Response Format Options
- Add support for different output formats (JSON, CSV, text table)
- Implement format selection via parameters
- Create helper functions for formatting responses

#### 2.3 Query Management
- Add query timeout configuration
- Implement query cancellation
- Add query logging and history

### Phase 3: Advanced Features

#### 3.1 Transaction Support
- Add BEGIN, COMMIT, and ROLLBACK support
- Implement session-based transaction tracking
- Add transaction timeout protection

#### 3.2 Schema Tools
- Add comprehensive schema information tools
- Implement index analysis features
- Create database structure comparison tools

#### 3.3 Performance Optimization
- Add query execution statistics
- Implement result caching for repeated queries
- Add connection pooling optimization

## 3. Implementation Details

### 3.1 Connection Management Improvements

```typescript
// Replace the global connection with proper pool management
export async function executeQuery(
  sql: string,
  params: any[] = [],
  database?: string
): Promise<{ rows: any; fields: mariadb.FieldInfo[] }> {
  console.error(`[Query] Executing: ${sql}`);
  
  // Create connection pool if not already created
  if (!pool) {
    console.error("[Setup] Connection pool not found, creating a new one");
    pool = createConnectionPool();
  }
  
  let connection: mariadb.PoolConnection | null = null;
  
  try {
    // Get fresh connection from pool for each query
    connection = await pool.getConnection();
    
    // Use specific database if provided
    if (database) {
      console.error(`[Query] Using database: ${database}`);
      await connection.query(`USE \`${database}\``);
    }
    
    // Execute validated query
    if (!isAllowedQuery(sql)) {
      throw new Error("Query not allowed");
    }
    
    // Use parameterized query
    const [rows, fields] = await connection.query({
      metaAsArray: true,
      namedPlaceholders: true,
      sql,
      values: params,
      timeout: getQueryTimeout(),
    });
    
    // Process results (implementation continues...)
  } finally {
    // Always release the connection back to the pool
    if (connection) {
      connection.release();
    }
  }
}
```

### 3.2 SQL Injection Protection

```typescript
// Improved table description with proper escaping
async function describeTable(database: string | undefined, table: string) {
  // Validate table name to prevent SQL injection
  if (!/^[a-zA-Z0-9_]+$/.test(table)) {
    throw new Error("Invalid table name");
  }
  
  const connection = await pool.getConnection();
  try {
    if (database) {
      // Validate database name
      if (!/^[a-zA-Z0-9_]+$/.test(database)) {
        throw new Error("Invalid database name");
      }
      await connection.query(`USE \`${database}\``);
    }
    
    // Use parameterized query where possible
    const { rows } = await connection.query(`DESCRIBE \`${table}\``);
    return rows;
  } finally {
    connection.release();
  }
}
```

### 3.3 Multi-Format Response Support

```typescript
// Add format options to query execution
export async function executeQuery(
  sql: string,
  params: any[] = [],
  options: {
    database?: string;
    format?: 'json' | 'csv' | 'table';
    maxRows?: number;
  } = {}
): Promise<{ data: any; format: string }> {
  // Query execution logic...
  
  // Format the results based on preference
  const format = options.format || 'json';
  const maxRows = options.maxRows || getRowLimit();
  
  // Apply row limit
  const limitedRows = Array.isArray(rows) && rows.length > maxRows
    ? rows.slice(0, maxRows)
    : rows;
  
  // Format the data according to the requested format
  switch (format) {
    case 'json':
      return { data: limitedRows, format: 'json' };
    
    case 'csv':
      return { data: convertToCsv(limitedRows, fields), format: 'csv' };
    
    case 'table':
      return { data: formatAsTextTable(limitedRows, fields), format: 'table' };
    
    default:
      return { data: limitedRows, format: 'json' };
  }
}

// CSV conversion helper
function convertToCsv(rows: any[], fields: mariadb.FieldInfo[]): string {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  
  // Generate header row
  const headers = fields.map(field => field.name);
  const headerRow = headers.join(',');
  
  // Generate data rows
  const dataRows = rows.map(row => {
    return headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
      return String(value);
    }).join(',');
  });
  
  return [headerRow, ...dataRows].join('\n');
}

// Text table formatting helper
function formatAsTextTable(rows: any[], fields: mariadb.FieldInfo[]): string {
  if (!Array.isArray(rows) || rows.length === 0) return 'Empty result set';
  
  // Implementation of text table formatting
  // ...
}
```

### 3.4 Enhanced Permission System

```typescript
// Comprehensive permission configuration
export interface MariaDBPermissions {
  allowSelect: boolean;
  allowInsert: boolean;
  allowUpdate: boolean;
  allowDelete: boolean;
  allowCreate: boolean;
  allowDrop: boolean;
  allowAlter: boolean;
  allowTruncate: boolean;
  allowTransaction: boolean;
  allowedDatabases: string[] | null; // null means all databases
  allowedTables: string[] | null; // null means all tables
}

// Get permissions from environment
export function getPermissionsFromEnv(): MariaDBPermissions {
  return {
    allowSelect: process.env.MARIADB_ALLOW_SELECT !== 'false', // Default to true
    allowInsert: process.env.MARIADB_ALLOW_INSERT === 'true',
    allowUpdate: process.env.MARIADB_ALLOW_UPDATE === 'true',
    allowDelete: process.env.MARIADB_ALLOW_DELETE === 'true',
    allowCreate: process.env.MARIADB_ALLOW_CREATE === 'true',
    allowDrop: process.env.MARIADB_ALLOW_DROP === 'true',
    allowAlter: process.env.MARIADB_ALLOW_ALTER === 'true',
    allowTruncate: process.env.MARIADB_ALLOW_TRUNCATE === 'true',
    allowTransaction: process.env.MARIADB_ALLOW_TRANSACTION === 'true',
    allowedDatabases: process.env.MARIADB_ALLOWED_DATABASES 
      ? process.env.MARIADB_ALLOWED_DATABASES.split(',') 
      : null,
    allowedTables: process.env.MARIADB_ALLOWED_TABLES
      ? process.env.MARIADB_ALLOWED_TABLES.split(',')
      : null,
  };
}

// Add a new tool for permissions reporting
{
  name: "get_permissions",
  description: "Get the current database access permissions",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
}

// Handler for the permissions tool
case "get_permissions": {
  console.error("[Tool] Executing get_permissions");
  const permissions = getPermissionsFromEnv();
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(permissions, null, 2),
      },
    ],
  };
}
```

### 3.5 Transaction Support

```typescript
// Add transaction support
{
  name: "begin_transaction",
  description: "Begin a new transaction",
  inputSchema: {
    type: "object",
    properties: {
      database: {
        type: "string",
        description: "Database name (optional, uses default if not specified)",
      },
    },
    required: [],
  },
},
{
  name: "commit_transaction",
  description: "Commit the current transaction",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
},
{
  name: "rollback_transaction",
  description: "Rollback the current transaction",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
}

// Transaction management state
let transactionActive = false;
let transactionConnection: mariadb.PoolConnection | null = null;

// Begin transaction handler
case "begin_transaction": {
  console.error("[Tool] Beginning transaction");
  
  if (transactionActive) {
    throw new Error("Transaction already in progress");
  }
  
  const database = request.params.arguments?.database as string | undefined;
  
  if (!permissions.allowTransaction) {
    throw new Error("Transactions are not permitted");
  }
  
  try {
    transactionConnection = await pool.getConnection();
    
    if (database) {
      await transactionConnection.query(`USE \`${database}\``);
    }
    
    await transactionConnection.beginTransaction();
    transactionActive = true;
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ message: "Transaction started" }),
        },
      ],
    };
  } catch (error) {
    if (transactionConnection) {
      transactionConnection.release();
      transactionConnection = null;
    }
    throw error;
  }
}
```

## 4. Testing Strategy

1. **Unit Tests**: Create unit tests for all validator functions and utility functions
2. **Integration Tests**: Test database connectivity and operations
3. **Security Tests**: Validate SQL injection protection
4. **Performance Tests**: Test behavior with large result sets and concurrent connections

## 5. Timeline and Priority

1. **High Priority (Immediate)**
   - Connection management improvements
   - SQL injection protection
   - Error handling enhancements

2. **Medium Priority (Next)**
   - Response format options
   - Complete permission system
   - Transaction support

3. **Lower Priority (Later)**
   - Advanced schema tools
   - Performance optimization
   - Additional data format support

## 6. Documentation Improvements

1. Create comprehensive API documentation for each tool
2. Document all environment variables and configuration options
3. Add examples for common use cases
4. Create troubleshooting guide
