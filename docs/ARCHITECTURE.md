# Bursa Architecture

> Version: 0.2.3 (Draft)
> Last Updated: 2026-01-02

## Overview

Bursa is a client-side SPA built with SolidJS. The architecture separates concerns into three layers:

```
┌─────────────────────────────────────────────────────┐
│                    UI Layer                         │
│              (SolidJS Components)                   │
├─────────────────────────────────────────────────────┤
│                  Domain Layer                       │
│     (Reactive Store, Computations, Commands)        │
├─────────────────────────────────────────────────────┤
│                  Parser Layer                       │
│        (Lexer, Parser, AST, Validators)             │
└─────────────────────────────────────────────────────┘
```

## 1. Parser Layer

### 1.1 Design Goals

- **Performance:** Hand-written recursive descent parser (no generator)
- **Incremental:** Future support for partial re-parsing
- **Error Recovery:** Continue parsing after errors, collect all diagnostics
- **Position Tracking:** Every AST node tracks source location for editor features

### 1.2 Components

```
src/parser/
├── lexer.ts          # Tokenizer - converts text to token stream
├── tokens.ts         # Token type definitions
├── parser.ts         # Recursive descent parser
├── ast.ts            # AST node type definitions
├── errors.ts         # Error types and messages
└── index.ts          # Public API
```

### 1.3 Token Types

```typescript
enum TokenType {
  // Structural
  SECTION_MARKER,   // >>>
  NEWLINE,
  INDENT,
  EOF,
  
  // Literals
  NUMBER,           // 123.45
  DATE,             // 2026-01-15
  YEAR_MONTH,       // 2026-01
  IDENTIFIER,       // Checking, Groceries, USD
  STRING,           // Quoted strings if needed
  
  // Entity prefixes (lexer emits these as compound tokens)
  ACCOUNT,          // @Checking, @Assets:Bank:Checking
  CATEGORY,         // &Groceries, &Expenses:Food
  TAG,              // #traderjoes, #q1
  CURRENCY_SYMBOL,  // $, €, RM
  
  // Operators
  PLUS,             // +
  MINUS,            // -
  DOUBLE_EQUALS,    // ==
  QUESTION,         // ?
  COLON,            // :
  EQUALS,           // =
  COMMA,            // ,
  
  // Special
  COMMENT,          // ; ...
  ERROR,            // Invalid token
}
```

### 1.4 AST Structure

```typescript
interface SourceLocation {
  start: { line: number; column: number; offset: number };
  end: { line: number; column: number; offset: number };
}

interface BaseNode {
  type: string;
  loc: SourceLocation;
}

// Top-level
interface File extends BaseNode {
  type: 'File';
  sections: Section[];
}

interface Section extends BaseNode {
  type: 'Section';
  name: 'META' | 'START' | 'BUDGET' | 'LEDGER';
  body: SectionBody;
}

// Section-specific bodies
interface MetaBody { directives: MetaDirective[]; }
interface StartBody { blocks: StartBlock[]; }
interface BudgetBody { periods: BudgetPeriod[]; }
interface LedgerBody { accountBlocks: AccountBlock[]; }

// META directives
type MetaDirective = 
  | { type: 'Default'; commodity: string }
  | { type: 'Commodity'; commodity: string }
  | { type: 'Alias'; symbol: string; commodity: string }
  | { type: 'Budget'; accounts: AccountRef[] }
  | { type: 'NoBudget'; accounts: AccountRef[] };

// START entries (declarative balances)
interface StartBlock extends BaseNode {
  type: 'StartBlock';
  date: string;  // YYYY-MM-DD
  entries: StartEntry[];
}

interface StartEntry extends BaseNode {
  type: 'StartEntry';
  account: AccountRef;
  amounts: Amount[];  // multiple amounts per line for semantic grouping
}

// BUDGET entries
interface BudgetPeriod extends BaseNode {
  type: 'BudgetPeriod';
  period: string;  // YYYY-MM
  entries: BudgetEntry[];
}

interface BudgetEntry extends BaseNode {
  type: 'BudgetEntry';
  category: CategoryRef;
  amount: Amount;
}

// LEDGER entries
interface AccountBlock extends BaseNode {
  type: 'AccountBlock';
  account: AccountRef;
  entries: LedgerEntry[];
}

type LedgerEntry = Transaction | Assertion;

interface Transaction extends BaseNode {
  type: 'Transaction';
  date: string;
  unverified: boolean;     // true if the ledger entry is prefixed with `?`
  amount: Amount;
  target: AccountRef | CategoryRef | Amount; // Amount target means an inline swap
  category?: CategoryRef;  // optional, for budget tracking on transfers
  tags: TagRef[];
  comment?: string;
}

interface Assertion extends BaseNode {
  type: 'Assertion';
  date: string;
  unverified: boolean;     // true if the ledger entry is prefixed with `?`
  amount: Amount;
  comment?: string;
}

// References (hierarchical names supported)
interface AccountRef extends BaseNode {
  type: 'AccountRef';
  path: string[];  // ['Assets', 'Bank', 'Checking']
  raw: string;     // '@Assets:Bank:Checking'
}

interface CategoryRef extends BaseNode {
  type: 'CategoryRef';
  path: string[];  // ['Expenses', 'Food', 'Groceries']
  raw: string;     // '&Expenses:Food:Groceries'
}

interface TagRef extends BaseNode {
  type: 'TagRef';
  name: string;    // 'traderjoes' (without #)
  raw: string;     // '#traderjoes'
}

interface Amount extends BaseNode {
  type: 'Amount';
  sign: '+' | '-' | null;
  value: number;
  commodity: string;
}
```

