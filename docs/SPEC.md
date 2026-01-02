# Bursa Language Specification

> Version: 0.2.3 (Draft)
> Last Updated: 2026-01-02

## 1. Core Philosophy

- **Minimalist & Human-Readable:** The file must be easy to read and edit manually.
- **Implicit Double-Entry:** The user writes single-entry style transactions (e.g., "Spent 50 on Groceries"), but the system compiles them into a rigorous double-entry graph under the hood.
- **Sign-Based Flow:** Positive amounts add value to the account; negative amounts reduce it.

## 2. File Format

For the prototype, we use a single text file divided into sections using `>>> [SECTION_NAME]`.

### Sections

| Section     | Purpose                                           |
|-------------|---------------------------------------------------|
| `>>> META`  | Config (commodities, aliases, account properties) |
| `>>> START` | Opening balances (declarative)                    |
| `>>> BUDGET`| Category allocations                              |
| `>>> LEDGER`| The transaction log                               |

## 3. Syntax Specification

### 3.1 General Syntax

| Feature           | Rule                                                                 |
|-------------------|----------------------------------------------------------------------|
| **Comments**      | Any text following `;` is ignored                                    |
| **Aliases**       | Symbols mapped to ISO codes in META (e.g., `$` → `USD`)              |
| **Number Format** | Currency symbols before OR after number (e.g., `$500` or `500 $`)    |
| **Sign Placement**| Sign must be at very start (e.g., `-$500`, `-500 $`, `+RM50`)        |

### 3.2 META Directives

| Directive      | Syntax                          | Description                                      |
|----------------|---------------------------------|--------------------------------------------------|
| `default`      | `default: USD`                  | Default commodity when none specified            |
| `commodity`    | `commodity: AAPL`               | Declare a valid commodity (for validation)       |
| `alias`        | `alias: $ = USD`                | Map symbol to commodity                          |
| `budget`       | `budget: @Checking, @Savings`   | Accounts tracked in budget categories            |
| `no-budget`    | `no-budget: @Brokerage`         | Accounts excluded from budget tracking           |

**Commodity Declaration:**
- All commodities used in the file should be declared in META
- Aliases implicitly declare both the symbol and the commodity
- Unknown commodities in transactions will produce warnings

**Budget Tracking:**
- By default, all accounts are budget-tracked
- Use `no-budget:` to exclude investment/asset accounts from category tracking
- OR use `budget:` to explicitly list only budget-tracked accounts (opt-in mode)
- Transfers FROM budget accounts TO no-budget accounts drain categories (money left the budget system)
- Transfers FROM no-budget accounts don't affect categories

### 3.3 Entities

| Prefix | Entity Type | Mnemonic     | Description                              | Examples                    |
|--------|-------------|--------------|------------------------------------------|-----------------------------|
| `@`    | Account     | "at"         | Places where assets sit                  | `@Checking`, `@Visa`        |
| `&`    | Category    | "&"          | Budget categories (income/expense flows) | `&Groceries`, `&Job:Salary` |
| `#`    | Tag         | "hashtag"    | Metadata for search/grouping             | `#amazon`, `#q1`            |
| (none) | Commodity   |              | Standard currencies or assets            | `USD`, `EUR`, `AAPL`        |

**Hierarchical Names:**
Accounts and categories support hierarchical naming using `:` as separator:

```text
@Assets:Bank:Checking     ; nested account
&Expenses:Food:Groceries  ; nested category
```

- Transactions can target any level (parent or leaf)
- Parent totals automatically aggregate child values
- Use consistent hierarchy for meaningful reports

### 3.4 Transactions

Transactions use **sign-based semantics** within an account block: the sign indicates how the entry changes the **current account’s signed balance**.

| Sign | Meaning (within an `@Account` block) |
|------|--------------------------------------|
| `+`  | Increases this account’s balance     |
| `-`  | Decreases this account’s balance     |

**Net worth impact depends on the counterparty:**
- If `TARGET` is an `@Account`, the entry represents an internal transfer between accounts and does **not** change net worth (it redistributes value across accounts).
- If `TARGET` is a `&Category`, the entry represents an external flow classified to an envelope/category and **does** change net worth.

**Budget tracking depends on whether the transfer stays “in budget”:**
- Transfers between two budget-tracked accounts can omit `CATEGORY` (it’s just moving money within your budget system).
- If a transfer involves a no-budget account, it is treated as money leaving/entering the budget system, so you must provide a `&Category` to record which envelope/category it affects.

