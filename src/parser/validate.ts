import {
	assertionFailedWarning,
	missingCategoryError,
	nonChronologicalWarning,
	unbudgetedCategoryWarning,
	unknownEntityError,
	unverifiedEntryWarning,
} from "./diagnostics";
import type { Parser } from "./parser";

export function validate(p: Parser): void {
	validateCommodities(p);
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

function validateLedger(p: Parser): void {
	const { accounts, categories, categoryGroups, untrackedAccounts } =
		p.data.meta;

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

		if (entry.kind === "assertion") {
			if (entry.unverified) continue;

			const current = getBalance(accountName, entry.amount.commodity);
			const sign = entry.amount.sign === "-" ? -1 : 1;
			const expected = entry.amount.value * sign;
			const diff = Math.abs(current - expected);
			if (diff > 0.000001) {
				p.warnings.push(
					assertionFailedWarning(
						entry.span,
						`${expected} ${entry.amount.commodity}`,
						`${current} ${entry.amount.commodity}`,
					),
				);
			}
			continue;
		}

		if (entry.kind === "transaction") {
			const sign = entry.amount.sign === "-" ? -1 : 1;
			const amountVal = entry.amount.value * sign;

			updateBalance(accountName, entry.amount.commodity, amountVal);

			if (entry.target.kind === "category") {
				const catRaw = entry.target.ref.raw;
				if (
					sign < 0 &&
					!categories.has(catRaw) &&
					!categoryGroups.has(catRaw)
				) {
					p.warnings.push(
						unbudgetedCategoryWarning(entry.target.ref.span, catRaw),
					);
				}
			} else if (entry.target.kind === "account") {
				const targetAccount = entry.target.ref.raw;

				if (!accounts.has(targetAccount)) {
					p.errors.push(
						unknownEntityError(entry.target.ref.span, "account", targetAccount),
					);
				}

				if (untrackedAccounts.has(targetAccount)) {
					if (!entry.target.category) {
						p.errors.push(missingCategoryError(entry.target.ref.span));
					}
				}

				if (entry.target.category) {
					const catRaw = entry.target.category.raw;
					if (
						sign < 0 &&
						!categories.has(catRaw) &&
						!categoryGroups.has(catRaw)
					) {
						p.warnings.push(
							unbudgetedCategoryWarning(entry.target.category.span, catRaw),
						);
					}
				}

				updateBalance(targetAccount, entry.amount.commodity, -amountVal);
			} else if (entry.target.kind === "swap") {
				const swapAmount = entry.target.amount;
				const swapSign = swapAmount.sign === "-" ? -1 : 1;
				updateBalance(
					accountName,
					swapAmount.commodity,
					swapAmount.value * swapSign,
				);
			}
		}
	}
}
