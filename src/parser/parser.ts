import {
	type Diagnostic,
	duplicateSymbolWarning,
	invalidDirectiveError,
	invalidEntryError,
	invalidSectionError,
	trunkEntityError,
} from "./diagnostics";
import type {
	AccountRef,
	Amount,
	CategoryRef,
	Ledger,
	Span,
	TagRef,
	Target,
} from "./models";
import { validate } from "./validate";

export interface Parser {
	source: string;
	pos: number;
	line: number;
	col: number;
	section: "META" | "BUDGET" | "LEDGER" | null;
	currentPeriod: string | null;
	currentAccount: AccountRef | null;
	data: Ledger;
	errors: Diagnostic[];
	warnings: Diagnostic[];
}

export interface ParseResult {
	data: Ledger;
	errors: Diagnostic[];
	warnings: Diagnostic[];
}

export function createLedger(): Ledger {
	return {
		meta: {
			commodities: new Set<string>(),
			aliases: new Map<string, string>(),
			untrackedPatterns: [],
			untrackedAccounts: new Set<string>(),
			symbols: [],
			accounts: new Set<string>(),
			accountGroups: new Set<string>(),
			categories: new Set<string>(),
			categoryGroups: new Set<string>(),
		},
		budget: [],
		ledger: [],
	};
}

function buildSymbols(p: Parser): void {
	const { commodities, aliases } = p.data.meta;
	const set = new Set([...commodities, ...aliases.keys()]);
	p.data.meta.symbols = [...set].sort((a, b) => b.length - a.length);
}

function getPrefixes(path: string): string[] {
	const prefixes: string[] = [];
	let idx = path.indexOf(":", 1);
	while (idx !== -1) {
		prefixes.push(path.slice(0, idx));
		idx = path.indexOf(":", idx + 1);
	}
	return prefixes;
}

