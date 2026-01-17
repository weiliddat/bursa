import {
	assertionFailedWarning,
	missingCategoryError,
	nonChronologicalWarning,
	trunkEntityError,
	unbudgetedCategoryWarning,
	unknownEntityError,
	unverifiedEntryWarning,
} from "./diagnostics";
import type { Parser } from "./parser";

export function validate(p: Parser): void {
	validateCommodities(p);
	validateLeafEntities(p);
	validateLedger(p);
}

function validateCommodities(p: Parser): void {
	const defined = p.data.meta.commodities;

	// Check budget commodities
	for (const entry of p.data.budget) {
		if (!defined.has(entry.amount.commodity)) {
			p.errors.push(
				unknownEntityError(
					entry.amount.span,
					"commodity",
					entry.amount.commodity,
				),
			);
		}
	}

	// Check ledger commodities
	for (const entry of p.data.ledger) {
		if (!defined.has(entry.amount.commodity)) {
			p.errors.push(
				unknownEntityError(
					entry.amount.span,
					"commodity",
					entry.amount.commodity,
				),
			);
		}
		if (entry.kind === "transaction") {
			if (
				entry.target.kind === "swap" &&
				!defined.has(entry.target.amount.commodity)
			) {
				p.errors.push(
					unknownEntityError(
						entry.target.amount.span,
						"commodity",
						entry.target.amount.commodity,
					),
				);
			}
		}
	}
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
				trunkEntityError(entry.account.span, "account", entry.account.raw),
			);
		}
		if (entry.kind === "transaction") {
			if (entry.target.kind === "category") {
				if (trunkCategories.has(entry.target.ref.raw)) {
					p.errors.push(
						trunkEntityError(
							entry.target.ref.span,
							"category",
							entry.target.ref.raw,
						),
					);
				}
			} else if (entry.target.kind === "account") {
				if (trunkAccounts.has(entry.target.ref.raw)) {
					p.errors.push(
						trunkEntityError(
							entry.target.ref.span,
							"account",
							entry.target.ref.raw,
						),
					);
				}
				if (
					entry.target.category &&
					trunkCategories.has(entry.target.category.raw)
				) {
					p.errors.push(
						trunkEntityError(
							entry.target.category.span,
							"category",
							entry.target.category.raw,
						),
					);
				}
			}
		}
	}

	for (const be of p.data.budget) {
		if (trunkCategories.has(be.category.raw)) {
			p.errors.push(
				trunkEntityError(be.category.span, "category", be.category.raw),
			);
		}
	}
}

function isUntracked(account: string, patterns: string[]): boolean {
	// account is like "@Brokerage:Stocks"
	// pattern can be "@Brokerage" (exact) or "@Brokerage:*" (wildcard for children)

	for (const pattern of patterns) {
		if (pattern === account) return true;
		if (pattern.endsWith(":*")) {
			const prefix = pattern.slice(0, -2);
			if (account.startsWith(`${prefix}:`) || account === prefix) {
				return true;
			}
		}
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

		const lastDate = accountDates.get(accountName);
		if (lastDate && entry.date < lastDate) {
			p.warnings.push(nonChronologicalWarning(entry.span));
		}
		accountDates.set(accountName, entry.date);

		if (entry.unverified) {
			p.warnings.push(unverifiedEntryWarning(entry.span));
		}

		// Handle Assertion
		if (entry.kind === "assertion") {
			if (entry.unverified) continue;

			const current = getBalance(accountName, entry.amount.commodity);
			// Relaxed comparison for float equality?
			const diff = Math.abs(current - entry.amount.value);
			if (diff > 0.000001) {
				p.warnings.push(
					assertionFailedWarning(
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
				if (!budgetCategories.has(entry.target.ref.raw)) {
					p.warnings.push(
						unbudgetedCategoryWarning(
							entry.target.ref.span,
							entry.target.ref.raw,
						),
					);
				}
			} else if (entry.target.kind === "account") {
				const targetAccount = entry.target.ref.raw;

				if (isUntracked(targetAccount, p.data.meta.untrackedPatterns)) {
					if (!entry.target.category) {
						p.errors.push(missingCategoryError(entry.target.ref.span));
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
