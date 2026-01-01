# Bursa Architecture

> Version: 0.1.0 (Draft)
> Last Updated: 2026-01-01

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
  
  // Symbols
  ACCOUNT,          // @Checking
  CATEGORY,         // #Groceries
  CURRENCY_SYMBOL,  // $, €, RM
  
  // Operators
  PLUS,             // +
  MINUS,            // -
  ARROW_RIGHT,      // >
  ARROW_LEFT,       // <
  EQUALS,           // =
  DOUBLE_EQUALS,    // ==
  COLON,            // :
  LPAREN,           // (
  RPAREN,           // )
  
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

// Ledger entries (three types)
type LedgerEntry = Transaction | Assertion | Verification;

interface Transaction extends BaseNode {
  type: 'Transaction';
  date: Date;
  amount: Amount;
  direction: '>' | '<';
  target: AccountRef | CategoryRef | SwapTarget;
  category?: CategoryRef;  // optional, for budget tracking
  comment?: string;
}

interface Assertion extends BaseNode {
  type: 'Assertion';
  date: Date;
  amount: Amount;
  comment?: string;
}

interface Verification extends BaseNode {
  type: 'Verification';
  date: Date;
  amount: Amount;
  direction: '>' | '<';
  account: AccountRef;
  conversion?: Amount;
  comment?: string;
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
3. **Normalization Phase:** Flexible transaction syntax → canonical AST
4. **Validation Phase:** Semantic checks on AST

**Flexible Transaction Parsing:**
Transaction components (amount, direction, target, category) can appear in any order.
The parser collects all components, then validates required fields are present.

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
  budgetEnvelopes: Map<string, EnvelopeState>;
  
  // Diagnostics
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

interface Account {
  name: string;
  path: string[];           // ['Assets', 'Checking']
  balances: Map<string, Decimal>;
  transactions: Transaction[];
  isBudgetTracked: boolean; // from META budget:/no-budget: directives
}

interface EnvelopeState {
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
const budgetStatus = createMemo(() => computeBudget(parsed().ast, accounts()));
const diagnostics = createMemo(() => [...parsed().errors, ...validate(parsed().ast)]);
```

### 2.3 Intellisense Support

The parser exposes hooks for editor integration:

```typescript
interface CompletionContext {
  position: number;
  triggerCharacter: '@' | '#' | null;
  prefix: string;
}

interface CompletionItem {
  label: string;
  kind: 'account' | 'category' | 'commodity';
  insertText: string;
}

function getCompletions(doc: BursaDocument, ctx: CompletionContext): CompletionItem[];
function getHoverInfo(doc: BursaDocument, position: number): HoverInfo | null;
function getDiagnosticsAtPosition(doc: BursaDocument, position: number): Diagnostic[];
```

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
│   ├── Budget.tsx        # Envelope dashboard
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
       ├──► budgetStatus ──► <BudgetView />
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
├── budget.test.ts        # Envelope logic
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

| Version | Date       | Changes                                         |
|---------|------------|-------------------------------------------------|
| 0.1.0   | 2026-01-01 | Initial architecture                            |
| 0.1.1   | 2026-01-01 | Add META directives, flexible tx, assertions    |