### 1.5 Parser Strategy

1. **Lexer Phase:** Single-pass tokenization with lookahead
2. **Parser Phase:** Recursive descent, section-aware
3. **Validation Phase:** Semantic checks on AST

**Canonical Transaction Parsing:**
Transaction components must follow strict order: amount, target (account/category/amount), category (optional), tags (optional).

```typescript
// Public API
function parse(source: string): ParseResult;

interface ParseResult {
  ast: File | null;
  errors: ParseError[];
  warnings: ParseWarning[];
}
```

## 2. Domain Layer

### 2.1 Core Data Structures

```typescript
interface BursaDocument {
  // Raw parsed data
  ast: File;
  
  // Resolved entities (indexed)
  accounts: Map<string, Account>;
  categories: Map<string, Category>;
  commodities: Map<string, Commodity>;
  
  // Computed state
  balances: Map<string, Map<string, Decimal>>; // account -> commodity -> balance
  categoryStates: Map<string, CategoryState>;
  
  // Diagnostics
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

interface Account {
  name: string;
  path: string[];           // ['Assets', 'Bank', 'Checking']
  balances: Map<string, Decimal>;
  transactions: Transaction[];
  isBudgetTracked: boolean; // from META budget:/no-budget: directives
}

interface Category {
  name: string;
  path: string[];           // ['Expenses', 'Food', 'Groceries']
}

interface CategoryState {
  category: string;
  period: string;           // '2026-01'
  allocated: Decimal;
  spent: Decimal;
  available: Decimal;       // allocated - spent + rollover
}
```

### 2.2 Reactive Architecture (SolidJS)

```typescript
// Core store
const [document, setDocument] = createStore<BursaDocument>({...});

// Source text (editor content)
const [source, setSource] = createSignal<string>('');

// Derived computations (fine-grained reactivity)
const parsed = createMemo(() => parse(source()));
const accounts = createMemo(() => extractAccounts(parsed().ast));
const balances = createMemo(() => computeBalances(parsed().ast, accounts()));
const categoryStatus = createMemo(() => computeCategories(parsed().ast, accounts()));
const diagnostics = createMemo(() => [...parsed().errors, ...validate(parsed().ast)]);
```

### 2.3 Intellisense Support

The parser exposes hooks for editor integration:

```typescript
interface CompletionContext {
  position: number;
  triggerCharacter: '@' | '&' | '#' | null;
  prefix: string;
}

interface CompletionItem {
  label: string;
  kind: 'account' | 'category' | 'tag' | 'commodity';
  insertText: string;
}

function getCompletions(doc: BursaDocument, ctx: CompletionContext): CompletionItem[];
function getHoverInfo(doc: BursaDocument, position: number): HoverInfo | null;
function getDiagnosticsAtPosition(doc: BursaDocument, position: number): Diagnostic[];
```

