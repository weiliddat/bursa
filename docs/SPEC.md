# Bursa Language Specification

> Version: 0.1.0 (Draft)
> Last Updated: 2026-01-01

## 1. Core Philosophy

- **Minimalist & Human-Readable:** The file must be easy to read and edit manually.
- **Implicit Double-Entry:** The user writes single-entry style transactions (e.g., "Spent 50 on Groceries"), but the system compiles them into a rigorous double-entry graph under the hood.
- **Unified Flow:** Every transaction is a vector from a **Driver** (Source) to a **Destination** (Sink/Receiver).

## 2. File Format

For the prototype, we use a single text file divided into sections using `>>> [SECTION_NAME]`.

### Sections

| Section     | Purpose                                           |
|-------------|---------------------------------------------------|
| `>>> META`  | Config (commodities, aliases, account properties) |
| `>>> START` | Opening balances (Snapshot)                       |
| `>>> BUDGET`| Envelope allocations                              |
| `>>> LEDGER`| The transaction log                               |

## 3. Syntax Specification

### 3.1 General Syntax

| Feature          | Rule                                                                 |
|------------------|----------------------------------------------------------------------|
| **Comments**     | Any text following `;` is ignored                                    |
| **Aliases**      | Symbols mapped to ISO codes in META (e.g., `$` → `USD`)              |
| **Number Format**| Currency symbols before OR after number (e.g., `$500` or `500$`)     |
| **Sign Placement**| Sign must be at very start (e.g., `-$500`, `-500$`, `+RM50`)        |

### 3.2 META Directives

| Directive      | Syntax                          | Description                                      |
|----------------|---------------------------------|--------------------------------------------------|
| `default`      | `default: USD`                  | Default commodity when none specified            |
| `commodity`    | `commodity: AAPL`               | Declare a valid commodity (for validation)       |
| `alias`        | `alias: $ = USD`                | Map symbol to commodity                          |
| `budget`       | `budget: @Checking, @Savings`   | Accounts tracked in budget envelopes             |
| `no-budget`    | `no-budget: @Brokerage`         | Accounts excluded from budget tracking           |

**Commodity Declaration:**
- All commodities used in the file should be declared in META
- Aliases implicitly declare both the symbol and the commodity
- Unknown commodities in transactions will produce warnings

**Budget Tracking:**
- By default, all accounts are budget-tracked
- Use `no-budget:` to exclude investment/asset accounts from envelope tracking
- OR use `budget:` to explicitly list only budget-tracked accounts (opt-in mode)
- Transfers FROM budget accounts TO no-budget accounts drain envelopes (money left the budget system)
- Transfers FROM no-budget accounts don't affect envelopes

### 3.3 Entities

| Prefix | Entity Type | Description                              | Examples                  |
|--------|-------------|------------------------------------------|---------------------------|
| `@`    | Account     | Places where assets sit                  | `@Checking`, `@Visa`      |
| `#`    | Category    | Income/Expense gateways                  | `#Groceries`, `#Job`      |
| (none) | Commodity   | Standard currencies or assets            | `USD`, `EUR`, `AAPL`      |

**Category Usage:**
Categories (`#`) can appear in two positions:
1. **As flow target**: `-50.00 > #Groceries` — the transaction flows to/from the category
2. **On transfers**: `-1000 > @Brokerage #Investing` — associates transfer with category for budget tracking

Both reference the same category namespace.

### 3.4 Transaction Vectors

The flow direction is explicit:
- `>` = Outflow (Driver pushes to destination)
- `<` = Inflow (Driver receives from source)

| Type             | Syntax                        | Flow Description           |
|------------------|-------------------------------|----------------------------|
| **Expense**      | `-50.00 > #Groceries`         | Asset → Category           |
| **Income**       | `+3000.00 < #Job`             | Category → Asset           |
| **Transfer Out** | `-1000.00 > @Savings`         | Asset → Asset              |
| **Transfer In**  | `+1000.00 < @Checking`        | Asset → Asset (receiver)   |
| **Liability Pay**| `-500.00 > @Visa`             | Asset → Liability          |

**Flexible Ordering:**
Transaction components (amount, direction, target, category) can appear in any order after the date:

```text
@Checking
  2026-01-15 +$3000.00 < #Job:Salary          ; standard order
  2026-01-16 -100.00 $ > #Groceries           ; amount first
  2026-01-20 -$1000.00 #Investing > @Brokerage ; category before target
  2026-01-20 -$1000.00 > @Savings             ; no category
```

### 3.5 Advanced Logic

#### Multi-Currency/Asset Swaps

```text
; Buying Stock (inside @Brokerage context)
-1500 $ > 10 AAPL

; Selling Stock
+800 $ < 5 AAPL
```

#### Verification (Matching Flows)

