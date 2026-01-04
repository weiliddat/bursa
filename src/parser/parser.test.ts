import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "./parser";

describe("parse", () => {
	describe("example.bursa", () => {
		const source = readFileSync(
			resolve(import.meta.dirname, "../../examples/example.bursa"),
			"utf-8",
		);
		const result = parse(source);

		it("parses without errors", () => {
			expect(result.errors).toEqual([]);
		});

		describe("META section", () => {
			it("parses commodities", () => {
				expect(result.data.meta.commodities).toContain("USD");
				expect(result.data.meta.commodities).toContain("EUR");
				expect(result.data.meta.commodities).toContain("MYR");
				expect(result.data.meta.commodities).toContain("AAPL");
				expect(result.data.meta.commodities).toContain("BTC");
			});

			it("parses aliases", () => {
				expect(result.data.meta.aliases.get("$")).toBe("USD");
				expect(result.data.meta.aliases.get("€")).toBe("EUR");
				expect(result.data.meta.aliases.get("RM")).toBe("MYR");
			});

			it("parses untracked patterns", () => {
				expect(result.data.meta.untrackedPatterns).toContain("@Brokerage");
			});
		});

		describe("BUDGET section", () => {
			it("parses budget entries", () => {
				expect(result.data.budget.length).toBe(4);
			});

			it("parses first budget entry correctly", () => {
				const entry = result.data.budget[0];
				expect(entry.period).toBe("2026-01");
				expect(entry.category.raw).toBe("&Groceries");
				expect(entry.amount.value).toBe(500);
				expect(entry.amount.commodity).toBe("USD");
			});

			it("parses negative budget entry", () => {
				const dining = result.data.budget[2];
				expect(dining.category.raw).toBe("&Dining");
				expect(dining.amount.sign).toBe("-");
				expect(dining.amount.value).toBe(50);
			});
		});

		describe("LEDGER section", () => {
			it("parses ledger entries", () => {
				expect(result.data.ledger.length).toBeGreaterThan(0);
			});

			it("parses opening balance transaction", () => {
				const opening = result.data.ledger.find(
					(e) =>
						e.kind === "transaction" &&
						e.account.raw === "@Checking" &&
						e.target.kind === "category" &&
						e.target.ref.raw === "&Opening:Balance",
				);
				expect(opening).toBeDefined();
				if (opening?.kind === "transaction") {
					expect(opening.amount.value).toBe(5000);
					expect(opening.amount.sign).toBe("+");
				}
			});

			it("parses expense with tag", () => {
				const groceries = result.data.ledger.find(
					(e) =>
						e.kind === "transaction" &&
						e.target.kind === "category" &&
						e.target.ref.raw === "&Groceries",
				);
				expect(groceries).toBeDefined();
				if (groceries?.kind === "transaction") {
					expect(groceries.tags.length).toBe(1);
					expect(groceries.tags[0].raw).toBe("#traderjoes");
				}
			});

			it("parses transfer with category", () => {
				const transfer = result.data.ledger.find(
					(e) =>
						e.kind === "transaction" &&
						e.target.kind === "account" &&
						e.target.ref.raw === "@Brokerage" &&
						e.target.category?.raw === "&Investing",
				);
				expect(transfer).toBeDefined();
			});

			it("parses swap transaction", () => {
				const swap = result.data.ledger.find(
					(e) =>
						e.kind === "transaction" &&
						e.target.kind === "swap" &&
						e.target.amount.commodity === "AAPL",
				);
				expect(swap).toBeDefined();
				if (swap?.kind === "transaction" && swap.target.kind === "swap") {
					expect(swap.amount.value).toBe(1000);
					expect(swap.amount.commodity).toBe("USD");
					expect(swap.target.amount.value).toBe(6.5);
				}
			});

			it("parses assertion", () => {
				const assertion = result.data.ledger.find(
					(e) =>
						e.kind === "assertion" &&
						e.account.raw === "@Checking" &&
						e.amount.value === 6800,
				);
				expect(assertion).toBeDefined();
			});

			it("parses unverified assertion", () => {
				const unverified = result.data.ledger.find(
					(e) => e.kind === "assertion" && e.unverified,
				);
				expect(unverified).toBeDefined();
				if (unverified?.kind === "assertion") {
					expect(unverified.account.raw).toBe("@Maybank");
					expect(unverified.amount.value).toBe(1670);
				}
			});

			it("resolves RM alias to MYR commodity", () => {
				const maybankOpening = result.data.ledger.find(
					(e) =>
						e.kind === "transaction" &&
						e.account.raw === "@Maybank" &&
						e.target.kind === "category" &&
						e.target.ref.raw === "&Opening:Balance",
				);
				expect(maybankOpening).toBeDefined();
				if (maybankOpening?.kind === "transaction") {
					expect(maybankOpening.amount.commodity).toBe("MYR");
				}
			});
		});
	});
});
