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
- [ ] Unit tests for all validation rules (Vxxx per SPEC.md)
- [ ] Unit tests for all error codes (Exxx per SPEC.md)
- [ ] Unit tests for all warning codes (Wxxx per SPEC.md)

---

## Future Milestones

_To be planned after Milestone 1 is complete._