```text
; Driver creates the flow (in @Checking)
-100 $ > @Savings

; Receiver verifies/matches the flow (in @Savings)
= +100 $ < @Checking
```

#### Cross-Currency Verification

```text
; Driver sends USD (in @Checking)
-100 $ > @Maybank

; Receiver verifies with conversion (in @Maybank)
= +RM470 < @Checking (-100 $)
```

#### Assertions

```text
; Check balance at specific point in time
== 5000.00
```

### 3.6 Budgeting (Envelope System)

Budgeting is an optional overlay using the `>>> BUDGET` section.

```text
>>> BUDGET
2026-01
  #Groceries +500.00
  #Investments +1000.00
```

**Logic:**
- Envelopes fill via BUDGET section allocations
- Envelopes drain via LEDGER transactions tagged with matching `#Category`
- **Rollover:** Implicit (Total Allocated - Total Spent)

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

; START section  
start_block     = DATE NEWLINE start_entry*
start_entry     = INDENT amount "<" category ">" account

; BUDGET section
budget_block    = YEAR_MONTH NEWLINE budget_entry*
budget_entry    = INDENT category amount

; LEDGER section
ledger_block    = account NEWLINE ledger_entry*
ledger_entry    = INDENT DATE (transaction | assertion | verification) comment?

; Transaction: regular income/expense/transfer
; Components can appear in any order after date
; Required: amount, flow_direction, target
; Optional: category (for budget tracking)
transaction     = (amount | flow_direction | target | category)+
                ; must contain exactly one amount, one direction, one target

; Assertion: balance check at a point in time
assertion       = "==" amount

; Verification: confirms receiving side of a transfer
verification    = "=" amount flow_direction account conversion?
conversion      = "(" amount ")"

; Shared primitives
amount          = SIGN? SYMBOL? NUMBER SYMBOL? COMMODITY?
flow_direction  = ">" | "<"
target          = account | category | swap_target
swap_target     = NUMBER COMMODITY
account         = "@" IDENTIFIER (":" IDENTIFIER)*
category        = "#" IDENTIFIER (":" IDENTIFIER)*
comment         = ";" TEXT
```

## 5. Validation Rules

### 5.1 Transaction Requirements

| Rule | Description |
|------|-------------|
| **V001** | Every transaction requires: amount, flow direction, target |
| **V002** | Commodity must be declared in META (via `commodity:` or `alias:`) |
| **V003** | Amount must be a valid number |
| **V004** | Date must be valid (YYYY-MM-DD format) |

### 5.2 Reference Validation

| Rule | Description |
|------|-------------|
| **V010** | Referenced accounts must exist (declared in START or LEDGER) |
| **V011** | Referenced categories must exist (used in BUDGET or as expense target) |
| **V012** | Referenced commodities must be declared in META |

### 5.3 Budget Validation

| Rule | Description |
|------|-------------|
| **V020** | Expense categories and budget envelope names share the same namespace |
| **V021** | Transfers FROM budget accounts TO no-budget accounts require a category |

### 5.4 Assertion Validation

| Rule | Description |
|------|-------------|
| **V030** | `==` assertions must match computed balance at that point |
| **V031** | `=` verifications must match a corresponding driver transaction |

### 5.5 Structural Validation

| Rule | Description |
|------|-------------|
| **V040** | START entries require: amount, source category, destination account |
| **V041** | BUDGET entries require: category, amount |
| **V042** | Dates within an account block should be chronological (warning, not error) |

## 6. Semantic Rules

1. **Balance Equation:** Assets = Liabilities + Equity + (Income - Expenses)
2. **Account Context:** Entries under an `@Account` block operate on that account
3. **Implicit Counterparty:** Single-entry style implies counterparty from context
4. **Verification Matching:** `=` entries must match a corresponding driver entry

## 7. Error Types

| Code   | Category        | Description                                    |
|--------|-----------------|------------------------------------------------|
| E001   | Syntax          | Invalid token or unexpected character          |
| E002   | Syntax          | Malformed amount (bad number format)           |
| E003   | Syntax          | Invalid date format                            |
| E004   | Syntax          | Missing required transaction component         |
| E005   | Reference       | Unknown account reference                      |
| E006   | Reference       | Unknown category reference                     |
| E007   | Reference       | Unknown commodity                              |
| E008   | Validation      | Assertion failed (balance mismatch)            |
| E009   | Validation      | Verification failed (unmatched transfer)       |
| E010   | Validation      | Transfer to no-budget account missing category |
| W001   | Warning         | Non-chronological dates in account block       |
| W002   | Warning         | Expense category not in budget                 |

---

## Changelog

| Version | Date       | Changes                    |
|---------|------------|----------------------------|
| 0.1.0   | 2026-01-01 | Initial specification      |
