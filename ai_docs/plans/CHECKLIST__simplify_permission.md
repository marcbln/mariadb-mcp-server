# Checklist: Simplify Permissions Refactor

Based on: `ai_docs/plans/PLAN__simplify-perms.md`

## Phase 1: Update core logic (type config validation)
- [ ] Step 1.1: Modify `MariaDBConfig` type (`src/types.ts`)
- [ ] Step 1.2: Update config loading (`src/connection.ts`)
- [ ] Step 1.3: Refactor query validation logic (`src/validator.ts`)

## Phase 2: Integrate validation into MCP handler
- [ ] Step 2.1: Modify `execute_query` tool def (`src/index.ts`)
- [ ] Step 2.2: Modify `execute_query` tool handler (`src/index.ts`)

## Phase 3: Update config examples and docs
- [ ] Step 3.1: Update `.env.example`
- [ ] Step 3.2: Update `mcp-settings-example.json`
- [ ] Step 3.3: Update `.roo/mcp.json` (if applicable)
- [ ] Step 3.4: Update `README.md`

## Phase 4: Update testing
- [ ] Step 4.1: Update `test-setup.js`
- [ ] Step 4.2: Update `test/dbService.test.ts`
- [ ] Step 4.3: Enhance `test-tools.js`

## Phase 5: Build and verify
- [ ] Step 5.1: Build project (`npm run build`)
- [ ] Step 5.2: Run setup script (`npm run test:setup`)
- [ ] Step 5.3: Run tool test (`test-tools.js` with env var)
- [ ] Step 5.4: Run DB service test (`npm run test:db`)