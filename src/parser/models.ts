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
		commodities: Set<string>;
		aliases: Map<string, string>;
		untrackedPatterns: string[];
	};
	budget: BudgetEntry[];
	ledger: LedgerEntry[];
}
