# Bursa Architecture

> Version: 0.5.0 (Draft)
> Last Updated: 2026-01-03

## Overview

Bursa uses a **fused single-pass parser** — no separate lexer, no token objects, no AST. A single cursor advances through the source string, building the final `Ledger` data structure directly.

## 1. Design Principles

1. **Fused lexer/parser:** Read characters directly, no intermediate tokens
2. **Single cursor:** One `pos` integer tracks position in source
3. **LL(1) lookahead:** Peek next non-whitespace char to branch
4. **Direct accumulation:** Build `Ledger` as we parse, not an AST
5. **Minimal allocations:** Only create objects for the final result

## 2. Parser State

```typescript
interface Parser {
	source: string;
	pos: number;
	line: number;
	col: number;

	// Current context
	section: "META" | "START" | "BUDGET" | "LEDGER" | null;
	currentDate: string | null; // for START block headers
	currentPeriod: string | null; // for BUDGET block headers
	currentAccount: AccountRef | null; // for LEDGER @Account headers

	// Output (built as we parse)
	data: Ledger;
	errors: Diagnostic[];
	warnings: Diagnostic[];
}
```

## 3. Parsing Strategy

**Peek → Decide → Consume**

```typescript
function parse(source: string): ParseResult {
	const p = createParser(source);

	while (!atEnd(p)) {
		skipWhitespaceAndComments(p);
		if (atEnd(p)) break;

		const ch = peek(p);

		if (ch === ">") {
			// >>> SECTION
			parseSectionMarker(p);
		} else if (p.section === "META") {
			parseMetaDirective(p);
		} else if (p.section === "START") {
			parseStartLine(p);
		} else if (p.section === "BUDGET") {
			parseBudgetLine(p);
		} else if (p.section === "LEDGER") {
			parseLedgerLine(p);
		} else {
			// Content before any section
			addError(p, "E001", "Content before section marker");
			skipLine(p);
		}
	}

	validate(p); // Post-parse semantic checks
	return { data: p.data, errors: p.errors, warnings: p.warnings };
}
```

### 3.1 Character-Level Branching (LL(1))

| First Char | Meaning                          |
| ---------- | -------------------------------- |
| `>`        | Section marker (`>>>`)           |
| `@`        | Account reference                |
| `&`        | Category reference               |
| `#`        | Tag                              |
| `+` / `-`  | Signed amount                    |
| `0-9`      | Date or unsigned amount          |
| `?`        | Unverified entry marker          |
| `=`        | Assertion (`==`)                 |
| `;`        | Comment (skip to EOL)            |
| `\n`       | Blank line (skip)                |

### 3.2 Section-Specific Parsing

| Section   | Context State                         | Emits                                     |
| --------- | ------------------------------------- | ----------------------------------------- |
| `META`    | —                                     | Populates `data.meta`                     |
| `START`   | `currentDate` from date header        | `Opening` → `data.ledger`                 |
| `BUDGET`  | `currentPeriod` from YYYY-MM header   | `BudgetEntry` → `data.budget`             |
| `LEDGER`  | `currentAccount` from `@Account` line | `Transaction`/`Assertion` → `data.ledger` |

## 4. Domain Models

Built directly during parsing:

```typescript
interface Ledger {
	meta: {
		commodities: Set<string>;
		aliases: Map<string, string>;
		untrackedPatterns: string[];
	};
	budget: BudgetEntry[];
	ledger: LedgerEntry[];
}

interface BudgetEntry {
	period: string; // YYYY-MM
	category: CategoryRef;
	amount: Amount;
	span: Span;
}

type LedgerEntry = Opening | Transaction | Assertion;

interface Opening {
	kind: "opening";
	date: string;
	account: AccountRef;
	amounts: Amount[]; // multi-commodity
	span: Span;
}

interface Transaction {
	kind: "transaction";
	date: string;
	account: AccountRef; // the @Account block this was under
	unverified: boolean;
	amount: Amount;
	target: Target;
	tags: TagRef[];
	comment: string | null;
	span: Span;
}

interface Assertion {
	kind: "assertion";
	date: string;
	account: AccountRef;
	unverified: boolean;
	amount: Amount;
	comment: string | null;
	span: Span;
}

type Target =
	| { kind: "category"; ref: CategoryRef }
	| { kind: "account"; ref: AccountRef; category: CategoryRef | null }
	| { kind: "swap"; amount: Amount };

interface AccountRef {
	path: string[];
	raw: string;
	span: Span;
}

interface CategoryRef {
	path: string[];
	raw: string;
	span: Span;
}

interface TagRef {
	path: string[];
	raw: string;
	span: Span;
}

interface Amount {
	sign: "+" | "-" | null;
	value: number;
	commodity: string;
	span: Span;
}

interface Span {
	start: { line: number; col: number };
	end: { line: number; col: number };
}
```

## 5. Helper Functions

```typescript
// Cursor operations
function peek(p: Parser): string; // p.source[p.pos]
function peekCode(p: Parser): number; // p.source.charCodeAt(p.pos)
function advance(p: Parser): string; // consume one char
function atEnd(p: Parser): boolean;

// Whitespace
function skipWhitespace(p: Parser): void;
function skipWhitespaceAndComments(p: Parser): void;
function skipLine(p: Parser): void;

// Matchers
function match(p: Parser, expected: string): boolean; // consume if match
function expect(p: Parser, expected: string, errorCode: string): boolean;

// Spans
function markStart(p: Parser): { line: number; col: number };
function spanFrom(p: Parser, start: { line: number; col: number }): Span;
```

## 6. Validation

**During parsing (syntax):**
- E001: Invalid character
- E002: Malformed amount
- E003: Invalid date
- E004: Missing required component
- E009: Invalid order

**Post-parsing (semantic):**
- E005: Unknown account
- E006: Unknown category
- E007: Unknown commodity
- E008: Assertion mismatch
- E010: Untracked transfer missing category

**Warnings:**
- W001: Non-chronological dates
- W002: Category not in budget
- W003: Unverified entry

## 7. Public API

```typescript
interface ParseResult {
	data: Ledger;
	errors: Diagnostic[];
	warnings: Diagnostic[];
}

interface Diagnostic {
	code: string;
	message: string;
	severity: "error" | "warning";
	span: Span;
}

function parse(source: string): ParseResult;
```

## 8. File Structure

```
src/parser/
├── parser.ts       # Fused parser (main logic)
├── models.ts       # Ledger, Transaction, etc.
├── diagnostics.ts  # Error/warning definitions
├── validate.ts     # Post-parse semantic checks
└── index.ts        # Public API
```

## 9. Testing

```
src/parser/
├── parser.test.ts      # Valid/invalid parsing
├── validate.test.ts    # Semantic validation
└── diagnostics.test.ts # Error positions & messages
```

Use `examples/example.bursa` as canonical fixture.

---

## Changelog

| Version | Date       | Changes                                            |
| ------- | ---------- | -------------------------------------------------- |
| 0.4.0   | 2026-01-02 | Fused single-pass parser, no lexer/AST             |
| 0.5.0   | 2026-01-03 | Unified ledger: Opening+Transaction+Assertion flat |
