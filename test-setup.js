#!/usr/bin/env node

/**
 * Test setup script for MariaDB / MariaDB MCP server
 *
 * This script:
 * 1. Creates a test database and table
 * 2. Inserts sample data
 * 3. Tests each MCP tool against the database
 *
 * Usage:
 *   node test-setup.js
 *
 * Environment variables:
 *   MARIADB_HOST - host (default: localhost)
 *   MARIADB_PORT - port (default: 3306)
 *   MARIADB_USER - username
 *   MARIADB_PASSWORD - password
 *   MARIADB_ALLOW_INSERT - false
 *   MARIADB_ALLOW_UPDATE - false
 *   MARIADB_ALLOW_DELETE - false
 */

import mariadb from 'mariadb';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();
const TEST_DB = 't2';
const TEST_TABLE = 'test_users';

// Configuration from environment variables
const config = {
    host:        process.env.MARIADB_HOST || 'localhost',
    port:        parseInt(process.env.MARIADB_PORT || '10136', 10),
    user:        process.env.MARIADB_USER || 'root',
    password:    process.env.MARIADB_PASSWORD || '11111',
    database:    TEST_DB,
    allowInsert: process.env.MARIADB_ALLOW_INSERT !== 'false',
    allowUpdate: process.env.MARIADB_ALLOW_UPDATE !== 'false',
    allowDelete: process.env.MARIADB_ALLOW_DELETE !== 'false',
};


// Check required environment variables
if (!config.user || !config.password) {
    console.error('Error: MARIADB_USER and MARIADB_PASSWORD environment variables are required');
    console.error('Example usage:');
    console.error('  MARIADB_USER=root MARIADB_PASSWORD=password node test-setup.js');
    process.exit(1);
}

// Create a connection pool
const pool = mariadb.createPool({
    ...config,
    connectionLimit: 10
});

/**
 * Main function
 */
async function main() {
    console.log('MariaDB MCP Server Test Setup');
    console.log('===========================');
    console.log(`Host: ${config.host}:${config.port}`);
    console.log(`User: ${config.user}`);
    console.log(`Database: ${config.database || 'N/A'}`);
    console.log(`Allow Insert: ${config.allowInsert}`);
    console.log(`Allow Update: ${config.allowUpdate}`);
    console.log(`Allow Delete: ${config.allowDelete}`);
    console.log();

    try {
        // Test connection
        console.log('Testing connection...');
        await testConnection();
        console.log('✅ Connection successful');
        console.log();

        // Create test database
        console.log(`Creating test database '${TEST_DB}'...`);
        // Database creation removed since we're using existing 't2' database
        console.log(`✅ Using existing database '${TEST_DB}'`);
        console.log();

        // Create test table
        console.log(`Creating test table '${TEST_TABLE}' (using prefix)...`);
        await createTestTable();
        console.log(`✅ Table '${TEST_TABLE}' created`);
        console.log();

        // Insert sample data
        console.log('Inserting sample data...');
        await insertSampleData();
        console.log('✅ Sample data inserted');
        console.log();

        // Test queries
        console.log('Testing queries...');
        await testQueries();
        console.log('✅ All queries executed successfully');
        console.log();

        console.log('Test setup completed successfully!');
        console.log();
        console.log('You can now use the following MCP tools:');
        console.log('1. list_databases - Should show the test database');
        console.log('2. list_tables - With database="mcp_test_db"');
        console.log(`3. describe_table - With database="${TEST_DB}", table="${TEST_TABLE}"`);
        console.log(`4. execute_query - With database="${TEST_DB}", query="SELECT * FROM ${TEST_TABLE}"`);
        console.log();
        console.log('MCP Settings Configuration:');
        console.log(JSON.stringify({
            mcpServers: {
                mariadb: {
                    command:     'node',
                    args:        ['/path/to/mariadb-mcp-server/dist/index.js'],
                    env:         {
                        MARIADB_HOST:         config.host,
                        MARIADB_PORT:         String(config.port),
                        MARIADB_USER:         config.user,
                        MARIADB_PASSWORD:     config.password,
                        MARIADB_DATABASE:     TEST_DB,
                        MARIADB_ALLOW_INSERT: String(config.allowInsert),
                        MARIADB_ALLOW_UPDATE: String(config.allowUpdate),
                        MARIADB_ALLOW_DELETE: String(config.allowDelete),
                    },
                    disabled:    false,
                    autoApprove: [],
                },
            },
        }, null, 2));
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        // Close the connection pool
        await pool.end();
    }
}

