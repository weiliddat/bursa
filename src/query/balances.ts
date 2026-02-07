import type { Ledger } from "../parser";

export type CommodityBalances = Map<string, number>;
export type EntityBalances = Map<string, CommodityBalances>;

export interface Balances {
	accounts: EntityBalances;
	categories: EntityBalances;
	unassigned: CommodityBalances;
}

function add(m: CommodityBalances, commodity: string, delta: number): void {
	m.set(commodity, (m.get(commodity) ?? 0) + delta);
}

function addEntity(
	m: EntityBalances,
	entity: string,
	commodity: string,
	delta: number,
): void {
	let cb = m.get(entity);
	if (!cb) {
		cb = new Map();
		m.set(entity, cb);
	}
	add(cb, commodity, delta);
}

export function computeBalances(ledger: Ledger, asOfDate?: string): Balances {
	const accounts: EntityBalances = new Map();
	const categories: EntityBalances = new Map();
	const unassigned: CommodityBalances = new Map();

	const asOfPeriod = asOfDate?.slice(0, 7);

	for (const entry of ledger.budget) {
		if (asOfPeriod && entry.period > asOfPeriod) continue;

		const sign = entry.amount.sign === "-" ? -1 : 1;
		const alloc = entry.amount.value * sign;
		const commodity = entry.amount.commodity;

		addEntity(categories, entry.category.raw, commodity, alloc);
		add(unassigned, commodity, -alloc);
	}

	for (const entry of ledger.ledger) {
		if (asOfDate && entry.date > asOfDate) continue;
		if (entry.kind === "assertion") continue;

		const sign = entry.amount.sign === "-" ? -1 : 1;
		const amountVal = entry.amount.value * sign;
		const commodity = entry.amount.commodity;
		const accountName = entry.account.raw;

		addEntity(accounts, accountName, commodity, amountVal);

		if (entry.target.kind === "account") {
			addEntity(accounts, entry.target.ref.raw, commodity, -amountVal);

			if (entry.target.category) {
				const catRaw = entry.target.category.raw;
				if (catRaw === "&Unassigned") {
					add(unassigned, commodity, amountVal);
				} else {
					addEntity(categories, catRaw, commodity, amountVal);
				}
			}
		} else if (entry.target.kind === "category") {
			const catRaw = entry.target.ref.raw;
			if (catRaw === "&Unassigned") {
				add(unassigned, commodity, amountVal);
			} else {
				addEntity(categories, catRaw, commodity, amountVal);
			}
		} else if (entry.target.kind === "swap") {
			const swapAmount = entry.target.amount;
			const swapSign = swapAmount.sign === "-" ? -1 : 1;
			addEntity(
				accounts,
				accountName,
				swapAmount.commodity,
				swapAmount.value * swapSign,
			);
		}
	}

	return { accounts, categories, unassigned };
}
