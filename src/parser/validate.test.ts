import dedent from "dedent";
import { describe, expect, it } from "vitest";
import { parse } from "./parser";

function parseSource(source: string) {
	return parse(source);
}

describe("validation", () => {
	it("detects unknown commodity", () => {
		const source = dedent`
			>>> META
			commodity: USD
			  
			>>> LEDGER  
			@Checking  
			  2026-01-01 -100 EUR &Food
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "UnknownEntityError",
				message: "Unknown commodity: 'EUR'",
			}),
		);
	});

	it("detects unknown commodity in budget", () => {
		const source = dedent`
			>>> META 
			commodity: USD 

			>>> BUDGET
			2026-01 
			  &Food 100 EUR 
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "UnknownEntityError",
				message: "Unknown commodity: 'EUR'",
			}),
		);
	});

	it("detects unknown commodity in swap target", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> LEDGER
			@Checking
			  2026-01-01 -1000 USD +10 UNKNOWN
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "UnknownEntityError",
				message: "Unknown commodity: 'UNKNOWN'",
			}),
		);
	});

	it("warns when expense category is not in budget", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> BUDGET 
			2026-01 
			  &Food 100 USD 

			>>> LEDGER
			@Checking
			  2026-01-01 -10 USD &Unknown
		`;
		const result = parseSource(source);
		expect(result.warnings).toContainEqual(
			expect.objectContaining({
				name: "UnbudgetedCategoryWarning",
				message: "Expense category not in budget: '&Unknown'",
			}),
		);
	});

	it("no warning when expense category exactly matches budget", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> BUDGET
			2026-01
			  &Food 100 USD

			>>> LEDGER
			@Checking
			  2026-01-01 -10 USD &Food
		`;
		const result = parseSource(source);
		expect(result.warnings).toHaveLength(0);
	});

	it("no warning when expense sub-category has budgeted ancestor", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> BUDGET
			2026-01
			  &Food 100 USD

			>>> LEDGER
			@Checking
			  2026-01-01 -10 USD &Food:Groceries
			  2026-01-02 -5 USD &Food:Dining:Restaurants
		`;
		const result = parseSource(source);
		expect(result.warnings).toHaveLength(0);
	});

	it("detects transfer to untracked account missing category", () => {
		const source = dedent`
			>>> META
			commodity: USD
			untracked: @Brokerage

			>>> LEDGER
			@Checking
			  2026-01-01 -1000 USD @Brokerage
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "MissingCategoryError",
				message: "Transfer to untracked account missing category",
			}),
		);
	});

	it("allows transfer to untracked account with category", () => {
		const source = dedent`
			>>> META
			commodity: USD
			untracked: @Brokerage

			>>> BUDGET
			2026-01
			  &Investments 1000 USD

			>>> LEDGER
			@Checking
			  2026-01-01 -1000 USD @Brokerage &Investments
		`;
		const result = parseSource(source);
		expect(result.errors).toHaveLength(0);
	});

	it("warns on non-chronological dates", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> LEDGER
			@Checking
			  2026-01-02 -10 USD &Food
			  2026-01-01 -10 USD &Food
		`;
		const result = parseSource(source);
		expect(result.warnings).toContainEqual(
			expect.objectContaining({
				name: "NonChronologicalWarning",
				message: "Non-chronological dates in account block",
			}),
		);
	});

	it("warns on assertion failure", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> LEDGER
			@Checking
			  2026-01-01 +100 USD &Opening
			  2026-01-02 == 200 USD
		`;
		const result = parseSource(source);
		expect(result.warnings).toContainEqual(
			expect.objectContaining({
				name: "AssertionFailedWarning",
				message: "Assertion failed: expected 200 USD, got 100 USD",
			}),
		);
	});

	it("ignores unverified assertion failure", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> LEDGER
			@Checking
			  2026-01-01 +100 USD &Opening
			  ? 2026-01-02 == 200 USD
		`;
		const result = parseSource(source);
		expect(result.errors).toHaveLength(0);
	});

	it("detects trunk account used as block header", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> LEDGER
			@Bank
			  2026-01-01 +100 USD &Opening

			@Bank:Savings
			  2026-01-01 +200 USD &Opening
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "TrunkEntityError",
				message: "Cannot use account '@Bank' directly; it has sub-accounts",
			}),
		);
	});

	it("detects trunk account used as transfer target", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> LEDGER
			@Checking
			  2026-01-01 +1000 USD &Opening
			  2026-01-02 -100 USD @Bank

			@Bank:Savings
			  2026-01-01 +200 USD &Opening
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "TrunkEntityError",
				message: "Cannot use account '@Bank' directly; it has sub-accounts",
			}),
		);
	});

	it("detects trunk category used in transaction", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> LEDGER
			@Checking
			  2026-01-01 -50 USD &Food
			  2026-01-02 -20 USD &Food:Groceries
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "TrunkEntityError",
				message: "Cannot use category '&Food' directly; it has sub-categories",
			}),
		);
	});

	it("detects trunk category used in budget", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> BUDGET
			2026-01
			  &Food 500 USD
			  &Food:Groceries 300 USD
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "TrunkEntityError",
				message: "Cannot use category '&Food' directly; it has sub-categories",
			}),
		);
	});

	it("allows leaf-only accounts and categories", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> BUDGET
			2026-01
			  &Food:Groceries 300 USD
			  &Food:DiningOut 200 USD

			>>> LEDGER
			@Bank:Checking
			  2026-01-01 +1000 USD &Opening
			  2026-01-02 -50 USD &Food:Groceries

			@Bank:Savings
			  2026-01-01 +500 USD &Opening
		`;
		const result = parseSource(source);
		expect(result.errors).toHaveLength(0);
	});

	it("detects trunk category on transfer target", () => {
		const source = dedent`
			>>> META
			commodity: USD
			untracked: @Brokerage

			>>> LEDGER
			@Checking
			  2026-01-01 -1000 USD @Brokerage &Invest
			  2026-01-02 -500 USD @Brokerage &Invest:Stocks
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "TrunkEntityError",
				message:
					"Cannot use category '&Invest' directly; it has sub-categories",
			}),
		);
	});

	it("matches untracked account with wildcard prefix", () => {
		const source = dedent`
			>>> META
			commodity: USD
			untracked: @Brokerage:*

			>>> LEDGER
			@Checking
			  2026-01-01 -1000 USD @Brokerage:Stocks &Investing
		`;
		const result = parseSource(source);
		// No error for missing category since @Brokerage:Stocks matches @Brokerage:*
		expect(result.errors).toHaveLength(0);
	});

	it("matches exact prefix account with wildcard pattern", () => {
		const source = dedent`
			>>> META
			commodity: USD
			untracked: @Brokerage:*

			>>> LEDGER
			@Checking
			  2026-01-01 -1000 USD @Brokerage &Investing
		`;
		const result = parseSource(source);
		// @Brokerage exactly matches prefix of @Brokerage:*
		expect(result.errors).toHaveLength(0);
	});

	it("warns on unverified entry", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> LEDGER
			@Checking
			  ? 2026-01-01 +100 USD &Opening
		`;
		const result = parseSource(source);
		expect(result.warnings).toContainEqual(
			expect.objectContaining({
				name: "UnverifiedEntryWarning",
				message: "Unverified entry needs user confirmation",
			}),
		);
	});
});