function isUntracked(account: string, patterns: string[]): boolean {
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

function registerAccount(p: Parser, ref: AccountRef): void {
	const { accounts, accountGroups: accountTrunks } = p.data.meta;
	const raw = ref.raw;

	if (accounts.has(raw)) return;

	if (accountTrunks.has(raw)) {
		p.errors.push(trunkEntityError(ref.span, "account", raw));
		return;
	}

	for (const prefix of getPrefixes(raw)) {
		if (accounts.has(prefix)) {
			p.errors.push(trunkEntityError(ref.span, "account", prefix));
			accounts.delete(prefix);
		}
		accountTrunks.add(prefix);
	}

	accounts.add(raw);

	if (isUntracked(raw, p.data.meta.untrackedPatterns)) {
		p.data.meta.untrackedAccounts.add(raw);
	}
}

function registerCategory(p: Parser, ref: CategoryRef): void {
	const { categories, categoryGroups: categoryTrunks } = p.data.meta;
	const raw = ref.raw;

	if (categories.has(raw)) return;

	if (categoryTrunks.has(raw)) {
		p.errors.push(trunkEntityError(ref.span, "category", raw));
		return;
	}

	for (const prefix of getPrefixes(raw)) {
		if (categories.has(prefix)) {
			p.errors.push(trunkEntityError(ref.span, "category", prefix));
			categories.delete(prefix);
		}
		categoryTrunks.add(prefix);
	}

	categories.add(raw);
}

function validateCategoryRef(p: Parser, ref: CategoryRef): void {
	const { categoryGroups } = p.data.meta;

	if (categoryGroups.has(ref.raw)) {
		p.errors.push(trunkEntityError(ref.span, "category", ref.raw));
	}
}

export function createParser(source: string): Parser {
	return {
		source,
		pos: 0,
		line: 1,
		col: 1,
		section: null,
		currentPeriod: null,
		currentAccount: null,
		data: createLedger(),
		errors: [],
		warnings: [],
	};
}

export function peek(p: Parser): string {
	const cp = p.source.codePointAt(p.pos);
	if (cp === undefined) return "";
	return String.fromCodePoint(cp);
}

export function advance(p: Parser): string {
	const cp = p.source.codePointAt(p.pos);
	if (cp === undefined) return "";
	const ch = String.fromCodePoint(cp);
	const width = cp > 0xffff ? 2 : 1;
	if (ch === "\n") {
		p.line++;
		p.col = 1;
	} else if (ch === "\r") {
		// Standalone CR or CRLF both start a new line
		// For CRLF, the following \n will also increment, so we skip here
		if (p.source[p.pos + 1] !== "\n") {
			p.line++;
			p.col = 1;
		}
	} else {
		p.col++;
	}
	p.pos += width;
	return ch;
}

export function atEnd(p: Parser): boolean {
	return p.pos >= p.source.length;
}

export function skipHorizontalWhitespace(p: Parser): void {
	while (!atEnd(p)) {
		const ch = peek(p);
		if (ch === " " || ch === "\t" || ch === "\r") {
			advance(p);
		} else {
			break;
		}
	}
}

export function skipLine(p: Parser): void {
	while (!atEnd(p) && peek(p) !== "\n" && peek(p) !== "\r") {
		advance(p);
	}
	if (peek(p) === "\r" || peek(p) === "\n") {
		advance(p);
	}
}

export function skipBlankLines(p: Parser): void {
	while (!atEnd(p)) {
		const savedPos = p.pos;
		const savedLine = p.line;
		const savedCol = p.col;

		skipHorizontalWhitespace(p);

		if (peek(p) === "\r" || peek(p) === "\n") {
			advance(p);
		} else {
			p.pos = savedPos;
			p.line = savedLine;
			p.col = savedCol;
			break;
		}
	}
}

export function match(p: Parser, expected: string): boolean {
	if (p.source.startsWith(expected, p.pos)) {
		for (let i = 0; i < expected.length; i++) {
			advance(p);
		}
		return true;
	}
	return false;
}

export function markStart(p: Parser): { line: number; col: number } {
	return { line: p.line, col: p.col };
}

export function spanFrom(
	p: Parser,
	start: { line: number; col: number },
): Span {
	return {
		start,
		end: { line: p.line, col: p.col },
	};
}

const RESERVED_CHARS = new Set([
	":",
	"@",
	"&",
	"#",
	";",
	" ",
	"\t",
	"\n",
	"\r",
	"=",
	"+",
	"-",
	".",
	"?",
	">",
]);

function isIdentifierChar(ch: string): boolean {
	return ch !== "" && !RESERVED_CHARS.has(ch);
}

function scanIdentifier(p: Parser): void {
	while (!atEnd(p) && isIdentifierChar(peek(p))) {
		advance(p);
	}
}

function parseIdentifier(p: Parser): string {
	const start = p.pos;
	scanIdentifier(p);
	return p.source.slice(start, p.pos);
}

function parseAliasKey(p: Parser): string {
	const start = p.pos;
	while (!atEnd(p)) {
		const ch = peek(p);
		if (ch === "=" || ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
			break;
		}
		advance(p);
	}
	return p.source.slice(start, p.pos);
}

function matchSymbol(p: Parser): string | null {
	for (const symbol of p.data.meta.symbols) {
		if (p.source.startsWith(symbol, p.pos)) {
			for (let i = 0; i < symbol.length; i++) {
				advance(p);
			}
			return symbol;
		}
	}
	return null;
}

function isSymbolStart(p: Parser): boolean {
	for (const symbol of p.data.meta.symbols) {
		if (p.source.startsWith(symbol, p.pos)) {
			return true;
		}
	}
	return false;
}

function peekNextCodepoint(p: Parser): string {
	const cp = p.source.codePointAt(p.pos + 1);
	if (cp === undefined) return "";
	return String.fromCodePoint(cp);
}

function parseHierarchicalName(p: Parser): string {
	const start = p.pos;
	scanIdentifier(p);
	while (peek(p) === ":") {
		const nextChar = peekNextCodepoint(p);
		if (isIdentifierChar(nextChar)) {
			advance(p);
			scanIdentifier(p);
		} else {
			break;
		}
	}
	return p.source.slice(start, p.pos);
}

function parseSectionMarker(p: Parser): void {
	const start = markStart(p);
	if (!match(p, ">>>")) {
		p.errors.push(invalidSectionError(spanFrom(p, start), "Expected '>>>'"));
		skipLine(p);
		return;
	}
	skipHorizontalWhitespace(p);

	const nameStart = markStart(p);
	const name = parseIdentifier(p);

	if (name === "META" || name === "BUDGET" || name === "LEDGER") {
		// Build symbols from aliases and commodities after META is parsed
		if (p.section === "META" && name !== "META") {
			buildSymbols(p);
		}
		p.section = name;
		p.currentPeriod = null;
		p.currentAccount = null;
	} else {
		p.errors.push(
			invalidSectionError(spanFrom(p, nameStart), `Unknown section '${name}'`),
		);
	}
	skipLine(p);
}

function parseMetaDirective(p: Parser): void {
	const start = markStart(p);
	const keyword = parseIdentifier(p);

	if (!match(p, ":")) {
		p.errors.push(invalidDirectiveError(spanFrom(p, start), "Expected ':'"));
		skipLine(p);
		return;
	}

	skipHorizontalWhitespace(p);

	if (keyword === "commodity") {
		const first = parseAliasKey(p).trim();
		if (!first) {
			p.errors.push(
				invalidDirectiveError(spanFrom(p, start), "Expected commodity name"),
			);
			skipLine(p);
			return;
		}
		skipHorizontalWhitespace(p);
		if (match(p, "=")) {
			// Alias syntax: "commodity: $ = USD" or "commodity: RM = MYR"
			skipHorizontalWhitespace(p);
			const commodity = parseIdentifier(p);
			if (commodity) {
				if (p.data.meta.aliases.has(first)) {
					p.warnings.push(
						duplicateSymbolWarning(spanFrom(p, start), first, "alias"),
					);
				} else if (p.data.meta.commodities.has(first)) {
					p.warnings.push(
						duplicateSymbolWarning(spanFrom(p, start), first, "commodity"),
					);
				}
				p.data.meta.aliases.set(first, commodity);
				p.data.meta.commodities.add(commodity);
			} else {
				p.errors.push(
					invalidDirectiveError(spanFrom(p, start), "Expected commodity name"),
				);
			}
		} else {
			// Plain commodity: "commodity: AAPL" or "commodity: $"
			if (p.data.meta.aliases.has(first)) {
				p.warnings.push(
					duplicateSymbolWarning(spanFrom(p, start), first, "alias"),
				);
			}
			p.data.meta.commodities.add(first);
		}
	} else if (keyword === "untracked") {
		if (!match(p, "@")) {
			p.errors.push(
				invalidDirectiveError(spanFrom(p, markStart(p)), "Expected '@'"),
			);
			skipLine(p);
			return;
		}
		let pattern = `@${parseHierarchicalName(p)}`;
		if (peek(p) === ":") {
			advance(p);
			if (peek(p) === "*") {
				pattern += ":*";
				advance(p);
			}
		}
		p.data.meta.untrackedPatterns.push(pattern);
	} else {
		p.errors.push(
			invalidDirectiveError(
				spanFrom(p, start),
				`Unknown directive '${keyword}'`,
			),
		);
	}

	skipLine(p);
}

function parsePeriod(p: Parser): string | null {
	const start = markStart(p);
	const startPos = p.pos;

	for (let i = 0; i < 4; i++) {
		const ch = peek(p);
		if (/[0-9]/.test(ch)) {
			advance(p);
		} else {
			p.errors.push(
				invalidEntryError(
					spanFrom(p, start),
					`Invalid period: '${p.source.slice(startPos, p.pos) + ch}'`,
				),
			);
			return null;
		}
	}

	if (peek(p) !== "-") {
		p.errors.push(
			invalidEntryError(
				spanFrom(p, start),
				`Invalid period: '${p.source.slice(startPos, p.pos)}'`,
			),
		);
		return null;
	}
	advance(p);

	for (let i = 0; i < 2; i++) {
		const ch = peek(p);
		if (/[0-9]/.test(ch)) {
			advance(p);
		} else {
			p.errors.push(
				invalidEntryError(
					spanFrom(p, start),
					`Invalid period: '${p.source.slice(startPos, p.pos) + ch}'`,
				),
			);
			return null;
		}
	}

	return p.source.slice(startPos, p.pos);
}

function parseCategoryRef(p: Parser): CategoryRef | null {
	const start = markStart(p);
	advance(p); // consume '&'
	const name = parseHierarchicalName(p);
	if (!name) {
		p.errors.push(
			invalidEntryError(spanFrom(p, start), "Expected category name after '&'"),
		);
		return null;
	}
	return {
		path: name.split(":"),
		raw: `&${name}`,
		span: spanFrom(p, start),
	};
}

function resolveCommodity(p: Parser, symbol: string): string {
	return p.data.meta.aliases.get(symbol) ?? symbol;
}

function parseAmount(p: Parser): Amount | null {
	const start = markStart(p);

	let sign: "+" | "-" | null = null;
	if (peek(p) === "+") {
		sign = "+";
		advance(p);
	} else if (peek(p) === "-") {
		sign = "-";
		advance(p);
	}

	let commodity: string | null = null;

	const matchedSymbol = matchSymbol(p);
	if (matchedSymbol) {
		commodity = resolveCommodity(p, matchedSymbol);
		skipHorizontalWhitespace(p);
	}

	const numStart = markStart(p);
	let numStr = "";
	while (!atEnd(p)) {
		const c = peek(p);
		if (/[0-9.eE]/.test(c)) {
			numStr += advance(p);
		} else if ((c === "+" || c === "-") && /[eE]$/.test(numStr)) {
			numStr += advance(p);
		} else {
			break;
		}
	}

	if (!numStr || !/[0-9]/.test(numStr)) {
		return null;
	}

	const value = Number(numStr);
	if (Number.isNaN(value)) {
		p.errors.push(
			invalidEntryError(spanFrom(p, numStart), `Malformed amount: '${numStr}'`),
		);
		return null;
	}

	if (!commodity) {
		skipHorizontalWhitespace(p);
		const suffixSymbol = matchSymbol(p);
		if (suffixSymbol) {
			commodity = resolveCommodity(p, suffixSymbol);
		} else if (/[a-zA-Z]/.test(peek(p))) {
			const ident = parseIdentifier(p);
			commodity = resolveCommodity(p, ident);
		}
	}

	if (!commodity) {
		p.errors.push(
			invalidEntryError(
				spanFrom(p, start),
				`Missing commodity for amount: '${numStr}'`,
			),
		);
		return null;
	}

	return {
		sign,
		value,
		commodity,
		span: spanFrom(p, start),
	};
}

function parseBudgetLine(p: Parser): void {
	const start = markStart(p);
	const ch = peek(p);

	if (/[0-9]/.test(ch)) {
		const period = parsePeriod(p);
		if (period) {
			p.currentPeriod = period;
		}
		skipLine(p);
		return;
	}

	if (ch === "&") {
		if (!p.currentPeriod) {
			p.errors.push(
				invalidEntryError(
					spanFrom(p, start),
					"Budget entry before period header",
				),
			);
			skipLine(p);
			return;
		}

		const categoryRef = parseCategoryRef(p);
		if (!categoryRef) {
			skipLine(p);
			return;
		}

		skipHorizontalWhitespace(p);

		const amount = parseAmount(p);
		if (!amount) {
			p.errors.push(
				invalidEntryError(spanFrom(p, markStart(p)), "Expected amount"),
			);
			skipLine(p);
			return;
		}

		p.data.budget.push({
			period: p.currentPeriod,
			category: categoryRef,
			amount,
			span: spanFrom(p, start),
		});
		registerCategory(p, categoryRef);

		skipLine(p);
		return;
	}

	p.errors.push(
		invalidEntryError(spanFrom(p, start), `Unexpected character: '${ch}'`),
	);
	skipLine(p);
}

function parseAccountRef(p: Parser): AccountRef | null {
	const start = markStart(p);
	advance(p); // consume '@'
	const name = parseHierarchicalName(p);
	if (!name) {
		p.errors.push(
			invalidEntryError(spanFrom(p, start), "Expected account name after '@'"),
		);
		return null;
	}
	return {
		path: name.split(":"),
		raw: `@${name}`,
		span: spanFrom(p, start),
	};
}

function parseDate(p: Parser): string | null {
	const start = markStart(p);
	const startPos = p.pos;

	for (let i = 0; i < 4; i++) {
		const ch = peek(p);
		if (/[0-9]/.test(ch)) {
			advance(p);
		} else {
			p.errors.push(
				invalidEntryError(
					spanFrom(p, start),
					`Invalid date: '${p.source.slice(startPos, p.pos) + ch}'`,
				),
			);
			return null;
		}
	}

	if (peek(p) !== "-") {
		p.errors.push(
			invalidEntryError(
				spanFrom(p, start),
				`Invalid date: '${p.source.slice(startPos, p.pos)}'`,
			),
		);
		return null;
	}
	advance(p);

	for (let i = 0; i < 2; i++) {
		const ch = peek(p);
		if (/[0-9]/.test(ch)) {
			advance(p);
		} else {
			p.errors.push(
				invalidEntryError(
					spanFrom(p, start),
					`Invalid date: '${p.source.slice(startPos, p.pos) + ch}'`,
				),
			);
			return null;
		}
	}

	if (peek(p) !== "-") {
		p.errors.push(
			invalidEntryError(
				spanFrom(p, start),
				`Invalid date: '${p.source.slice(startPos, p.pos)}'`,
			),
		);
		return null;
	}
	advance(p);

	for (let i = 0; i < 2; i++) {
		const ch = peek(p);
		if (/[0-9]/.test(ch)) {
			advance(p);
		} else {
			p.errors.push(
				invalidEntryError(
					spanFrom(p, start),
					`Invalid date: '${p.source.slice(startPos, p.pos) + ch}'`,
				),
			);
			return null;
		}
	}

	return p.source.slice(startPos, p.pos);
}

function parseTarget(p: Parser): Target | null {
	const ch = peek(p);

	if (ch === "&") {
		const ref = parseCategoryRef(p);
		if (ref) {
			validateCategoryRef(p, ref);
			return { kind: "category", ref };
		}
		return null;
	}

	if (ch === "@") {
		const ref = parseAccountRef(p);
		if (!ref) return null;

		skipHorizontalWhitespace(p);

		let category: CategoryRef | null = null;
		if (peek(p) === "&") {
			category = parseCategoryRef(p);
			if (category) {
				validateCategoryRef(p, category);
			}
		}

		return { kind: "account", ref, category };
	}

	if (ch === "+" || ch === "-" || /[0-9]/.test(ch) || isSymbolStart(p)) {
		const amount = parseAmount(p);
		if (amount) {
			return { kind: "swap", amount };
		}
		return null;
	}

	return null;
}

function parseTagRef(p: Parser): TagRef | null {
	const start = markStart(p);
	advance(p); // consume '#'
	const name = parseHierarchicalName(p);
	if (!name) {
		p.errors.push(
			invalidEntryError(spanFrom(p, start), "Expected tag name after '#'"),
		);
		return null;
	}
	return {
		path: name.split(":"),
		raw: `#${name}`,
		span: spanFrom(p, start),
	};
}

function parseComment(p: Parser): string | null {
	if (peek(p) !== ";") {
		return null;
	}
	advance(p);
	skipHorizontalWhitespace(p);

	const start = p.pos;
	while (!atEnd(p) && peek(p) !== "\n" && peek(p) !== "\r") {
		advance(p);
	}
	const result = p.source.slice(start, p.pos).trim();
	return result || null;
}

function parseLedgerLine(p: Parser): void {
	const start = markStart(p);
	const ch = peek(p);

	if (ch === "@") {
		const accountRef = parseAccountRef(p);
		if (accountRef) {
			p.currentAccount = accountRef;
			registerAccount(p, accountRef);
		}
		skipLine(p);
		return;
	}

	if (ch === "?" || /[0-9]/.test(ch)) {
		if (!p.currentAccount) {
			p.errors.push(
				invalidEntryError(spanFrom(p, start), "Entry before account header"),
			);
			skipLine(p);
			return;
		}

		let unverified = false;
		if (ch === "?") {
			unverified = true;
			advance(p);
			skipHorizontalWhitespace(p);
		}

		const date = parseDate(p);
		if (!date) {
			skipLine(p);
			return;
		}

		skipHorizontalWhitespace(p);

		if (peek(p) === "=" && p.source[p.pos + 1] === "=") {
			advance(p);
			advance(p);
			skipHorizontalWhitespace(p);

			const amount = parseAmount(p);
			if (!amount) {
				p.errors.push(
					invalidEntryError(
						spanFrom(p, markStart(p)),
						"Expected amount after '=='",
					),
				);
				skipLine(p);
				return;
			}

			skipHorizontalWhitespace(p);
			const comment = parseComment(p);

			p.data.ledger.push({
				kind: "assertion",
				date,
				account: p.currentAccount,
				unverified,
				amount,
				comment,
				span: spanFrom(p, start),
			});

			skipLine(p);
			return;
		}

		const amount = parseAmount(p);
		if (!amount) {
			p.errors.push(
				invalidEntryError(spanFrom(p, markStart(p)), "Expected amount"),
			);
			skipLine(p);
			return;
		}

		skipHorizontalWhitespace(p);

		const target = parseTarget(p);
		if (!target) {
			p.errors.push(
				invalidEntryError(
					spanFrom(p, markStart(p)),
					`Expected target, got '${peek(p)}'`,
				),
			);
			skipLine(p);
			return;
		}

		const tags: TagRef[] = [];
		while (true) {
			skipHorizontalWhitespace(p);
			if (peek(p) === "#") {
				const tag = parseTagRef(p);
				if (tag) tags.push(tag);
			} else {
				break;
			}
		}

		skipHorizontalWhitespace(p);
		const comment = parseComment(p);

		p.data.ledger.push({
			kind: "transaction",
			date,
			account: p.currentAccount,
			unverified,
			amount,
			target,
			tags,
			comment,
			span: spanFrom(p, start),
		});

		skipLine(p);
		return;
	}

	p.errors.push(
		invalidEntryError(spanFrom(p, start), `Unexpected character: '${ch}'`),
	);
	skipLine(p);
}

export function parse(source: string): ParseResult {
	const p = createParser(source);

	while (!atEnd(p)) {
		skipBlankLines(p);
		if (atEnd(p)) break;

		skipHorizontalWhitespace(p);
		const ch = peek(p);

		if (ch === ";") {
			skipLine(p);
		} else if (ch === ">") {
			parseSectionMarker(p);
		} else if (p.section === "META") {
			parseMetaDirective(p);
		} else if (p.section === "BUDGET") {
			parseBudgetLine(p);
		} else if (p.section === "LEDGER") {
			parseLedgerLine(p);
		} else {
			const start = markStart(p);
			skipLine(p);
			p.errors.push(
				invalidSectionError(
					spanFrom(p, start),
					"Content before section marker",
				),
			);
		}
	}

	validate(p);

	return { data: p.data, errors: p.errors, warnings: p.warnings };
}
