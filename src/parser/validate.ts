import {
	assertionFailed,
	expenseNotInBudget,
	nonChronologicalDates,
	transferMissingCategory,
	trunkEntityReference,
	unknownCommodity,
} from "./diagnostics";
import type { Parser } from "./parser";

export function validate(p: Parser): void {
	validateCommodities(p);
	validateBudget(p);
	validateLeafEntities(p);
	validateLedger(p);
}

function validateCommodities(p: Parser): void {
	const defined = p.data.meta.commodities;

	// Check budget commodities
	for (const entry of p.data.budget) {
		if (!defined.has(entry.amount.commodity)) {
			p.errors.push(
				unknownCommodity(entry.amount.span, entry.amount.commodity),
			);
		}
	}

	// Check ledger commodities
	for (const entry of p.data.ledger) {
		if (!defined.has(entry.amount.commodity)) {
			p.errors.push(
				unknownCommodity(entry.amount.span, entry.amount.commodity),
			);
		}
		if (entry.kind === "transaction") {
			if (
				entry.target.kind === "swap" &&
				!defined.has(entry.target.amount.commodity)
			) {
				p.errors.push(
					unknownCommodity(
						entry.target.amount.span,
						entry.target.amount.commodity,
					),
				);
			}
		}
	}
}

function validateBudget(_p: Parser): void {
	// W002: Expense category not in budget
	// This actually needs to be checked in validateLedger, but we need the budget categories first.
}

function collectTrunkEntities(paths: string[]): Set<string> {
	const trunks = new Set<string>();
	for (const path of paths) {
		const parts = path.split(":");
		for (let i = 1; i < parts.length; i++) {
			trunks.add(parts.slice(0, i).join(":"));
		}
	}
	return trunks;
}

function validateLeafEntities(p: Parser): void {
	const allAccounts: string[] = [];
	const allCategories: string[] = [];

	for (const entry of p.data.ledger) {
		allAccounts.push(entry.account.raw);
		if (entry.kind === "transaction") {
			if (entry.target.kind === "category") {
				allCategories.push(entry.target.ref.raw);
			} else if (entry.target.kind === "account") {
				allAccounts.push(entry.target.ref.raw);
				if (entry.target.category) {
					allCategories.push(entry.target.category.raw);
				}
			}
		}
	}

	for (const be of p.data.budget) {
		allCategories.push(be.category.raw);
	}

	const trunkAccounts = collectTrunkEntities(allAccounts);
	const trunkCategories = collectTrunkEntities(allCategories);

	for (const entry of p.data.ledger) {
		if (trunkAccounts.has(entry.account.raw)) {
			p.errors.push(
				trunkEntityReference(entry.account.span, entry.account.raw, "account"),
			);
		}
		if (entry.kind === "transaction") {
			if (entry.target.kind === "category") {
				if (trunkCategories.has(entry.target.ref.raw)) {
					p.errors.push(
						trunkEntityReference(
							entry.target.ref.span,
							entry.target.ref.raw,
							"category",
						),
					);
				}
			} else if (entry.target.kind === "account") {
				if (trunkAccounts.has(entry.target.ref.raw)) {
					p.errors.push(
						trunkEntityReference(
							entry.target.ref.span,
							entry.target.ref.raw,
							"account",
						),
					);
				}
				if (
					entry.target.category &&
					trunkCategories.has(entry.target.category.raw)
				) {
					p.errors.push(
						trunkEntityReference(
							entry.target.category.span,
							entry.target.category.raw,
							"category",
						),
					);
				}
			}
		}
	}

	for (const be of p.data.budget) {
		if (trunkCategories.has(be.category.raw)) {
			p.errors.push(
				trunkEntityReference(be.category.span, be.category.raw, "category"),
			);
		}
	}
}

function hasBudgetedAncestor(category: string, budgetSet: Set<string>): boolean {
	const parts = category.split(":");
	for (let i = parts.length; i > 0; i--) {
		if (budgetSet.has(parts.slice(0, i).join(":"))) return true;
	}
	return false;
}