describe("syntax errors", () => {
	it("flags invalid account names", () => {
		const source = dedent`
			>>> LEDGER
			@
			  2026-01-01 +100 USD &Food
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "InvalidEntryError",
				message: "Expected account name after '@'",
			}),
		);
	});

	it("handles hierarchical name with trailing colon", () => {
		const source = dedent`
			>>> LEDGER
			@Account:
			  2026-01-01 +100 USD &Food
		`;
		const result = parseSource(source);
		// Should parse @Account (stops at colon followed by non-identifier)
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it("InvalidDirectiveError for missing commodity name", () => {
		const source = dedent`
			>>> META
			commodity:
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "InvalidDirectiveError",
				message: "Expected commodity name",
			}),
		);
	});

	it("InvalidEntryError for missing amount after date", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> LEDGER
			@Checking
			  2026-01-01
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "InvalidEntryError",
				message: "Expected amount",
			}),
		);
	});

	it("InvalidEntryError for unexpected character in entry", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> LEDGER
			@Checking
			  !invalid
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "InvalidEntryError",
			}),
		);
	});

	it("InvalidSectionError for unknown section", () => {
		const source = dedent`>>> UNKNOWN`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "InvalidSectionError",
				message: "Unknown section 'UNKNOWN'",
			}),
		);
	});

	it("InvalidSectionError for content before section", () => {
		const source = dedent`
			some content
			>>> META
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "InvalidSectionError",
				message: "Content before section marker",
			}),
		);
	});

	it("InvalidDirectiveError for missing colon", () => {
		const source = dedent`
			>>> META
			commodity USD
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "InvalidDirectiveError",
				message: "Expected ':'",
			}),
		);
	});

	it("InvalidDirectiveError for unknown directive", () => {
		const source = dedent`
			>>> META
			unknown: value
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "InvalidDirectiveError",
				message: "Unknown directive 'unknown'",
			}),
		);
	});

	it("InvalidEntryError for entry before account header", () => {
		const source = dedent`
			>>> LEDGER
			2026-01-01 -100 USD &Food
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "InvalidEntryError",
				message: "Entry before account header",
			}),
		);
	});

	it("InvalidEntryError for missing target", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> LEDGER
			@Checking
			  2026-01-01 -100 USD
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "InvalidEntryError",
			}),
		);
	});

	it("InvalidEntryError for invalid date format", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> LEDGER
			@Checking
			  01-01-2026 -100 USD &Food
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "InvalidEntryError",
			}),
		);
	});

	it("InvalidEntryError for invalid category target", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> LEDGER
			@Checking
			  2026-02-01 -100 USD &
		`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "InvalidEntryError",
				message: "Expected category name after '&'",
			}),
		);
	});

	it("Missing category for transfers is not a syntax error", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> LEDGER
			@Checking
			  2026-02-01 -100 USD @Brokerage
		`;
		const result = parseSource(source);
		expect(result.errors).toHaveLength(0);
	});
});
