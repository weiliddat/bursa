import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import dedent from "dedent";
import { describe, expect, it } from "vitest";

import { parse } from "./parser";

describe("parse", () => {
	describe("example.bursa", () => {
		const source = readFileSync(
			resolve(import.meta.dirname, "../../examples/example.bursa"),
			"utf-8",
		);
		const result = parse(source);

		it("parses without errors or warnings", () => {
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

			it("builds symbols sorted by length descending", () => {
				const { symbols } = result.data.meta;
				expect(symbols.length).toBeGreaterThan(0);
				expect(symbols).toContain("$");
				expect(symbols).toContain("USD");
				expect(symbols).toContain("RM");
				for (let i = 1; i < symbols.length; i++) {
					expect(symbols[i - 1].length).toBeGreaterThanOrEqual(
						symbols[i].length,
					);
				}
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
				const groceriesReduction = result.data.budget[3];
				expect(groceriesReduction.category.raw).toBe("&Groceries");
				expect(groceriesReduction.amount.sign).toBe("-");
				expect(groceriesReduction.amount.value).toBe(50);
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
						e.target.ref.raw === "&Unassigned",
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

			it("resolves RM prefix alias to MYR commodity", () => {
				const maybankOpening = result.data.ledger.find(
					(e) =>
						e.kind === "transaction" &&
						e.account.raw === "@Maybank" &&
						e.target.kind === "category" &&
						e.target.ref.raw === "&Unassigned",
				);
				expect(maybankOpening).toBeDefined();
				if (maybankOpening?.kind === "transaction") {
					expect(maybankOpening.amount.commodity).toBe("MYR");
					expect(maybankOpening.amount.value).toBe(1200);
				}
			});
		});

		it("parses prefix and suffix symbols (aliases and commodities)", () => {
			const source = dedent`
				>>> META
				commodity: $ = USD
				commodity: RM = MYR
				commodity: ₿ = BTC
				commodity: AAPL

				>>> BUDGET
				2026-01
				  &Income 1000 USD
				  &Food 500 USD

				>>> LEDGER
				@Checking
				  2026-01-01 +$100 &Income
				  2026-01-02 -RM50 &Food
				  2026-01-03 +₿ 0.5 &Income
				  2026-01-04 -USD 25 &Food
				  2026-01-05 +AAPL10 &Income

				  2026-01-06 +100$ &Income
				  2026-01-07 -50RM &Food
				  2026-01-08 +0.5 ₿ &Income
				  2026-01-09 -25 USD &Food
				  2026-01-10 +10 AAPL &Income
			`;
			const result = parse(source);
			expect(result.errors).toEqual([]);
			expect(result.warnings).toEqual([]);

			const entries = result.data.ledger.filter(
				(e) => e.kind === "transaction",
			);
			expect(entries).toHaveLength(10);
			expect(entries[0].amount).toMatchObject({ commodity: "USD", value: 100 });
			expect(entries[1].amount).toMatchObject({ commodity: "MYR", value: 50 });
			expect(entries[2].amount).toMatchObject({ commodity: "BTC", value: 0.5 });
			expect(entries[3].amount).toMatchObject({ commodity: "USD", value: 25 });
			expect(entries[4].amount).toMatchObject({ commodity: "AAPL", value: 10 });
			expect(entries[5].amount).toMatchObject({ commodity: "USD", value: 100 });
			expect(entries[6].amount).toMatchObject({ commodity: "MYR", value: 50 });
			expect(entries[7].amount).toMatchObject({ commodity: "BTC", value: 0.5 });
			expect(entries[8].amount).toMatchObject({ commodity: "USD", value: 25 });
			expect(entries[9].amount).toMatchObject({ commodity: "AAPL", value: 10 });
		});

		it("parses swap target starting with symbol alias", () => {
			const source = dedent`
				>>> META
				commodity: $ = USD
				commodity: € = EUR

				>>> BUDGET
				2026-01
				  &Income 1000 $

				>>> LEDGER
				@Checking
				  2026-01-01 -100 $ €90
			`;
			const result = parse(source);
			expect(result.errors).toEqual([]);
			expect(result.warnings).toEqual([]);

			const swap = result.data.ledger.find(
				(entry) =>
					entry.kind === "transaction" && entry.target.kind === "swap",
			);
			expect(swap).toBeDefined();
			if (swap?.kind === "transaction" && swap.target.kind === "swap") {
				expect(swap.amount).toMatchObject({ commodity: "USD", value: 100 });
				expect(swap.target.amount).toMatchObject({ commodity: "EUR", value: 90 });
			}
		});
	});

	describe("syntax errors", () => {
		it("flags invalid account names", () => {
			const source = dedent`
				>>> LEDGER
				@
				  2026-01-01 +100 USD &Food
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
					message: "Expected account name after '@'",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("handles hierarchical name with trailing colon", () => {
			const source = dedent`
				>>> LEDGER
				@Account:
				  2026-01-01 +100 USD &Food
			`;
			const result = parse(source);
			// Should parse @Account (stops at colon followed by non-identifier)
			expect(result.errors.length).toBeGreaterThan(0);
		});

		it("InvalidDirectiveError for missing commodity name", () => {
			const source = dedent`
				>>> META
				commodity:
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidDirectiveError",
					message: "Expected commodity name",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidEntryError for missing amount after date", () => {
			const source = dedent`
				>>> META
				commodity: USD

				>>> LEDGER
				@Checking
				  2026-01-01
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
					message: "Expected amount",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidEntryError for unexpected character in entry", () => {
			const source = dedent`
				>>> META
				commodity: USD

				>>> LEDGER
				@Checking
				  !invalid
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidSectionError for unknown section", () => {
			const source = dedent`>>> UNKNOWN`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidSectionError",
					message: "Unknown section 'UNKNOWN'",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidSectionError for content before section", () => {
			const source = dedent`
				some content
				>>> META
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidSectionError",
					message: "Content before section marker",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidDirectiveError for missing colon", () => {
			const source = dedent`
				>>> META
				commodity USD
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidDirectiveError",
					message: "Expected ':'",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidDirectiveError for unknown directive", () => {
			const source = dedent`
				>>> META
				unknown: value
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidDirectiveError",
					message: "Unknown directive 'unknown'",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidEntryError for entry before account header", () => {
			const source = dedent`
				>>> LEDGER
				2026-01-01 -100 USD &Food
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
					message: "Entry before account header",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidEntryError for missing target", () => {
			const source = dedent`
				>>> META
				commodity: USD

				>>> LEDGER
				@Checking
				  2026-01-01 -100 USD
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidEntryError for invalid date format", () => {
			const source = dedent`
				>>> META
				commodity: USD

				>>> LEDGER
				@Checking
				  01-01-2026 -100 USD &Food
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidEntryError for invalid category target", () => {
			const source = dedent`
				>>> META
				commodity: USD

				>>> LEDGER
				@Checking
				  2026-02-01 -100 USD &
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
					message: "Expected category name after '&'",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("Missing category for transfers is not a syntax error", () => {
			const source = dedent`
				>>> META
				commodity: USD

				>>> LEDGER
				@Checking
				  2026-02-01 -100 USD @Brokerage

				@Brokerage
			`;
			const result = parse(source);
			expect(result.errors).toHaveLength(0);
			expect(result.warnings).toEqual([]);
		});

		it("parses untracked patterns with wildcards", () => {
			const source = dedent`
				>>> META
				untracked: @Brokerage:*
			`;
			const result = parse(source);
			expect(result.errors).toEqual([]);
			expect(result.warnings).toEqual([]);
			expect(result.data.meta.untrackedPatterns).toContain("@Brokerage:*");
		});

		it("parses non-identifier commodity without alias", () => {
			const source = dedent`
				>>> META
				commodity: $
			`;
			const result = parse(source);
			expect(result.errors).toEqual([]);
			expect(result.warnings).toEqual([]);
			expect(result.data.meta.commodities).toContain("$");
		});

		it("InvalidDirectiveError for missing commodity after identifier '='", () => {
			const source = dedent`
				>>> META
				commodity: RM =
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidDirectiveError",
					message: "Expected commodity name",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidDirectiveError for missing '@' in untracked", () => {
			const source = dedent`
				>>> META
				untracked: Brokerage
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidDirectiveError",
					message: "Expected '@'",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidEntryError for budget entry before period", () => {
			const source = dedent`
				>>> BUDGET
				&Groceries 100 USD
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
					message: "Budget entry before period header",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidEntryError for missing budget amount", () => {
			const source = dedent`
				>>> BUDGET
				2026-01
				&Groceries
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
					message: "Expected amount",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidEntryError for unexpected character in budget", () => {
			const source = dedent`
				>>> BUDGET
				2026-01
				!invalid
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
					message: "Unexpected character: '!'",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidEntryError for malformed period", () => {
			const source = dedent`
				>>> BUDGET
				202a-01
				2026.01
				2026-0a
			`;
			const result = parse(source);
			expect(result.errors.length).toBe(3);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidEntryError for malformed date", () => {
			const source = dedent`
				>>> LEDGER
				@Acc
				  202a-01-01 100 USD &Food
				  2026.01-01 100 USD &Food
				  2026-0a-01 100 USD &Food
				  2026-01.01 100 USD &Food
				  2026-01-0a 100 USD &Food
			`;
			const result = parse(source);
			expect(result.errors.length).toBe(5);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidEntryError for missing amount in assertion", () => {
			const source = dedent`
				>>> LEDGER
				@Acc
				  2026-01-01 == ; comment
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
					message: "Expected amount after '=='",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidEntryError for missing commodity", () => {
			const source = dedent`
				>>> LEDGER
				@Acc
				  2026-01-01 100 &Cat
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
					message: "Missing commodity for amount: '100'",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidEntryError for non-numeric amount", () => {
			const source = dedent`
				>>> LEDGER
				@Acc
				  2026-01-01 abc USD &Cat
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
					message: "Expected amount",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidEntryError for malformed amount", () => {
			const source = dedent`
				>>> LEDGER
				@Acc
				  2026-01-01 1.2.3 USD &Cat
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
					message: "Malformed amount: '1.2.3'",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("parses scientific notation amounts", () => {
			const source = dedent`
				>>> META
				commodity: USD

				>>> BUDGET
				2026-01
				  &Cat 1000000 USD

				>>> LEDGER
				@Acc
				  2026-01-01 1e6 USD &Cat
				  2026-01-02 1.5E-3 USD &Cat
			`;
			const result = parse(source);
			expect(result.errors).toEqual([]);
			expect(result.warnings).toEqual([]);
			const entries = result.data.ledger.filter(
				(e) => e.kind === "transaction",
			);
			expect(entries[0].amount.value).toBe(1e6);
			expect(entries[1].amount.value).toBe(1.5e-3);
		});

		it("InvalidEntryError for expected tag name", () => {
			const source = dedent`
				>>> LEDGER
				@Acc
				  2026-01-01 100 USD &Cat #
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
					message: "Expected tag name after '#'",
				}),
			);
		});

		it("InvalidSectionError for malformed section marker", () => {
			const source = dedent`
				> META
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidSectionError",
					message: "Expected '>>>'",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidEntryError for invalid category ref in budget", () => {
			const source = dedent`
				>>> BUDGET
				2026-01
				& 100 USD
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
					message: "Expected category name after '&'",
				}),
			);
			expect(result.warnings).toEqual([]);
		});

		it("InvalidEntryError for invalid target in ledger", () => {
			const source = dedent`
				>>> LEDGER
				@Acc
				  2026-01-01 100 USD !invalid
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
					message: "Expected target, got '!'",
				}),
			);
			expect(result.warnings).toEqual([]);
		});
	});

	describe("empty account blocks", () => {
		it("parses account block without entries", () => {
			const source = dedent`
				>>> META
				commodity: USD

				>>> BUDGET
				2026-01
				  &Income 100 USD

				>>> LEDGER
				@EmptyAccount

				@AccountWithEntries
				  2026-01-01 +100 USD &Income
			`;
			const result = parse(source);
			expect(result.errors).toEqual([]);
			expect(result.warnings).toEqual([]);

			const accounts = result.data.meta.accounts;
			expect(accounts).toContain("@AccountWithEntries");
			expect(accounts).toContain("@EmptyAccount");
		});
	});

	describe("trunk entity detection", () => {
		it("errors when leaf account declared before trunk", () => {
			const source = dedent`
				>>> META
				commodity: USD

				>>> LEDGER
				@Bank:Savings

				@Bank
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "TrunkEntityError",
					message: "Cannot use account '@Bank' directly; it has sub-accounts",
				}),
			);
			expect(result.warnings).toEqual([]);
			expect(result.data.meta.accounts).toContain("@Bank:Savings");
			expect(result.data.meta.accounts).not.toContain("@Bank");
			expect(result.data.meta.accountGroups).toContain("@Bank");
		});

		it("errors when trunk account declared before leaf", () => {
			const source = dedent`
				>>> META
				commodity: USD

				>>> LEDGER
				@Bank

				@Bank:Savings
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "TrunkEntityError",
					message: "Cannot use account '@Bank' directly; it has sub-accounts",
				}),
			);
			expect(result.warnings).toEqual([]);
			expect(result.data.meta.accounts).toContain("@Bank:Savings");
			expect(result.data.meta.accounts).not.toContain("@Bank");
			expect(result.data.meta.accountGroups).toContain("@Bank");
		});

		it("errors when leaf category declared before trunk", () => {
			const source = dedent`
				>>> META
				commodity: USD

				>>> BUDGET
				2026-01
				  &Food:Groceries 100 USD
				  &Food 200 USD
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "TrunkEntityError",
					message:
						"Cannot use category '&Food' directly; it has sub-categories",
				}),
			);
			expect(result.warnings).toEqual([]);
			expect(result.data.meta.categories).toContain("&Food:Groceries");
			expect(result.data.meta.categories).not.toContain("&Food");
			expect(result.data.meta.categoryGroups).toContain("&Food");
		});

		it("errors when trunk category declared before leaf", () => {
			const source = dedent`
				>>> META
				commodity: USD

				>>> BUDGET
				2026-01
				  &Food 200 USD
				  &Food:Groceries 100 USD
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "TrunkEntityError",
					message:
						"Cannot use category '&Food' directly; it has sub-categories",
				}),
			);
			expect(result.warnings).toEqual([]);
			expect(result.data.meta.categories).toContain("&Food:Groceries");
			expect(result.data.meta.categories).not.toContain("&Food");
			expect(result.data.meta.categoryGroups).toContain("&Food");
		});

		it("allows same account declared multiple times", () => {
			const source = dedent`
				>>> META
				commodity: USD

				>>> BUDGET
				2026-01
				  &Income 100 USD
				2026-02
				  &Income 100 USD

				>>> LEDGER
				@Checking

				@Savings
			`;
			const result = parse(source);
			expect(result.errors).toEqual([]);
			expect(result.warnings).toEqual([]);

			expect(result.data.meta.accounts).toContain("@Checking");
			expect(result.data.meta.accounts).toContain("@Savings");
			expect(result.data.meta.categories).toContain("&Income");
		});
	});

	describe("multiple tags", () => {
		it("parses transaction with multiple tags", () => {
			const source = dedent`
				>>> META
				commodity: $ = USD

				>>> LEDGER
				@Checking
				2026-01-01 -$50 &Food #groceries #weekly #bulk
			`;
			const result = parse(source);
			expect(result.errors).toEqual([]);

			const tx = result.data.ledger[0];
			expect(tx?.kind).toBe("transaction");
			if (tx?.kind === "transaction") {
				expect(tx.tags).toHaveLength(3);
				expect(tx.tags[0].raw).toBe("#groceries");
				expect(tx.tags[1].raw).toBe("#weekly");
				expect(tx.tags[2].raw).toBe("#bulk");
			}
		});
	});

	describe("symbol overlap / longest-match", () => {
		it("matches longer symbol when alias and commodity overlap", () => {
			const source = dedent`
				>>> META
				commodity: R = MYR
				commodity: RM

				>>> BUDGET
				2026-01
				  &Food 100 MYR
				  &Income 100 RM

				>>> LEDGER
				@Checking
				  2026-01-01 -RM50 &Food
				  2026-01-02 +R100 &Income
			`;
			const result = parse(source);
			expect(result.errors).toEqual([]);
			expect(result.warnings).toEqual([]);

			const budgets = result.data.budget;
			expect(budgets).toHaveLength(2);
			expect(budgets[0].amount).toMatchObject({ commodity: "MYR", value: 100 });
			expect(budgets[1].amount).toMatchObject({ commodity: "RM", value: 100 });

			const entries = result.data.ledger.filter((e) => e.kind === "transaction");
			expect(entries).toHaveLength(2);
			expect(entries[0].amount).toMatchObject({ commodity: "RM", value: 50 });
			expect(entries[1].amount).toMatchObject({ commodity: "MYR", value: 100 });
		});
	});

	describe("duplicate symbol definitions", () => {
		it("warns when alias is redefined", () => {
			const source = dedent`
				>>> META
				commodity: $ = USD
				commodity: $ = EUR
			`;
			const result = parse(source);
			expect(result.errors).toEqual([]);
			expect(result.warnings).toContainEqual(
				expect.objectContaining({
					name: "DuplicateSymbolWarning",
					message: "Symbol '$' already defined as an alias",
				}),
			);
			expect(result.data.meta.aliases.get("$")).toBe("EUR");
			expect(result.data.meta.commodities).toContain("USD");
			expect(result.data.meta.commodities).toContain("EUR");
		});

		it("warns when alias conflicts with existing commodity", () => {
			const source = dedent`
				>>> META
				commodity: $
				commodity: $ = USD
			`;
			const result = parse(source);
			expect(result.errors).toEqual([]);
			expect(result.warnings).toContainEqual(
				expect.objectContaining({
					name: "DuplicateSymbolWarning",
					message: "Symbol '$' already defined as a commodity",
				}),
			);
		});

		it("warns when commodity conflicts with existing alias", () => {
			const source = dedent`
				>>> META
				commodity: $ = USD
				commodity: $
			`;
			const result = parse(source);
			expect(result.errors).toEqual([]);
			expect(result.warnings).toContainEqual(
				expect.objectContaining({
					name: "DuplicateSymbolWarning",
					message: "Symbol '$' already defined as an alias",
				}),
			);
		});
	});

	describe("sign placement", () => {
		it("accepts sign before symbol (-$500)", () => {
			const source = dedent`
				>>> META
				commodity: $ = USD

				>>> LEDGER
				@Checking
				  2026-01-01 -$500 &Food
			`;
			const result = parse(source);
			expect(result.errors).toEqual([]);
			const tx = result.data.ledger[0];
			expect(tx?.kind).toBe("transaction");
			if (tx?.kind === "transaction") {
				expect(tx.amount).toMatchObject({ sign: "-", value: 500, commodity: "USD" });
			}
		});

		it("rejects sign after symbol ($-500)", () => {
			const source = dedent`
				>>> META
				commodity: $ = USD

				>>> LEDGER
				@Checking
				  2026-01-01 $-500 &Food
			`;
			const result = parse(source);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					name: "InvalidEntryError",
				}),
			);
		});
	});

	describe("CRLF line endings", () => {
		it("parses file with CRLF line endings", () => {
			const source =
				">>> META\r\n" +
				"commodity: $ = USD\r\n" +
				"\r\n" +
				">>> BUDGET\r\n" +
				"2025-01\r\n" +
				"&Food $100\r\n" +
				"\r\n" +
				">>> LEDGER\r\n" +
				"@Checking\r\n" +
				"2025-01-01 -$50 &Food #groceries\r\n";
			const result = parse(source);
			expect(result.errors).toEqual([]);
			expect(result.warnings).toEqual([]);
			expect(result.data.meta.commodities).toContain("USD");
			expect(result.data.ledger).toHaveLength(1);
		});

		it("tracks line numbers correctly with CRLF", () => {
			const source = ">>> META\r\n" + "invalid directive\r\n";
			const result = parse(source);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].span.start.line).toBe(2);
			expect(result.warnings).toEqual([]);
		});

		it("parses file with standalone CR (old Mac style)", () => {
			const source = ">>> META\r" + "commodity: USD\r" + "\r" + ">>> LEDGER\r";
			const result = parse(source);
			expect(result.errors).toEqual([]);
			expect(result.warnings).toEqual([]);
			expect(result.data.meta.commodities).toContain("USD");
		});

		it("tracks line numbers correctly with CR", () => {
			const source = ">>> META\r" + "invalid directive\r";
			const result = parse(source);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].span.start.line).toBe(2);
			expect(result.warnings).toEqual([]);
		});
	});
});