function isUntracked(account: string, patterns: string[]): boolean {
	// Simple wildcard matching for now: @Account vs @Account, or @Group:*
	// account is like "@Brokerage:Stocks"
	// pattern can be "@Brokerage" (exact?) or "@Brokerage:*" (wildcard)
	// SPEC: "untracked: supports wildcards: @* or @Investments:*"

	for (const pattern of patterns) {
		if (pattern === account) return true;
		if (pattern.endsWith(":*")) {
			const prefix = pattern.slice(0, -2);
			if (account.startsWith(`${prefix}:`) || account === prefix) {
				return true;
			}
		}
		if (pattern === "@*") return true;
	}
	return false;
}

function validateLedger(p: Parser): void {
	const budgetCategories = new Set(p.data.budget.map((b) => b.category.raw));

	const balances = new Map<string, Map<string, number>>();
	const accountDates = new Map<string, string>();

	const getBalance = (account: string, commodity: string): number => {
		return balances.get(account)?.get(commodity) ?? 0;
	};

	const updateBalance = (account: string, commodity: string, delta: number) => {
		let acctBalances = balances.get(account);
		if (!acctBalances) {
			acctBalances = new Map();
			balances.set(account, acctBalances);
		}
		const current = acctBalances.get(commodity) ?? 0;
		// Use fixed-point arithmetic or similar to avoid float issues?
		// JS numbers are doubles. For now, we'll use standard float math but maybe we should be careful.
		// Given it's a prototype/MVP, standard float is okay but we should probably round to avoid tiny errors.
		acctBalances.set(commodity, current + delta);
	};

	for (const entry of p.data.ledger) {
		const accountName = entry.account.raw;

		// W001: Non-chronological dates
		const lastDate = accountDates.get(accountName);
		if (lastDate && entry.date < lastDate) {
			p.warnings.push(nonChronologicalDates(entry.span));
		}
		accountDates.set(accountName, entry.date);

		// Handle Assertion
		if (entry.kind === "assertion") {
			if (entry.unverified) continue;

			const current = getBalance(accountName, entry.amount.commodity);
			// Relaxed comparison for float equality?
			const diff = Math.abs(current - entry.amount.value);
			if (diff > 0.000001) {
				p.errors.push(
					assertionFailed(
						entry.span,
						`${entry.amount.value} ${entry.amount.commodity}`,
						`${current} ${entry.amount.commodity}`,
					),
				);
			}
			continue;
		}

		// Handle Transaction
		if (entry.kind === "transaction") {
			const sign = entry.amount.sign === "-" ? -1 : 1;
			const amountVal = entry.amount.value * sign;

			// Update source account
			updateBalance(accountName, entry.amount.commodity, amountVal);

			// Check target
			if (entry.target.kind === "category") {
				// W002: Expense category not in budget
				// Only check if it's an expense (amount < 0) or just usage?
				// "Expense category not in budget" implies expenses.
				// But budget can have income too.
				// Let's warn if any referenced category is not in budget.
				if (!hasBudgetedAncestor(entry.target.ref.raw, budgetCategories)) {
					p.warnings.push(
						expenseNotInBudget(entry.target.ref.span, entry.target.ref.raw),
					);
				}
			} else if (entry.target.kind === "account") {
				const targetAccount = entry.target.ref.raw;

				// E010: Transfer to untracked account missing category
				if (isUntracked(targetAccount, p.data.meta.untrackedPatterns)) {
					if (!entry.target.category) {
						p.errors.push(transferMissingCategory(entry.target.ref.span));
					}
				}

				// Update target account (double entry)
				// Transfer flows:
				// If I have -100 $ @Savings
				// Checking decreases by 100 (handled above)
				// Savings increases by 100?
				// Yes, logic is: Flow leaving A enters B.
				// So target gets -amountVal
				updateBalance(targetAccount, entry.amount.commodity, -amountVal);
			} else if (entry.target.kind === "swap") {
				// Swap: Source account also gets the swap amount (in diff commodity)
				// e.g. -1000 $ +6.5 AAPL
				// Source gets -1000 USD (handled above)
				// Source gets +6.5 AAPL
				const swapAmount = entry.target.amount;
				const swapSign = swapAmount.sign === "-" ? -1 : 1;
				// Note: The sign of the swap part usually opposes the main part if it's a swap?
				// Spec says: "-1000 $ +6.5 AAPL"
				// So we just take the sign as is.
				updateBalance(
					accountName,
					swapAmount.commodity,
					swapAmount.value * swapSign,
				);
			}
		}
	}
}
