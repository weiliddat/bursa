export interface Span {
	start: { line: number; col: number };
	end: { line: number; col: number };
}

export interface Amount {
	sign: "+" | "-" | null;
	value: number;
	commodity: string;
	span: Span;
}

export interface AccountRef {
	path: string[];
	raw: string;
	span: Span;
}

export interface CategoryRef {
	path: string[];
	raw: string;
	span: Span;
}

export interface TagRef {
	path: string[];
	raw: string;
	span: Span;
}

export type Target =
	| { kind: "category"; ref: CategoryRef }
	| { kind: "account"; ref: AccountRef; category: CategoryRef | null }
	| { kind: "swap"; amount: Amount };

export interface Transaction {
	kind: "transaction";
	date: string;
	account: AccountRef;
	unverified: boolean;
	amount: Amount;
	target: Target;
	tags: TagRef[];
	comment: string | null;
	span: Span;
}

export interface Assertion {
	kind: "assertion";
	date: string;
	account: AccountRef;
	unverified: boolean;
	amount: Amount;
	comment: string | null;
	span: Span;
}

export type LedgerEntry = Transaction | Assertion;

export interface BudgetEntry {
	period: string;
	category: CategoryRef;
	amount: Amount;
	span: Span;
}

export interface Ledger {
	meta: {
		// e.g. USD, VOO, BTC
		commodities: Set<string>;
		// e.g. $ -> USD, RM -> MYR
		aliases: Map<string, string>;
		// list of all aliases and commodities, sorted in desc length for matching
		symbols: string[];

		// untracked accounts, e.g. @Investments:BrokerageAccount or @Investments:*
		untrackedPatterns: string[];

		// set of all "leaf" accounts for validation
		accounts: Set<string>;
		// set of all "leaf" categories for validation
		categories: Set<string>;
	};
	budget: BudgetEntry[];
	ledger: LedgerEntry[];
}
