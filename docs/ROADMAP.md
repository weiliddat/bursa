# Bursa Roadmap

> Last Updated: 2026-01-03

## Milestone 1: Parser & Validation

Build a fused single-pass parser that reads `.bursa` files and produces a `Ledger` data structure with diagnostics.

### Phase 1.1: Core Parser Infrastructure

- [ ] Set up parser module structure (`src/parser/`)
- [ ] Implement cursor helpers (peek, advance, position tracking)
- [ ] Implement section marker parsing (`>>> META`, etc.)
- [ ] Add diagnostic collection (errors, warnings with spans)

### Phase 1.2: Section Parsing

- [ ] META section: `commodity:`, `alias:`, `untracked:`
- [ ] BUDGET section: period headers, category + amount
- [ ] LEDGER section: account blocks, transactions, assertions

### Phase 1.3: Transaction & Target Parsing

- [ ] Amount parsing (sign, symbol/commodity, number variations)
- [ ] Entity refs: `@Account`, `&Category`, `#Tag` (with hierarchy)
- [ ] Target variants: category, account, account+category, swap
- [ ] Unverified marker (`?`) and comments (`;`)

### Phase 1.4: Semantic Validation

- [ ] Reference validation (accounts, categories, commodities)
- [ ] Budget validation (tracked/untracked rules)
- [ ] Assertion validation (balance checks)
- [ ] Structural validation (required fields, chronological dates)

### Phase 1.5: Test Coverage

- [ ] Parse `examples/example.bursa` end-to-end
- [ ] Unit tests for each syntax rule (V001–V006)
- [ ] Unit tests for reference validation (V010–V012)
- [ ] Unit tests for budget validation (V020–V022)
- [ ] Unit tests for assertion validation (V030)
- [ ] Unit tests for structural validation (V040–V042)
- [ ] Unit tests for all error codes (E001–E010)
- [ ] Unit tests for all warning codes (W001–W003)

---

## Future Milestones

_To be planned after Milestone 1 is complete._
