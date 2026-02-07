import dedent from "dedent";
import { describe, expect, it } from "vitest";

import { parse } from "../parser";
import { computeBalances } from "./balances";

function bal(source: string, asOfDate?: string) {
	const result = parse(source);
	expect(result.errors).toEqual([]);
	return computeBalances(result.data, asOfDate);
}

describe("computeBalances", () => {
	it("computes account balances across multiple accounts", () => {
		const b = bal(dedent`
			>>> META
			commodity: $ = USD

			>>> LEDGER
			@Checking
			  2026-01-01 +5000 $ &Unassigned
			@Savings
			  2026-01-01 +3000 $ &Unassigned
		`);
		expect(b.accounts.get("@Checking")?.get("USD")).toBe(5000);
		expect(b.accounts.get("@Savings")?.get("USD")).toBe(3000);
	});

	it("computes transfer recorded on sending account", () => {
		const b = bal(dedent`
			>>> META
			commodity: $ = USD

			>>> LEDGER
			@Checking
			  2026-01-01 +5000 $ &Unassigned
			  2026-01-15 -1000 $ @Savings
			@Savings
			  2026-01-01 +0 $ &Unassigned
		`);
		expect(b.accounts.get("@Checking")?.get("USD")).toBe(4000);
		expect(b.accounts.get("@Savings")?.get("USD")).toBe(1000);
	});

	it("computes transfer recorded on receiving account", () => {
		const b = bal(dedent`
			>>> META
			commodity: $ = USD

			>>> LEDGER
			@Checking
			  2026-01-01 +5000 $ &Unassigned
			@Savings
			  2026-01-01 +0 $ &Unassigned
			  2026-01-15 +1000 $ @Checking
		`);
		expect(b.accounts.get("@Checking")?.get("USD")).toBe(4000);
		expect(b.accounts.get("@Savings")?.get("USD")).toBe(1000);
	});

	it("computes cross-currency transfer", () => {
		const b = bal(dedent`
			>>> META
			commodity: $ = USD
			commodity: RM = MYR

			>>> LEDGER
			@Checking
			  2026-01-01 +5000 $ &Unassigned
			  2026-01-25 -100 $ @Maybank
			@Maybank
			  2026-01-01 +1200 RM &Unassigned
		`);
		expect(b.accounts.get("@Checking")?.get("USD")).toBe(4900);
		expect(b.accounts.get("@Maybank")?.get("MYR")).toBe(1200);
		expect(b.accounts.get("@Maybank")?.get("USD")).toBe(100);
	});

	it("computes swap balances within account", () => {
		const b = bal(dedent`
			>>> META
			commodity: $ = USD
			commodity: AAPL

			>>> LEDGER
			@Brokerage
			  2026-01-01 +1000 $ &Unassigned
			  2026-01-21 -1000 $ +6.5 AAPL
		`);
		expect(b.accounts.get("@Brokerage")?.get("USD")).toBe(0);
		expect(b.accounts.get("@Brokerage")?.get("AAPL")).toBe(6.5);
	});

	it("computes multi-commodity account balances", () => {
		const b = bal(dedent`
			>>> META
			commodity: $ = USD
			commodity: € = EUR

			>>> LEDGER
			@Brokerage
			  2026-01-01 +1000 $ &Unassigned
			  2026-01-01 +500 € &Unassigned
		`);
		expect(b.accounts.get("@Brokerage")?.get("USD")).toBe(1000);
		expect(b.accounts.get("@Brokerage")?.get("EUR")).toBe(500);
	});

	it("computes category balances from budget and expenses", () => {
		const b = bal(dedent`
			>>> META
			commodity: $ = USD

			>>> BUDGET
			2026-01
			  &Groceries 500 $
			  &Dining 100 $

			>>> LEDGER
			@Checking
			  2026-01-01 +5000 $ &Unassigned
			  2026-01-16 -100 $ &Groceries
			  2026-01-17 -30 $ &Dining
		`);
		expect(b.categories.get("&Groceries")?.get("USD")).toBe(400);
		expect(b.categories.get("&Dining")?.get("USD")).toBe(70);
	});

	it("computes negative budget reallocation", () => {
		const b = bal(dedent`
			>>> META
			commodity: $ = USD

			>>> BUDGET
			2026-01
			  &Groceries 500 $
			  &Dining 50 $
			  &Groceries -50 $

			>>> LEDGER
			@Checking
			  2026-01-01 +5000 $ &Unassigned
		`);
		expect(b.categories.get("&Groceries")?.get("USD")).toBe(450);
		expect(b.categories.get("&Dining")?.get("USD")).toBe(50);
		expect(b.unassigned.get("USD")).toBe(4500);
	});

	it("computes unassigned balance", () => {
		const b = bal(dedent`
			>>> META
			commodity: $ = USD

			>>> BUDGET
			2026-01
			  &Groceries 500 $

			>>> LEDGER
			@Checking
			  2026-01-01 +5000 $ &Unassigned
			  2026-01-15 +3000 $ &Unassigned
		`);
		expect(b.unassigned.get("USD")).toBe(7500);
	});

	it("computes category balance for transfer to untracked with category", () => {
		const b = bal(dedent`
			>>> META
			commodity: $ = USD
			untracked: @Brokerage

			>>> BUDGET
			2026-01
			  &Investing 1000 $

			>>> LEDGER
			@Checking
			  2026-01-01 +5000 $ &Unassigned
			  2026-01-20 -1000 $ @Brokerage &Investing
			@Brokerage
			  2026-01-01 +1000 $ &Unassigned
		`);
		expect(b.accounts.get("@Checking")?.get("USD")).toBe(4000);
		expect(b.accounts.get("@Brokerage")?.get("USD")).toBe(2000);
		expect(b.categories.get("&Investing")?.get("USD")).toBe(0);
	});

	it("filters transactions by asOfDate", () => {
		const b = bal(
			dedent`
				>>> META
				commodity: $ = USD

				>>> BUDGET
				2026-01
				  &Groceries 500 $

				>>> LEDGER
				@Checking
				  2026-01-01 +5000 $ &Unassigned
				  2026-01-16 -100 $ &Groceries
				  2026-02-01 -200 $ &Groceries
			`,
			"2026-01-31",
		);
		expect(b.accounts.get("@Checking")?.get("USD")).toBe(4900);
		expect(b.categories.get("&Groceries")?.get("USD")).toBe(400);
	});

	it("filters budget periods by asOfDate", () => {
		const b = bal(
			dedent`
				>>> META
				commodity: $ = USD

				>>> BUDGET
				2026-01
				  &Groceries 500 $
				2026-02
				  &Groceries 500 $

				>>> LEDGER
				@Checking
				  2026-01-01 +5000 $ &Unassigned
			`,
			"2026-01-31",
		);
		expect(b.categories.get("&Groceries")?.get("USD")).toBe(500);
		expect(b.unassigned.get("USD")).toBe(4500);
	});

	it("includes all entries when asOfDate is omitted", () => {
		const b = bal(dedent`
			>>> META
			commodity: $ = USD

			>>> BUDGET
			2026-01
			  &Groceries 500 $
			2026-02
			  &Groceries 500 $

			>>> LEDGER
			@Checking
			  2026-01-01 +5000 $ &Unassigned
			  2026-02-01 -200 $ &Groceries
		`);
		expect(b.categories.get("&Groceries")?.get("USD")).toBe(800);
		expect(b.unassigned.get("USD")).toBe(4000);
	});

	it("computes refund to category", () => {
		const b = bal(dedent`
			>>> META
			commodity: $ = USD

			>>> BUDGET
			2026-01
			  &Groceries 500 $

			>>> LEDGER
			@Checking
			  2026-01-01 +5000 $ &Unassigned
			  2026-01-16 -100 $ &Groceries
			  2026-01-17 +50 $ &Groceries
		`);
		expect(b.categories.get("&Groceries")?.get("USD")).toBe(450);
		expect(b.accounts.get("@Checking")?.get("USD")).toBe(4950);
	});

	it("computes reverse swap (sell)", () => {
		const b = bal(dedent`
			>>> META
			commodity: $ = USD
			commodity: AAPL

			>>> LEDGER
			@Brokerage
			  2026-01-01 +10 AAPL &Unassigned
			  2026-02-15 -5 AAPL +800 $
		`);
		expect(b.accounts.get("@Brokerage")?.get("AAPL")).toBe(5);
		expect(b.accounts.get("@Brokerage")?.get("USD")).toBe(800);
	});

	it("computes overspending below zero", () => {
		const b = bal(dedent`
			>>> META
			commodity: $ = USD

			>>> BUDGET
			2026-01
			  &Dining 50 $

			>>> LEDGER
			@Checking
			  2026-01-01 +5000 $ &Unassigned
			  2026-01-10 -30 $ &Dining
			  2026-01-17 -30 $ &Dining
		`);
		expect(b.categories.get("&Dining")?.get("USD")).toBe(-10);
		expect(b.accounts.get("@Checking")?.get("USD")).toBe(4940);
	});

	it("computes transfer to account with &Unassigned category", () => {
		const b = bal(dedent`
			>>> META
			commodity: $ = USD
			untracked: @Brokerage

			>>> LEDGER
			@Checking
			  2026-01-01 +5000 $ &Unassigned
			  2026-01-20 -1000 $ @Brokerage &Unassigned
			@Brokerage
			  2026-01-01 +0 $ &Unassigned
		`);
		expect(b.accounts.get("@Checking")?.get("USD")).toBe(4000);
		expect(b.accounts.get("@Brokerage")?.get("USD")).toBe(1000);
		expect(b.unassigned.get("USD")).toBe(4000);
	});

	it("computes swap with negative second amount", () => {
		// e.g. margin call: pay fee + forfeit shares
		const b = bal(dedent`
			>>> META
			commodity: $ = USD
			commodity: AAPL

			>>> LEDGER
			@Brokerage
			  2026-01-01 +1000 $ &Unassigned
			  2026-01-01 +10 AAPL &Unassigned
			  2026-01-21 -500 $ -2 AAPL
		`);
		expect(b.accounts.get("@Brokerage")?.get("USD")).toBe(500);
		expect(b.accounts.get("@Brokerage")?.get("AAPL")).toBe(8);
	});

	it("ignores assertions", () => {
		const b = bal(dedent`
			>>> META
			commodity: $ = USD

			>>> LEDGER
			@Checking
			  2026-01-01 +5000 $ &Unassigned
			  2026-01-31 == $5000
		`);
		expect(b.accounts.get("@Checking")?.get("USD")).toBe(5000);
	});

	it("computes balances from example.bursa", () => {
		const fs = require("node:fs");
		const source = fs.readFileSync("examples/example.bursa", "utf-8");
		const result = parse(source);
		expect(result.errors).toEqual([]);
		const b = computeBalances(result.data);

		expect(b.accounts.get("@Checking")?.get("USD")).toBe(6800);
		expect(b.accounts.get("@Maybank")?.get("MYR")).toBe(1200);
		expect(b.accounts.get("@Brokerage")?.get("USD")).toBe(1800);
		expect(b.accounts.get("@Brokerage")?.get("AAPL")).toBe(51.5);
		expect(b.accounts.get("@Brokerage")?.get("BTC")).toBeCloseTo(0.3);
		expect(b.accounts.get("@Brokerage")?.get("EUR")).toBe(0);

		expect(b.categories.get("&Groceries")?.get("USD")).toBe(350);
		expect(b.categories.get("&Investing")?.get("USD")).toBe(0);
		expect(b.categories.get("&Dining")?.get("USD")).toBe(50);

		expect(b.unassigned.get("USD")).toBe(7500);
		expect(b.unassigned.get("MYR")).toBe(1200);
		expect(b.unassigned.get("EUR")).toBe(500);
		expect(b.unassigned.get("AAPL")).toBe(50);
		expect(b.unassigned.get("BTC")).toBe(0.25);
	});

});
