# Checklist: Extract Permission Logic

- [x] **Phase 1: Create `permissionService.ts` and Migrate Logic**
    - [x] Step 1.1: Create `src/permissionService.ts`
    - [x] Step 1.2: Delete `src/validators.ts`
- [x] **Phase 2: Update Caller (`connection.ts` & `index.ts`)**
    - [x] Step 2.1: Modify `src/connection.ts` Imports
    - [x] Step 2.2: Modify `src/connection.ts` `executeQuery` Function
    - [x] Step 2.3: Modify `src/index.ts` (Remove import and call to `validateQuery`)
- [x] **Phase 3: Create Unit Tests for `permissionService.ts`**
    - [x] Step 3.1: Create `test/permissionService.test.ts`
- [x] **Phase 4: Refactor Integration Tests (`connection.test.ts`)**
    - [x] Step 4.1: Modify `test/connection.test.ts` (Simplify rejection tests, add scope comment)
- [x] **Phase 5: Build and Verify**
    - [x] Step 5.1: Build the Project (`npm run build`) - Succeeded
    - [x] Step 5.2: Run Tests (`npm test`) - Succeeded (after fixes)