/**
 * Test the database connection
 */
async function testConnection() {
    const connection = await pool.getConnection();
    connection.release();
}

/**
 * Create the test database
 */
async function createTestDatabase() {
    // Database creation removed since we're using existing 't2' database
    await pool.query(`USE ${TEST_DB}`);
}

/**
 * Create the test table
 */
async function createTestTable() {
    await pool.query(`USE ${TEST_DB}`);
    // Drop tables if they exist (in order to handle FK constraints)
    await pool.query(`DROP TABLE IF EXISTS test_orders`);
    await pool.query(`DROP TABLE IF EXISTS ${TEST_TABLE}`);

    // Add a small delay to ensure tables are dropped
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create users table with an index
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ${TEST_TABLE}
        (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            name       VARCHAR(100) NOT NULL COMMENT 'User full name',
            email      VARCHAR(100) NOT NULL COMMENT 'User email address',
            age        INT COMMENT 'User age',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY \`idx_email\` (email) COMMENT 'Ensure email is unique'
        ) COMMENT ='Stores test user information';
    `);
    console.log(`   - Table '${TEST_TABLE}' created with index.`);

    // Create orders table with a foreign key
    await pool.query(`
        CREATE TABLE IF NOT EXISTS test_orders
        (
            order_id     INT AUTO_INCREMENT PRIMARY KEY,
            user_id      INT,
            product_name VARCHAR(100),
            order_date   DATE,
            CONSTRAINT fk_user_order FOREIGN KEY (user_id) REFERENCES ${TEST_TABLE} (id) ON DELETE SET NULL
        ) COMMENT ='Stores test user orders';
    `);
    console.log(`   - Table 'test_orders' created with foreign key.`); // Also update related table name for clarity
}

/**
 * Insert sample data
 */
async function insertSampleData() {
    await pool.query(`USE ${TEST_DB}`);

    const users = [
        {name: 'Roberto', email: 'roberto@example.com', age: 53},
        {name: 'Alerinda', email: 'almerinda@example.com', age: 43},
        {name: 'Laisa', email: 'laisa@example.com', age: 22},
        {name: 'Luiza', email: 'luiza@example.com', age: 20},
        {name: 'Roanna', email: 'roanna@example.com', age: 31},
    ];

    for (const user of users) {
        await pool.query(
            `INSERT INTO ${TEST_TABLE} (name, email, age)
             VALUES (?, ?, ?)`,
            [user.name, user.email, user.age]
        );
    }
}

/**
 * Test various queries
 */
async function testQueries() {
    await pool.query(`USE ${TEST_DB}`);

    // Test SELECT
    const [rows] = await pool.query(`SELECT *
                                     FROM ${TEST_TABLE}`);
    console.log(`  - SELECT: Found ${Array.isArray(rows) ? rows.length : 'non-array'} rows`);

    // Test SHOW TABLES
    const [tables] = await pool.query('SHOW TABLES');
    console.log(`  - SHOW TABLES: Found ${Array.isArray(tables) ? tables.length : 'non-array'} tables`);

    // Test DESCRIBE
    const [columns] = await pool.query(`DESCRIBE ${TEST_TABLE}`);
    console.log(`  - DESCRIBE: Found ${Array.isArray(columns) ? columns.length : 'non-array'} columns`);
}

// Run the main function
main().catch(console.error);
