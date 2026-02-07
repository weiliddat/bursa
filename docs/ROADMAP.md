# Bursa Roadmap

> Last Updated: 2026-02-06

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
- [x] Trunk account used as transfer target → TrunkEntityError
- [x] Multiple tags parsing
- [x] Symbol overlap/longest-match
- [x] Duplicate symbol definitions
- [x] Swap targets use declared symbols (remove hardcoded currency list)

## Milestone 2: YNAB Converter

Convert YNAB CSV exports (`plan.csv`, `register.csv`) to `.bursa` format via direct text generation.

### Phase 2.1: CSV Parser

- [x] Simple CSV parser (handles quoted strings and bare numbers)
- [x] Header validation for expected columns — validates exact header match, fails with clear error on mismatch
- [x] Typed row accessors for plan and register schemas

### Phase 2.2: Data Extraction

- [x] Parse `plan.csv`: extract period, category hierarchy, assigned amounts
- [x] Parse `register.csv`: extract accounts, dates, amounts, categories, payees, memos
- [x] Deduplicate transfer pairs (YNAB exports both sides)
- [x] Map `Cleared: "Uncleared"` → unverified marker

### Phase 2.3: Bursa Generation

- [x] Generate META section (commodity from user input, derive untracked accounts)
- [x] Generate BUDGET section from plan data
- [x] Generate LEDGER section grouped by account, sorted by date
- [x] Handle target types: category, transfer, transfer+category
- [x] Preserve memos as comments
- [x] Tag payees as `#payee:[name]`

### Phase 2.4: Script & Integration

- [x] Standalone script runnable via node/deno/bun
- [x] Output to stdout or file
- [x] Validation pass on generated output (parse and check for errors)

### Phase 2.5: Expand character support

- [x] Unicode and emoji support in entity names (accounts, categories, tags, commodities)
- [x] Ensure YNAB converter also supports unicode/emojis when converting to .bursa format

## Milestone 3: Balance Engine & CLI

Extract balance computation from the (removed) web UI into a standalone query module (`src/query/`). Provide a CLI for viewing balances from the terminal.

### Phase 3.1: Cleanup

- [x] Delete web app (`src/web/`, `index.html`, web-specific deps)

### Phase 3.2: Balance Engine (`src/query/`)

- [x] `computeBalances(ledger, asOfDate?)` — account balances per commodity, category balances, &Unassigned balance
- [x] Optional `asOfDate` parameter filters transactions to compute running totals (balance as of end of that day)
- [x] Tests for balance computation