### 2.4 Derived Computations (UI)

The UI surfaces derived numbers (budget status, unallocated money, warnings) computed from the parsed AST. Comments remain free-form and are not required for correctness.

**Budget-derived numbers:**
- Remaining envelope/category money (per period) from `allocated - spent + rollover`
- Unallocated / to-be-budgeted money (per period) from budget-tracked account balances minus total category availability

```typescript
interface BudgetSummary {
  period: string; // YYYY-MM
  commodity: string;
  toBeBudgeted: Decimal;
}

function computeBudgetSummary(doc: BursaDocument): BudgetSummary[];
```

**Diagnostics beyond syntax:**
In addition to parser errors, the domain layer can emit warnings/errors for potentially problematic entries, including:
- Transfers involving `no-budget` accounts missing a `&Category`
- Unverified entries (`?`) that need user confirmation

## 3. UI Layer

### 3.1 Component Structure

```
src/ui/
├── App.tsx               # Root component
├── Editor/
│   ├── Editor.tsx        # CodeMirror/Monaco wrapper
│   ├── completions.ts    # Intellisense provider
│   └── diagnostics.ts    # Error highlighting
├── Views/
│   ├── Accounts.tsx      # Account list & balances
│   ├── Transactions.tsx  # Transaction feed
│   ├── Budget.tsx        # Budget dashboard
│   └── Reports.tsx       # Charts & summaries
├── Layout/
│   └── Shell.tsx         # App shell, navigation
└── common/
    └── ...               # Shared components
```

### 3.2 Data Flow

```
User edits text
       │
       ▼
  setSource(newText)
       │
       ▼
  parse(source)  ──────► parsed (AST + errors)
       │
       ▼
  ┌────┴────┐
  │ Derived │
  │ Signals │
  └────┬────┘
       │
       ├──► accounts ──► <AccountList />
       ├──► balances ──► <BalanceSheet />
       ├──► categoryStatus ──► <BudgetView />
       └──► diagnostics ──► <Editor /> (underlines)
```

## 4. File I/O

### 4.1 Import/Export (SPA Mode)

```typescript
// Export
function exportToFile(doc: BursaDocument): Blob;
function downloadFile(blob: Blob, filename: string): void;

// Import
function handleFileUpload(file: File): Promise<string>;
```

### 4.2 Persistence Strategy

1. **Phase 1 (Prototype):** Manual import/export via file picker
2. **Phase 2:** localStorage for session persistence
3. **Phase 3:** File System Access API (Chrome) for direct file editing
4. **Phase 4:** Optional backend sync

## 5. Testing Strategy

### 5.1 Parser Tests (Priority)

```
src/parser/__tests__/
├── lexer.test.ts         # Token generation
├── parser.test.ts        # AST structure
├── errors.test.ts        # Error recovery & messages
└── snapshots/            # Golden file tests
```

Test categories:
- **Valid input:** Correct AST structure
- **Invalid input:** Appropriate error messages with locations
- **Edge cases:** Empty sections, unicode, large files
- **Fuzzing:** Property-based tests for robustness

### 5.2 Domain Tests

```
src/domain/__tests__/
├── balances.test.ts      # Balance computation
├── budget.test.ts        # Budget logic
└── validation.test.ts    # Semantic rules
```

### 5.3 Integration Tests

```
src/__tests__/
├── integration.test.ts   # End-to-end parsing + computation
└── fixtures/             # Real-world example files
```

---

## Changelog

| Version | Date       | Changes                                                        |
|---------|------------|----------------------------------------------------------------|
| 0.1.0   | 2026-01-01 | Initial architecture                                           |
| 0.1.1   | 2026-01-01 | Add META directives, flexible tx, assertions                   |
| 0.2.0   | 2026-01-02 | Simplified: +/- signs, canonical order, & categories, # tags   |
| 0.2.1   | 2026-01-02 | Added `?` token and `unverified` marker support                |
| 0.2.2   | 2026-01-02 | Make `?` a line prefix; allow inline swaps via amount targets  |
| 0.2.3   | 2026-01-02 | START entries support multiple amounts per line (Amount[])     |
