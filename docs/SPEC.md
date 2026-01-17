# Bursa Language Specification

> Version: 0.5.0 (Draft)
> Last Updated: 2026-01-17

## 1. Core Philosophy

- **Minimalist & Human-Readable:** Easy to read and edit manually.
- **Implicit Double-Entry:** User writes single-entry; system compiles to double-entry.
- **Sign-Based Flow:** Positive adds value; negative reduces it.

## 2. File Format

A single text file divided into sections using `>>> [SECTION_NAME]`.

| Section      | Purpose                                           |
| ------------ | ------------------------------------------------- |
| `>>> META`   | Config (commodities, aliases, account properties) |
| `>>> BUDGET` | Category allocations                              |
| `>>> LEDGER` | The transaction log                               |

## 3. Syntax Specification

### 3.1 General Syntax

| Feature            | Rule                                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| **Comments**       | Any text following `;` is ignored                                        |
| **Indentation**    | Optional; leading spaces/tabs are ignored                                |
| **Aliases**        | Any string mapped to commodity in META (e.g., `$` → `USD`, `RM` → `MYR`) |
| **Number Format**  | Currency symbols before OR after number (e.g., `$500` or `500 $`)        |
| **Sign Placement** | Sign at very start (e.g., `-$500`, `-500 $`, `+RM50`)                    |

### 3.2 META Directives

| Directive   | Syntax                  | Description                            |
| ----------- | ----------------------- | -------------------------------------- |
| `commodity` | `commodity: $ = USD`    | Declare commodity with optional alias  |
| `untracked` | `untracked: @Brokerage` | Accounts excluded from budget tracking |

- All amounts require an explicit commodity (or its alias)
- `commodity:` declares a commodity; optionally maps an alias to it (e.g., `$ = USD`)
- Without alias: `commodity: AAPL` declares just the commodity
- Defined aliases and commodities can be used as prefix symbols in amounts (e.g., `-RM50`, `-USD100`)
- `untracked:` supports wildcards: `@Investments:*` matches all children

### 3.3 Entities

| Prefix | Entity Type | Description                              | Examples                    |
| ------ | ----------- | ---------------------------------------- | --------------------------- |
| `@`    | Account     | Places where assets sit                  | `@Checking`, `@Visa`        |
| `&`    | Category    | Budget categories (income/expense flows) | `&Groceries`, `&Job:Salary` |
| `#`    | Tag         | Metadata for search/grouping             | `#amazon`, `#project:q1`    |
| (none) | Commodity   | Standard currencies or assets            | `USD`, `EUR`, `AAPL`        |

Hierarchical naming uses `:` as separator. Parent totals aggregate child values.

**Trunk vs Leaf:** Entities with sub-entities (e.g., `@Bank` when `@Bank:Savings` exists) are "trunk" entities—used only for display/aggregation. Only "leaf" entities (no children) may be referenced in transactions or budget allocations.

### 3.4 Transactions

**Sign semantics** within an `@Account` block:

| Sign | Meaning                          | Net Worth Impact                                       |
| ---- | -------------------------------- | ------------------------------------------------------ |
| `+`  | Increases this account's balance | Changes if target is `&Category`; unchanged if `@Acct` |
| `-`  | Decreases this account's balance | Changes if target is `&Category`; unchanged if `@Acct` |

Accounts have no fixed type. Positive balance = asset-like; negative = liability-like.

**Budget tracking:** Transfers between tracked accounts need no category. Transfers FROM tracked TO untracked require a `&Category`.

**Ledger Entry Format:**

```
[?] DATE AMOUNT TARGET [TAG...] [; comment]
```

Entries are either a **transaction** (`AMOUNT TARGET ...`) or an **assertion** (`== AMOUNT`).

**Target Types:**

| Target Form          | Description                                     |
| -------------------- | ----------------------------------------------- |
| `&Category`          | Expense/income flow (affects net worth)         |
| `@Account`           | Transfer between accounts (no net worth change) |
| `@Account &Category` | Transfer to untracked account (drains category) |
| `+AMOUNT`            | Swap commodities within the account             |

**Transaction Types:**

| Type                  | Syntax                          | Description                         |
| --------------------- | ------------------------------- | ----------------------------------- |
| **Opening Balance**   | `+5000 $ &Opening:Balance`      | Initial account balance             |
| **Expense**           | `-100 $ &Groceries`             | Spend from account to category      |
| **Income**            | `+3000 $ &Job:Salary`           | Receive into account                |
| **Transfer Out**      | `-1000 $ @Savings`              | Move to another account             |
| **Transfer In**       | `+1000 $ @Checking`             | Receive from another account        |
| **Budgeted Transfer** | `-1000 $ @Brokerage &Investing` | Transfer to untracked with category |
| **Swap**              | `-1000 $ +6.5 AAPL`             | Swap commodities within an account  |

**Opening Balances** are regular transactions using a category (e.g., `&Opening:Balance`). For multiple commodities, use one transaction per commodity.

### 3.5 Budgeting

