import { describe, expect, it } from "vitest";
import { parse } from "./parser";

function parseSource(source: string) {
	return parse(source);
}

describe("validation", () => {
	it("detects unknown commodity (E007)", () => {
		const source = `
>>> META
commodity: USD

>>> LEDGER
@Checking
  2026-01-01 -100 EUR &Food
`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				code: "E007",
				message: "Unknown commodity: 'EUR'",
			}),
		);
	});

	it("warns when expense category is not in budget (W002)", () => {
		const source = `
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
				code: "W002",
				message: "Expense category not in budget: '&Unknown'",
			}),
		);
	});

	it("no warning when expense category exactly matches budget (W002)", () => {
		const source = `
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

	it("no warning when expense sub-category has budgeted ancestor (W002)", () => {
		const source = `
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

	it("detects transfer to untracked account missing category (E010)", () => {
		const source = `
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
				code: "E010",
				message: "Transfer to untracked account missing category",
			}),
		);
	});

	it("allows transfer to untracked account with category", () => {
		const source = `
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

	it("warns on non-chronological dates (W001)", () => {
		const source = `
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
				code: "W001",
				message: "Non-chronological dates in account block",
			}),
		);
	});

	it("detects assertion failure (E008)", () => {
		const source = `
>>> META
commodity: USD

>>> LEDGER
@Checking
  2026-01-01 +100 USD &Opening
  2026-01-02 == 200 USD
`;
		const result = parseSource(source);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				code: "E008",
				message: "Assertion failed: expected 200 USD, got 100 USD",
			}),
		);
	});

	it("ignores unverified assertion failure", () => {
		const source = `
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

	it("detects trunk account used as block header (E012)", () => {
		const source = `
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
				code: "E012",
				message: "Cannot use account '@Bank' directly; it has sub-accounts",
			}),
		);
	});

	it("detects trunk account used as transfer target (E012)", () => {
		const source = `
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
				code: "E012",
				message: "Cannot use account '@Bank' directly; it has sub-accounts",
			}),
		);
	});

	it("detects trunk category used in transaction (E012)", () => {
		const source = `
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
				code: "E012",
				message: "Cannot use category '&Food' directly; it has sub-categories",
			}),
		);
	});

	it("detects trunk category used in budget (E012)", () => {
		const source = `
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
				code: "E012",
				message: "Cannot use category '&Food' directly; it has sub-categories",
			}),
		);
	});

	it("allows leaf-only accounts and categories", () => {
		const source = `
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
});
