# Bursa Architecture

> Version: 0.7.0 (Draft)
> Last Updated: 2026-01-03

## Overview

Bursa uses a **fused single-pass parser** — no separate lexer, no token objects, no AST. A single cursor advances through the source string, building the final `Ledger` data structure directly.

## 1. Design Principles

1. **Fused lexer/parser** using a single cursor position.
2. **LL(1) line and token dispatch** from the first non-whitespace character.
3. **Directly build `Ledger`** (no AST, minimal allocations).

## 2. Parser State

```typescript
interface Parser {
	source: string;
	pos: number;
	line: number;
	col: number;

	// Current context
	section: "META" | "BUDGET" | "LEDGER" | null;
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
		skipBlankLines(p);
		if (atEnd(p)) break;

		// Indentation is cosmetic: ignore leading horizontal whitespace at line start.
		skipHorizontalWhitespace(p);

		const ch = peek(p);

		if (ch === ";") {
			// Comment-only line (supports indentation)
			skipLine(p);
		} else if (ch === ">") {
			// >>> SECTION
			parseSectionMarker(p);
		} else if (p.section === "META") {
			parseMetaDirective(p);
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

### 3.1 Line-Start Branching (LL(1))

Indentation is optional. All line classification is done using the **first non-whitespace character at line start**.
Inline comments (`; ...`) are handled by the relevant line parser (e.g., `parseLedgerLine`), not by the top-level loop.

**Top-level line dispatch**

| First non-ws char (at line start) | Meaning                                 |
| --------------------------------- | --------------------------------------- |
| `;`                               | Comment-only line (skip)                |
| `>`                               | Section marker (`>>>`)                  |
| _(anything else)_                 | Dispatch to current section line parser |

**Section line starts (after selecting a section)**

| Section  | First non-ws char (at line start) | Meaning                                |
| -------- | --------------------------------- | -------------------------------------- |
| `META`   | `a-z` / `A-Z`                     | Directive keyword (e.g., `commodity:`) |
| `BUDGET` | `0-9`                             | Period header (`YYYY-MM`)              |
| `BUDGET` | `&`                               | Budget entry                           |
| `LEDGER` | `@`                               | Account header                         |
| `LEDGER` | `?` / `0-9`                       | Ledger entry (optional `?`, then date) |

### 3.2 Section-Specific Parsing

| Section  | Context State                         | Emits                                     |
| -------- | ------------------------------------- | ----------------------------------------- |
| `META`   | —                                     | Populates `data.meta`                     |
| `BUDGET` | `currentPeriod` from YYYY-MM header   | `BudgetEntry` → `data.budget`             |
| `LEDGER` | `currentAccount` from `@Account` line | `Transaction`/`Assertion` → `data.ledger` |

### 3.3 Token-Start Branching (LL(1))

Inside a line parser (e.g., within a ledger entry), LL(1) decisions use the **next non-whitespace character at the start of the next token**.

| Token start char | Meaning                                   |
| ---------------- | ----------------------------------------- |
| `+` / `-`        | Signed amount                             |
| `0-9`            | Unsigned number (e.g., amount value/date) |
| `$£€`…           | Amount with alias-leading symbol          |
| `@`              | Account ref                               |
| `&`              | Category ref                              |
| `#`              | Tag ref                                   |
| `;`              | Inline comment (consume to EOL)           |

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

type LedgerEntry = Transaction | Assertion;

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

// Whitespace (line-aware)
function skipHorizontalWhitespace(p: Parser): void; // spaces/tabs only (never consumes newline)
function skipToEOL(p: Parser): void; // skip to newline (for comments)
function skipLine(p: Parser): void; // skip past newline
function skipBlankLines(p: Parser): void; // consume \n runs

// Matchers
function match(p: Parser, expected: string): boolean; // consume if match
function expect(p: Parser, expected: string, errorCode: string): boolean;

// Spans
function markStart(p: Parser): { line: number; col: number };
function spanFrom(p: Parser, start: { line: number; col: number }): Span;
```

## 6. Validation

See SPEC.md §5 for the canonical list of diagnostics.

**Summary:** Syntax errors (E001–E004, E009, E011), semantic errors (E005, E007, E008, E010), warnings (W001–W003).

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

| Version | Date       | Changes                                                          |
| ------- | ---------- | ---------------------------------------------------------------- |
| 0.4.0   | 2026-01-02 | Fused single-pass parser, no lexer/AST                           |
| 0.5.0   | 2026-01-03 | Unified ledger: Opening+Transaction+Assertion flat               |
| 0.6.0   | 2026-01-03 | Removed START section; opening balances are regular transactions |
| 0.7.0   | 2026-01-03 | Simplified Design Principles and Validation (defer to SPEC.md)   |
