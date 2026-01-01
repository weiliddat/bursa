# Bursa Development Roadmap

> Last Updated: 2026-01-01

## Phase Overview

| Phase | Focus                  | Status      | Target   |
|-------|------------------------|-------------|----------|
| 0     | Project Setup          | 🔲 Pending  | Week 1   |
| 1     | Parser Core            | 🔲 Pending  | Week 2-3 |
| 2     | Domain Logic           | 🔲 Pending  | Week 4   |
| 3     | Basic UI               | 🔲 Pending  | Week 5-6 |
| 4     | Editor Integration     | 🔲 Pending  | Week 7   |
| 5     | Polish & Validation    | 🔲 Pending  | Week 8   |

---

## Phase 0: Project Setup

### Tasks

- [ ] **0.1** Configure TypeScript with strict mode
- [ ] **0.2** Set up Vitest for testing
- [ ] **0.3** Configure Biome for linting/formatting
- [ ] **0.4** Add SolidJS and Vite
- [ ] **0.5** Create directory structure
- [ ] **0.6** Create example.bursa test fixture

### Deliverables

- Working dev environment: `npm run dev`, `npm test`
- Directory structure in place
- CI-ready configuration

---

## Phase 1: Parser Core

### 1A: Lexer (Week 2)

- [ ] **1A.1** Define token types (`src/parser/tokens.ts`)
- [ ] **1A.2** Implement lexer with position tracking (`src/parser/lexer.ts`)
- [ ] **1A.3** Handle comments (strip but preserve location)
- [ ] **1A.4** Handle currency symbols and aliases
- [ ] **1A.5** Write lexer tests (valid tokens, edge cases, errors)

### 1B: Parser (Week 2-3)

- [ ] **1B.1** Define AST types (`src/parser/ast.ts`)
- [ ] **1B.2** Implement section parsing (META, START, BUDGET, LEDGER)
- [ ] **1B.3** Implement META directive parsing
- [ ] **1B.4** Implement START block parsing
- [ ] **1B.5** Implement BUDGET block parsing
- [ ] **1B.6** Implement LEDGER block parsing
- [ ] **1B.7** Implement amount parsing (all formats: `$50`, `50$`, `-$50`, etc.)
- [ ] **1B.8** Implement transaction parsing (expense, income, transfer)
- [ ] **1B.9** Implement advanced: swaps, verification, assertions
- [ ] **1B.10** Error recovery: continue parsing after errors

### 1C: Error Handling (Week 3)

- [ ] **1C.1** Define error types with codes (`src/parser/errors.ts`)
- [ ] **1C.2** Include source locations in all errors
- [ ] **1C.3** User-friendly error messages
- [ ] **1C.4** Write tests for all error scenarios

### Deliverables

- `parse(source: string) → ParseResult`
- 100% test coverage on parser
- Error messages with line/column info

---

## Phase 2: Domain Logic

### 2A: Entity Resolution (Week 4)

- [ ] **2A.1** Build account registry from AST
- [ ] **2A.2** Build category registry from AST
- [ ] **2A.3** Build commodity registry (from META + usage)
- [ ] **2A.4** Resolve account/category references
- [ ] **2A.5** Report undefined references

### 2B: Balance Computation (Week 4)

- [ ] **2B.1** Implement decimal arithmetic (avoid float issues)
- [ ] **2B.2** Compute opening balances from START
- [ ] **2B.3** Apply LEDGER transactions in date order
- [ ] **2B.4** Multi-commodity balance tracking
- [ ] **2B.5** Validate assertions (`==`)
- [ ] **2B.6** Validate verifications (`=`)

### 2C: Budget Logic (Week 4)

- [ ] **2C.1** Parse envelope allocations from BUDGET
- [ ] **2C.2** Track spending per category per period
- [ ] **2C.3** Compute available = allocated - spent
- [ ] **2C.4** Implement rollover calculation

### Deliverables

- `BursaDocument` with computed state
- Balance computation tests
- Budget tracking tests

---

## Phase 3: Basic UI

### 3A: App Shell (Week 5)

- [ ] **3A.1** Set up SolidJS app structure
- [ ] **3A.2** Create layout shell with navigation
- [ ] **3A.3** Implement file import (upload)
- [ ] **3A.4** Implement file export (download)
- [ ] **3A.5** Wire up reactive store

### 3B: Views (Week 5-6)

- [ ] **3B.1** Account list with balances
- [ ] **3B.2** Transaction feed (grouped by date)
- [ ] **3B.3** Budget envelope dashboard
- [ ] **3B.4** Error panel (diagnostics list)

### 3C: Styling (Week 6)

- [ ] **3C.1** Minimal CSS (system fonts, clean layout)
- [ ] **3C.2** Responsive design
- [ ] **3C.3** Dark mode support (optional)

### Deliverables

- Working SPA that can import/export `.bursa` files
- Visual display of accounts, transactions, budget

---

## Phase 4: Editor Integration

### 4A: Text Editor (Week 7)

- [ ] **4A.1** Integrate CodeMirror 6 (or Monaco)
- [ ] **4A.2** Syntax highlighting for `.bursa` format
- [ ] **4A.3** Error underlines from diagnostics
- [ ] **4A.4** Line numbers and basic editing

### 4B: Intellisense (Week 7)

- [ ] **4B.1** `@` triggers account completion
- [ ] **4B.2** `#` triggers category completion
- [ ] **4B.3** Hover information for entities
- [ ] **4B.4** Go-to-definition for references

### Deliverables

- Full in-browser editor experience
- Real-time parsing and feedback

---

## Phase 5: Polish & Validation

### Tasks (Week 8)

- [ ] **5.1** Performance profiling (large files)
- [ ] **5.2** Accessibility audit
- [ ] **5.3** Error message review
- [ ] **5.4** Documentation (user guide)
- [ ] **5.5** Demo video / screenshots

### Deliverables

- Production-ready prototype
- User documentation

---

## Test Milestones

| Milestone              | Criteria                                      |
|------------------------|-----------------------------------------------|
| **Parser Complete**    | All example.bursa variants parse correctly    |
| **Domain Complete**    | Balances match hand-calculated values         |
| **UI Complete**        | Can import, view, edit, export a file         |
| **MVP Complete**       | End-to-end workflow functional                |

---

## Risk Register

| Risk                           | Mitigation                                    |
|--------------------------------|-----------------------------------------------|
| Parser complexity creep        | Strict adherence to spec, incremental builds  |
| Performance with large files   | Benchmark early, optimize hot paths           |
| Scope creep                    | Defer features to post-MVP backlog            |
| Syntax ambiguities             | Resolve in SPEC.md, add disambiguation rules  |

---

## Backlog (Post-MVP)

- [ ] File System Access API (direct file editing)
- [ ] localStorage persistence
- [ ] Charts and reports
- [ ] Multi-file support (includes)
- [ ] Undo/redo in editor
- [ ] Import from CSV/OFX
- [ ] Mobile-responsive layout
- [ ] PWA support (offline)

---

## Changelog

| Date       | Changes                                        |
|------------|------------------------------------------------|
| 2026-01-01 | Initial roadmap created                        |
