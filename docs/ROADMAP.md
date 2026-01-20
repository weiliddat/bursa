# Bursa Roadmap

> Last Updated: 2026-01-19

## Milestone 1: Parser & Validation

Build a fused single-pass parser that reads `.bursa` files and produces a `Ledger` data structure with diagnostics.

### Phase 1.1: Core Parser Infrastructure

- [x] Set up parser module structure (`src/parser/`)
- [x] Implement cursor helpers (peek, advance, position tracking)
- [x] Implement section marker parsing (`>>> META`, etc.)
- [x] Add diagnostic collection (errors, warnings with spans)

### Phase 1.2: Section Parsing

- [x] META section: `commodity:`, `untracked:`
- [x] BUDGET section: period headers, category + amount
- [x] LEDGER section: account blocks, transactions, assertions

### Phase 1.3: Transaction & Target Parsing

- [x] Amount parsing (sign, symbol/commodity, number variations)
- [x] Entity refs: `@Account`, `&Category`, `#Tag` (with hierarchy)
- [x] Target variants: category, account, account+category, swap
- [x] Unverified marker (`?`) and comments (`;`)

### Phase 1.4: Semantic Validation

- [x] Commodity validation (unknown commodity references)
- [x] Trunk entity validation (accounts/categories with children)
- [x] Untracked account validation (missing category on transfer)
- [x] Assertion validation (balance checks)
- [x] Chronological date validation (per account block)
- [x] Unbudgeted category validation
- [x] Remove orphan code: `expect()` in parser.ts, `validateBudget()` stub

### Phase 1.5: Diagnostics Coverage

Per SPEC.md §5, track implementation and test status for each diagnostic:

**Syntax Errors:**
- [x] `InvalidSectionError` — implemented & tested
- [x] `InvalidDirectiveError` — implemented & tested
- [x] `InvalidEntryError` — implemented & tested

**Validation Errors:**
- [x] `UnknownEntityError` — implemented & tested (commodity only)
- [x] `TrunkEntityError` — implemented & tested
- [x] `MissingCategoryError` — implemented & tested

**Warnings:**
- [x] `UnverifiedEntryWarning` — implemented & tested
- [x] `AssertionFailedWarning` — implemented & tested
- [x] `NonChronologicalWarning` — implemented & tested
- [x] `UnbudgetedCategoryWarning` — implemented & tested

### Phase 1.6 Cleanup

- [x] Move syntax tests to parser.test.ts
- [x] Cover syntax edge cases
- [x] Commodity aliases
- [x] Cache sorted symbols for `matchSymbol()` in `p.data.meta.symbols`
- [x] Combine commodity and alias directives, can define $ = USD, RM = MYR in one go

### Phase 1.7 Performance Optimizations

- [x] Replace `result += advance(p)` loops with slice-based extraction
- [x] Streamline trunk entity and ancestor validation
- [x] Precompute untracked accounts during parsing for O(1) validation lookup

### Phase 1.8 Correctness & Consistency

**Correctness Bugs:**
- [x] Redesigned income model — `&Unassigned` as reserved income pool (v0.7.0)
- [x] Fix assertion sign handling — apply `amount.sign` when comparing balances

**Spec/Implementation Gaps:**
- [x] Enforce trunk category validation in LEDGER (register category refs during ledger parsing)
- [x] Clarify category existence semantics — unknown category is warning (UnbudgetedCategoryWarning)
- [x] Swap target sign — made optional in spec (v0.6.0)

**Documentation:**
- [x] Bump SPEC.md version (now v0.7.0)
- [x] Update ARCHITECTURE.md to document full `Ledger.meta` shape

**Test Coverage:**
- [x] Add tests for assertions with negative values
- [x] Add tests for trunk category misuse in LEDGER
- [x] Add tests for Windows `\r\n` newline handling
- [x] Transfer inflow to untracked without category (should pass)
  - Input: `+100 USD @Brokerage` where `@Brokerage` is untracked
  - Fixed: only outflows require category
- [x] Trunk account used as transfer target → TrunkEntityError
  - Input: `-100 USD @Bank` where `@Bank:Savings` exists
  - Fixed: now emits `TrunkEntityError` instead of `UnknownEntityError`
- [x] Multiple tags parsing
  - Input: `2026-01-01 -50 USD &Food #groceries #weekly #bulk`
  - Tested in `parser.test.ts`
  - Expected: `tags` array contains all three refs
- [x] Symbol overlap/longest-match
  - Input: aliases `R = MYR` and `RM = MYR`, then `-RM50 &Food`
  - Current: tested, matches `RM` (longer)
  - Expected: matches `RM` (longer), not `R`
- [ ] Duplicate alias definitions
  - Input: `commodity: $ = USD` then `commodity: $ = EUR`
  - Current: silently overwrites
  - Expected: document behavior or warn

---

## Future Milestones

_To be planned after Milestone 1 is complete._