```text
>>> BUDGET
2026-01
  &Groceries 500 $
  &Investing 1000 $
```

- Categories fill via BUDGET allocations, drain via LEDGER transactions
- **Rollover:** Implicit (Total Allocated - Total Spent)
- Negative allocations reallocate between categories

## 4. Grammar (Informal)

```
file            = section*
section         = ">>>" SECTION_NAME NEWLINE block*

; META section
meta_line       = "commodity:" (ALIAS_KEY "=")? COMMODITY
                | "untracked:" account_pattern
account_pattern = "@" IDENTIFIER (":" IDENTIFIER)* (":" "*")?

; BUDGET section
budget_block    = YEAR_MONTH NEWLINE budget_entry*
budget_entry    = category amount

; LEDGER section
ledger_block    = account NEWLINE ledger_entry*
ledger_entry    = unverified? DATE (transaction | assertion) comment?
unverified      = "?"

; Transaction: amount flows to target
transaction     = amount target tag*

; Assertion: balance check
assertion       = "==" amount

; Shared primitives
amount          = SIGN? SYMBOL? NUMBER SYMBOL?
SYMBOL          = ALIAS | COMMODITY
target          = amount                     ; swap (second amount)
                | category                   ; expense/income flow
                | account category?          ; transfer (category for tracked→untracked)
account         = "@" IDENTIFIER (":" IDENTIFIER)*
category        = "&" IDENTIFIER (":" IDENTIFIER)*
tag             = "#" IDENTIFIER (":" IDENTIFIER)*
comment         = ";" TEXT
```

## 5. Diagnostics

| Error                       | Category   | Description                                         |
| --------------------------- | ---------- | --------------------------------------------------- |
| `InvalidSectionError`       | Syntax     | Unknown section marker or content before section    |
| `InvalidDirectiveError`     | Syntax     | Malformed META directive                            |
| `InvalidEntryError`         | Syntax     | Invalid date, malformed amount, missing target, etc |
| `UnknownEntityError`        | Validation | Unknown account, category, or commodity reference   |
| `TrunkEntityError`          | Validation | Account/category group is used as target            |
| `MissingCategoryError`      | Validation | Transfer to untracked account missing category      |
| `UnverifiedEntryWarning`    | Warning    | Entry marked `?` needs user confirmation            |
| `AssertionFailedWarning`    | Warning    | Balance assertion does not match computed balance   |
| `NonChronologicalWarning`   | Warning    | Dates within account block are out of order         |
| `UnbudgetedCategoryWarning` | Warning    | Expense category not allocated in BUDGET            |

---

## Appendix A: Advanced Patterns

### A.1 Multi-Currency/Asset Swaps

Swap one commodity for another within an account:

```text
@Brokerage
  2026-01-21 -1000 $ +6.5 AAPL    ; buy stock
  2026-02-15 -5 AAPL +800 $       ; sell stock
```

### A.2 Cross-Currency Transfers

Record the initiating side as a normal transfer. Use an assertion on the receiving side for reconciliation:

```text
@Checking
  2026-01-25 -100 $ @Maybank

@Maybank
  ? 2026-01-26 == 1670 RM         ; unverified until confirmed
```

### A.3 Assertions

Check balance at a specific point:

```text
@Checking
  2026-01-31 == 6800 $
```

### A.4 Unverified Entries

Use `?` prefix for unverified entries. Remove once confirmed:

```text
@Maybank
  ? 2026-01-25 == 1670 RM         ; pending
  2026-01-25 == 1670 RM           ; verified
```

---

## Changelog

| Version | Date       | Changes                                                                                       |
| ------- | ---------- | --------------------------------------------------------------------------------------------- |
| 0.1.0   | 2026-01-01 | Initial specification                                                                         |
| 0.2.0   | 2026-01-02 | Simplified syntax: +/- signs only, canonical order, & for categories, # for tags              |
| 0.2.1   | 2026-01-02 | Added `?` unverified entry marker                                                             |
| 0.2.2   | 2026-01-02 | Make `?` a line prefix; allow inline swaps via second amount                                  |
| 0.2.3   | 2026-01-02 | START entries support multiple amounts per line                                               |
| 0.2.4   | 2026-01-02 | Unified `target` primitive                                                                    |
| 0.2.5   | 2026-01-02 | Renamed to tracked/untracked; removed budget: directive; added wildcard support               |
| 0.2.6   | 2026-01-02 | Removed default: directive; amounts require explicit commodity                                |
| 0.2.7   | 2026-01-03 | Indentation optional; dispatch uses first non-whitespace char                                 |
| 0.3.0   | 2026-01-03 | Removed START section; opening balances via `&Opening:Balance`                                |
| 0.4.0   | 2026-01-03 | Simplified spec: consolidated diagnostics, moved advanced patterns to appendix, reduced prose |
| 0.5.0   | 2026-01-17 | Aliases accept any string; prefix/suffix symbols support both aliases and commodities         |
| 0.5.1   | 2026-01-17 | Combined alias and commodity directives into single `commodity:` directive                    |