**Signed balances (no fixed account types):**
Accounts are not declared as “asset” or “liability”. A single account can cross zero over time:
- Positive balance means you own value (asset-like)
- Negative balance means you owe value (liability-like)

Example: on `@CreditCard`, a `-$50` entry makes the balance more negative (you owe more); a `+$500` entry moves it toward (or past) zero (you owe less / may have a credit).

**Ledger Entry Format:**

```
[?] DATE AMOUNT TARGET [CATEGORY] [TAG...] [; comment]
```

Ledger entries are either:
- a **transaction** (`AMOUNT ...`), or
- an **assertion** (`== AMOUNT`)

| Component | Required | Description                                      |
|-----------|----------|--------------------------------------------------|
| DATE      | Yes      | YYYY-MM-DD format                                |
| AMOUNT    | Yes      | Signed amount with optional commodity            |
| TARGET    | Yes      | `@Account` or `&Category`                        |
| CATEGORY  | No       | `&Category` for budget tracking on transfers     |
| TAG       | No       | One or more `#tag` for metadata                  |
| comment   | No       | Text after `;`                                   |

**Transaction Types:**

| Type                  | Syntax                          | Description                          |
|-----------------------|---------------------------------|--------------------------------------|
| **Expense**           | `-100 $ &Groceries`             | Spend from account to category       |
| **Income**            | `+3000 $ &Job:Salary`           | Receive into account                 |
| **Transfer Out**      | `-1000 $ @Savings`              | Move to another account              |
| **Transfer In**       | `+1000 $ @Checking`             | Receive from another account         |
| **Budgeted Transfer** | `-1000 $ @Brokerage &Investing` | Transfer to untracked with category  |
| **Swap**              | `-1000 $ +6.5 AAPL`              | Swap commodities within an account   |

**Examples:**

```text
@Checking
  2026-01-15 +3000 $ &Job:Salary              ; payday
  2026-01-16 -100 $ &Groceries #traderjoes    ; expense with tag
  2026-01-20 -1000 $ @Brokerage &Investing    ; transfer to investment
  2026-01-25 -100 $ @Maybank                  ; cross-currency driver
```

### 3.5 Advanced Logic

#### Multi-Currency/Asset Swaps

Within an account, swap one commodity for another using a single line with two amounts:

```text
@Brokerage
  ; Buying stock: cash out, shares in (swap)
  2026-01-21 -1000 $ +6.5 AAPL

  ; Selling stock: shares out, cash in (swap)
  2026-02-15 -5 AAPL +800 $
```

#### Cross-Currency Transfers

For transfers between accounts with different currencies, record the initiating side as a normal transfer. On the receiving side, prefer an (optionally unverified) balance assertion for reconciliation.

```text
@Checking
  2026-01-25 -100 $ @Maybank                  ; driver: USD out

@Maybank
  ? 2026-01-26 == 1670 RM                     ; 1200 + 470 from @Checking 2026-01-25 -100 $
```

#### Assertions

Check balance at a specific point in time:

```text
@Checking
  2026-01-31 == 6800 $                        ; reconciliation check
```

#### Unverified Entries

Use `?` to mark unverified ledger entries. Put it at the very start of the line so it’s visually obvious. Users should verify and remove the `?` once confirmed:

```text
@Maybank
  ? 2026-01-25 == 1670 RM                     ; needs verification
  2026-01-25 == 1670 RM                       ; verified (? removed)
```

### 3.6 Budgeting

Budgeting is an optional overlay using the `>>> BUDGET` section.

```text
>>> BUDGET
2026-01
  &Groceries 500 $
  &Investing 1000 $
```

**Logic:**
- Categories fill via BUDGET section allocations
- Categories drain via LEDGER transactions to matching `&Category`
- **Rollover:** Implicit (Total Allocated - Total Spent)
- Allocations can be negative (to reallocate from one category to another)

## 4. Grammar (Informal)

