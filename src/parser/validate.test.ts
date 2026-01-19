import dedent from "dedent";
import { describe, expect, it } from "vitest";

import { parse } from "./parser";

describe("validation", () => {
	it("detects unknown commodity", () => {
		const source = dedent`
			>>> META
			commodity: USD
			  
			>>> LEDGER  
			@Checking  
			  2026-01-01 -100 EUR &Food
		`;
		const result = parse(source);
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
		const result = parse(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "UnknownEntityError",
				message: "Unknown commodity: 'EUR'",
			}),
		);
		expect(result.warnings).toEqual([]);
	});

	it("detects unknown commodity in swap target", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> LEDGER
			@Checking
			  2026-01-01 -1000 USD +10 UNKNOWN
		`;
		const result = parse(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "UnknownEntityError",
				message: "Unknown commodity: 'UNKNOWN'",
			}),
		);
		expect(result.warnings).toEqual([]);
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
		const result = parse(source);
		expect(result.errors).toEqual([]);
		expect(result.warnings).toContainEqual(
			expect.objectContaining({
				name: "UnbudgetedCategoryWarning",
				message: "Expense category not in budget: '&Unknown'",
			}),
		);
	});

	it("no warning when expense categories are all leaves", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> BUDGET
			2026-01
			  &Utilities 50 USD
			  &Food:Groceries 80 USD
			  &Food:Dining 20 USD

			>>> LEDGER
			@Checking
			  2026-01-01 -10 USD &Utilities
			  2026-01-02 -10 USD &Food:Groceries
			  2026-01-03 -5 USD &Food:Dining
		`;
		const result = parse(source);
		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([]);
	});

	it("warns when transaction uses sub-category not in budget", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> BUDGET
			2026-01
			  &Food 100 USD

			>>> LEDGER
			@Checking
			  2026-01-01 -10 USD &Food:Groceries
		`;
		const result = parse(source);
		expect(result.errors).toEqual([]);
		expect(result.warnings).toContainEqual(
			expect.objectContaining({
				name: "UnbudgetedCategoryWarning",
				message: "Expense category not in budget: '&Food:Groceries'",
			}),
		);
	});

	it("detects transfer to untracked account missing category", () => {
		const source = dedent`
			>>> META
			commodity: USD
			untracked: @Brokerage

			>>> LEDGER
			@Checking
			  2026-01-01 -1000 USD @Brokerage

			@Brokerage
		`;
		const result = parse(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "MissingCategoryError",
				message: "Transfer to untracked account missing category",
			}),
		);
		expect(result.warnings).toEqual([]);
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

			@Brokerage
		`;
		const result = parse(source);
		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([]);
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
		const result = parse(source);
		expect(result.errors).toEqual([]);
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
		const result = parse(source);
		expect(result.errors).toEqual([]);
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

			>>> BUDGET
			2026-01
			  &Opening 100 USD

			>>> LEDGER
			@Checking
			  2026-01-01 +100 USD &Opening
			  ? 2026-01-02 == 200 USD
		`;
		const result = parse(source);
		expect(result.errors).toEqual([]);
		expect(result.warnings).not.toContainEqual(
			expect.objectContaining({ name: "AssertionFailedWarning" }),
		);
	});

	it("detects trunk account used as block header", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> BUDGET
			2026-01
			  &Opening 300 USD

			>>> LEDGER
			@Bank
			  2026-01-01 +100 USD &Opening

			@Bank:Savings
			  2026-01-01 +200 USD &Opening
		`;
		const result = parse(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "TrunkEntityError",
				message: "Cannot use account '@Bank' directly; it has sub-accounts",
			}),
		);
		expect(result.warnings).toEqual([]);
	});

	it("detects unknown account used as transfer target", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> BUDGET
			2026-01
			  &Opening 1000 USD

			>>> LEDGER
			@Checking
			  2026-01-01 +1000 USD &Opening
			  2026-01-02 -100 USD @Unknown
		`;
		const result = parse(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "UnknownEntityError",
				message: "Unknown account: '@Unknown'",
			}),
		);
		expect(result.warnings).toEqual([]);
	});

	it("warns for unbudgeted categories in transaction", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> LEDGER
			@Checking
			  2026-01-01 -50 USD &Food
			  2026-01-02 -20 USD &Food:Groceries
		`;
		const result = parse(source);
		expect(result.errors).toEqual([]);
		expect(result.warnings).toContainEqual(
			expect.objectContaining({
				name: "UnbudgetedCategoryWarning",
				message: "Expense category not in budget: '&Food'",
			}),
		);
		expect(result.warnings).toContainEqual(
			expect.objectContaining({
				name: "UnbudgetedCategoryWarning",
				message: "Expense category not in budget: '&Food:Groceries'",
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
		const result = parse(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "TrunkEntityError",
				message: "Cannot use category '&Food' directly; it has sub-categories",
			}),
		);
		expect(result.warnings).toEqual([]);
	});

	it("detects trunk category used in ledger category target", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> BUDGET
			2026-01
			  &Food:Groceries 300 USD

			>>> LEDGER
			@Checking
			  2026-01-01 -50 USD &Food
		`;
		const result = parse(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "TrunkEntityError",
				message: "Cannot use category '&Food' directly; it has sub-categories",
			}),
		);
		expect(result.warnings).not.toContainEqual(
			expect.objectContaining({
				name: "UnbudgetedCategoryWarning",
				message: "Expense category not in budget: '&Food'",
			}),
		);
	});

	it("detects trunk category used in ledger account target", () => {
		const source = dedent`
			>>> META
			commodity: USD
			untracked: @Brokerage

			>>> BUDGET
			2026-01
			  &Invest:Stocks 500 USD

			>>> LEDGER
			@Checking
			  2026-01-01 -1000 USD @Brokerage &Invest

			@Brokerage
		`;
		const result = parse(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				name: "TrunkEntityError",
				message:
					"Cannot use category '&Invest' directly; it has sub-categories",
			}),
		);
		expect(result.warnings).not.toContainEqual(
			expect.objectContaining({
				name: "UnbudgetedCategoryWarning",
				message: "Expense category not in budget: '&Invest'",
			}),
		);
	});

	it("warns for unbudgeted category on transfer target", () => {
		const source = dedent`
			>>> META
			commodity: USD
			untracked: @Brokerage

			>>> LEDGER
			@Checking
			  2026-01-01 -1000 USD @Brokerage &Invest

			@Brokerage
		`;
		const result = parse(source);
		expect(result.errors).toEqual([]);
		expect(result.warnings).toContainEqual(
			expect.objectContaining({
				name: "UnbudgetedCategoryWarning",
				message: "Expense category not in budget: '&Invest'",
			}),
		);
	});

	it("matches untracked account with wildcard prefix", () => {
		const source = dedent`
			>>> META
			commodity: USD
			untracked: @Brokerage:*

			>>> BUDGET
			2026-01
			  &Investing 1000 USD

			>>> LEDGER
			@Checking
			  2026-01-01 -1000 USD @Brokerage:Stocks &Investing

			@Brokerage:Stocks
		`;
		const result = parse(source);
		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([]);
	});

	it("matches exact prefix account with wildcard pattern", () => {
		const source = dedent`
			>>> META
			commodity: USD
			untracked: @Brokerage:*

			>>> BUDGET
			2026-01
			  &Investing 1000 USD

			>>> LEDGER
			@Checking
			  2026-01-01 -1000 USD @Brokerage &Investing

			@Brokerage
		`;
		const result = parse(source);
		expect(result.errors).toEqual([]);
		expect(result.warnings).toEqual([]);
	});

	it("warns on unverified entry", () => {
		const source = dedent`
			>>> META
			commodity: USD

			>>> LEDGER
			@Checking
			  ? 2026-01-01 +100 USD &Opening
		`;
		const result = parse(source);
		expect(result.errors).toEqual([]);
		expect(result.warnings).toContainEqual(
			expect.objectContaining({
				name: "UnverifiedEntryWarning",
				message: "Unverified entry needs user confirmation",
			}),
		);
	});
});
