# Checklist: Simplify Permissions Refactor

Based on: `ai_docs/plans/PLAN__simplify-perms.md`

## Phase 1: Update core logic (type config validation)
- [x] Step 1.1: Modify `MariaDBConfig` type (`src/types.ts`)
- [x] Step 1.2: Update config loading (`src/connection.ts`)
- [x] Step 1.3: Refactor query validation logic (`src/validator.ts`)

## Phase 2: Integrate validation into MCP handler
- [x] Step 2.1: Modify `execute_query` tool def (`src/index.ts`)
- [x] Step 2.2: Modify `execute_query` tool handler (`src/index.ts`)

## Phase 3: Update config examples and docs
- [x] Step 3.1: Update `.env.example`
- [x] Step 3.2: Update `mcp-settings-example.json`
- [x] Step 3.3: Update `.roo/mcp.json` (if applicable)
- [x] Step 3.4: Update `README.md`

## Phase 4: Update testing
- [x] Step 4.1: Update `test-setup.js`
- [ ] Step 4.2: Update `test/dbService.test.ts`
- [ ] Step 4.3: Enhance `test-tools.js`

## Phase 5: Build and verify
- [ ] Step 5.1: Build project (`npm run build`)
- [ ] Step 5.2: Run setup script (`npm run test:setup`)
- [ ] Step 5.3: Run tool test (`test-tools.js` with env var)
- [ ] Step 5.4: Run DB service test (`npm run test:db`)