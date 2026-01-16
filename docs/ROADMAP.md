# Bursa Roadmap

> Last Updated: 2026-01-16

## Milestone 1: Parser & Validation

Build a fused single-pass parser that reads `.bursa` files and produces a `Ledger` data structure with diagnostics.

### Phase 1.1: Core Parser Infrastructure

- [x] Set up parser module structure (`src/parser/`)
- [x] Implement cursor helpers (peek, advance, position tracking)
- [x] Implement section marker parsing (`>>> META`, etc.)
- [x] Add diagnostic collection (errors, warnings with spans)

### Phase 1.2: Section Parsing

- [x] META section: `commodity:`, `alias:`, `untracked:`
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

---

## Future Milestones

_To be planned after Milestone 1 is complete._