```
file            = section*
section         = ">>>" SECTION_NAME NEWLINE block*

; META section
meta_line       = "default:" COMMODITY
                | "commodity:" COMMODITY
                | "alias:" SYMBOL "=" COMMODITY
                | "budget:" account_list
                | "no-budget:" account_list
account_list    = account ("," account)*

; START section (declarative balances)
start_block     = DATE NEWLINE start_entry*
start_entry     = INDENT account amount+    ; multiple amounts for semantic grouping

; BUDGET section
budget_block    = YEAR_MONTH NEWLINE budget_entry*
budget_entry    = INDENT category amount

; LEDGER section
ledger_block    = account NEWLINE ledger_entry*
ledger_entry    = INDENT unverified? DATE (transaction | assertion) comment?
unverified      = "?"                        ; unverified marker

; Transaction: canonical order enforced
transaction     = amount (target | amount) category? tag*

; Assertion: balance check
assertion       = "==" amount

; Shared primitives
amount          = SIGN? SYMBOL? NUMBER SYMBOL? COMMODITY?
target          = account | category
account         = "@" IDENTIFIER (":" IDENTIFIER)*
category        = "&" IDENTIFIER (":" IDENTIFIER)*
tag             = "#" IDENTIFIER
comment         = ";" TEXT
```

## 5. Validation Rules

### 5.1 Transaction Requirements

| Rule | Description |
|------|-------------|
| **V001** | Every transaction requires: amount, then a target (`@Account`, `&Category`, or an amount for swaps) |
| **V002** | Commodity must be declared in META (via `commodity:` or `alias:`) |
| **V003** | Amount must be a valid number |
| **V004** | Date must be valid (YYYY-MM-DD format) |
| **V005** | Components must follow canonical order: amount, target, category, tags |
| **V006** | Optional category is only valid when target is an account (no double categorization) |
| **V007** | Swap transactions use a second amount as the “target”; category is not allowed (warning) |

### 5.2 Reference Validation

| Rule | Description |
|------|-------------|
| **V010** | Referenced accounts must exist (declared in START or LEDGER) |
| **V011** | Referenced categories should exist in BUDGET (warning if not) |
| **V012** | Referenced commodities must be declared in META |

### 5.3 Budget Validation

| Rule | Description |
|------|-------------|
| **V020** | Category names form a single namespace across BUDGET and LEDGER |
| **V021** | Transfers FROM budget accounts TO no-budget accounts require a category |
| **V022** | Unallocated budget (income minus total allocations) should not be negative per period (warning) |

### 5.4 Assertion Validation

| Rule | Description |
|------|-------------|
| **V030** | `==` assertions must match computed balance at that point |

### 5.5 Structural Validation

| Rule | Description |
|------|-------------|
| **V040** | START entries require: account, amount |
| **V041** | BUDGET entries require: category, amount |
| **V042** | Dates within an account block should be chronological (warning, not error) |

## 6. Semantic Rules

1. **Balance Equation:** Assets = Liabilities + Equity + (Income - Expenses)
2. **Account Context:** Entries under an `@Account` block operate on that account
3. **Implicit Counterparty:** Single-entry style implies counterparty from context
4. **Hierarchical Aggregation:** Parent accounts/categories aggregate child values

## 7. Error Types

| Code   | Category        | Description                                    |
|--------|-----------------|------------------------------------------------|
| E001   | Syntax          | Invalid token or unexpected character          |
| E002   | Syntax          | Malformed amount (bad number format)           |
| E003   | Syntax          | Invalid date format                            |
| E004   | Syntax          | Missing required transaction component         |
| E005   | Reference       | Unknown account reference                       |
| E006   | Reference       | Unknown category reference                      |
| E007   | Reference       | Unknown commodity                               |
| E008   | Validation      | Assertion failed (balance mismatch)             |
| E009   | Syntax          | Invalid component order in transaction          |
| E010   | Validation      | Transfer to no-budget account missing category  |
| W003   | Warning         | Unverified entry (`?`) needs user confirmation  |
| W001   | Warning         | Non-chronological dates in account block        |
| W002   | Warning         | Expense category not in budget                  |

---

## Changelog

| Version | Date       | Changes                                                      |
|---------|------------|--------------------------------------------------------------|
| 0.1.0   | 2026-01-01 | Initial specification                                        |
| 0.2.0   | 2026-01-02 | Simplified syntax: +/- signs only, canonical order, & for categories, # for tags, declarative START |
| 0.2.1   | 2026-01-02 | Added `?` unverified entry marker                            |
| 0.2.2   | 2026-01-02 | Make `?` a line prefix; allow inline swaps via second amount  |
| 0.2.3   | 2026-01-02 | START entries support multiple amounts per line               |
