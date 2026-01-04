import {
	contentBeforeSectionMarker,
	createDiagnostic,
	type Diagnostic,
	invalidDateFormat,
	invalidToken,
	malformedAmount,
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
		},
		budget: [],
		ledger: [],
	};
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
	return p.source[p.pos] ?? "";
}

export function peekCode(p: Parser): number {
	return p.source.charCodeAt(p.pos);
}

export function advance(p: Parser): string {
	const ch = p.source[p.pos] ?? "";
	if (ch === "\n") {
		p.line++;
		p.col = 1;
	} else if (ch !== "") {
		p.col++;
	}
	p.pos++;
	return ch;
}

export function atEnd(p: Parser): boolean {
	return p.pos >= p.source.length;
}

export function skipHorizontalWhitespace(p: Parser): void {
	while (!atEnd(p)) {
		const ch = peek(p);
		if (ch === " " || ch === "\t") {
			advance(p);
		} else {
			break;
		}
	}
}

export function skipToEOL(p: Parser): void {
	while (!atEnd(p) && peek(p) !== "\n") {
		advance(p);
	}
}

export function skipLine(p: Parser): void {
	skipToEOL(p);
	if (peek(p) === "\n") {
		advance(p);
	}
}

export function skipBlankLines(p: Parser): void {
	while (!atEnd(p)) {
		const savedPos = p.pos;
		const savedLine = p.line;
		const savedCol = p.col;

		skipHorizontalWhitespace(p);

		if (peek(p) === "\n") {
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

export function expect(
	p: Parser,
	expected: string,
	errorCode: string,
): boolean {
	if (match(p, expected)) {
		return true;
	}
	addError(p, {
		code: errorCode,
		message: `Expected '${expected}'`,
		severity: "error",
		span: spanFrom(p, markStart(p)),
	});
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

export function addError(p: Parser, diagnostic: Diagnostic): void {
	p.errors.push(diagnostic);
}

export function addWarning(p: Parser, diagnostic: Diagnostic): void {
	p.warnings.push(diagnostic);
}

function parseIdentifier(p: Parser): string {
	let result = "";
	while (!atEnd(p)) {
		const ch = peek(p);
		if (/[a-zA-Z0-9_]/.test(ch)) {
			result += advance(p);
		} else {
			break;
		}
	}
	return result;
}

function parseSymbol(p: Parser): string {
	const ch = peek(p);
	if ("$€£¥₹₽₩₪฿".includes(ch)) {
		return advance(p);
	}
	return parseIdentifier(p);
}

function parseHierarchicalName(p: Parser): string {
	let result = parseIdentifier(p);
	while (peek(p) === ":") {
		const nextChar = p.source[p.pos + 1] ?? "";
		if (/[a-zA-Z0-9_]/.test(nextChar)) {
			result += advance(p);
			result += parseIdentifier(p);
		} else {
			break;
		}
	}
	return result;
}

function parseSectionMarker(p: Parser): void {
	const start = markStart(p);
	if (!match(p, ">>>")) {
		addError(
			p,
			createDiagnostic("E001", "Expected '>>>'", "error", spanFrom(p, start)),
		);
		skipLine(p);
		return;
	}
	skipHorizontalWhitespace(p);

	const nameStart = markStart(p);
	const name = parseIdentifier(p);

	if (name === "META" || name === "BUDGET" || name === "LEDGER") {
		p.section = name;
		p.currentPeriod = null;
		p.currentAccount = null;
	} else {
		addError(
			p,
			createDiagnostic(
				"E001",
				`Unknown section '${name}'`,
				"error",
				spanFrom(p, nameStart),
			),
		);
	}
	skipLine(p);
}

function parseMetaDirective(p: Parser): void {
	const start = markStart(p);
	const keyword = parseIdentifier(p);

	if (!match(p, ":")) {
		addError(
			p,
			createDiagnostic("E001", "Expected ':'", "error", spanFrom(p, start)),
		);
		skipLine(p);
		return;
	}

	skipHorizontalWhitespace(p);

	if (keyword === "commodity") {
		const commodity = parseIdentifier(p);
		if (commodity) {
			p.data.meta.commodities.add(commodity);
		} else {
			addError(
				p,
				createDiagnostic(
					"E001",
					"Expected commodity name",
					"error",
					spanFrom(p, start),
				),
			);
		}
	} else if (keyword === "alias") {
		const symbol = parseSymbol(p);
		skipHorizontalWhitespace(p);
		if (!match(p, "=")) {
			addError(
				p,
				createDiagnostic(
					"E001",
					"Expected '='",
					"error",
					spanFrom(p, markStart(p)),
				),
			);
			skipLine(p);
			return;
		}
		skipHorizontalWhitespace(p);
		const commodity = parseIdentifier(p);
		if (symbol && commodity) {
			p.data.meta.aliases.set(symbol, commodity);
			p.data.meta.commodities.add(commodity);
		}
	} else if (keyword === "untracked") {
		if (!match(p, "@")) {
			addError(
				p,
				createDiagnostic(
					"E001",
					"Expected '@'",
					"error",
					spanFrom(p, markStart(p)),
				),
			);
			skipLine(p);
			return;
		}
		let pattern = "@";
		if (peek(p) === "*") {
			pattern += advance(p);
		} else {
			pattern += parseHierarchicalName(p);
			if (peek(p) === ":") {
				advance(p);
				if (peek(p) === "*") {
					pattern += ":*";
					advance(p);
				}
			}
		}
		p.data.meta.untrackedPatterns.push(pattern);
	} else {
		addError(
			p,
			createDiagnostic(
				"E001",
				`Unknown directive '${keyword}'`,
				"error",
				spanFrom(p, start),
			),
		);
	}

	skipLine(p);
}

function parsePeriod(p: Parser): string | null {
	const start = markStart(p);
	let result = "";

	for (let i = 0; i < 4; i++) {
		const ch = peek(p);
		if (/[0-9]/.test(ch)) {
			result += advance(p);
		} else {
			addError(p, invalidToken(spanFrom(p, start), result + ch));
			return null;
		}
	}

	if (peek(p) !== "-") {
		addError(p, invalidToken(spanFrom(p, start), result));
		return null;
	}
	result += advance(p);

	for (let i = 0; i < 2; i++) {
		const ch = peek(p);
		if (/[0-9]/.test(ch)) {
			result += advance(p);
		} else {
			addError(p, invalidToken(spanFrom(p, start), result + ch));
			return null;
		}
	}

	return result;
}

function parseCategoryRef(p: Parser): CategoryRef | null {
	const start = markStart(p);
	if (!match(p, "&")) {
		return null;
	}
	const name = parseHierarchicalName(p);
	if (!name) {
		addError(p, invalidToken(spanFrom(p, start), "&"));
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
	const ch = peek(p);

	if ("$€£¥₹₽₩₪฿".includes(ch)) {
		const symbol = advance(p);
		commodity = resolveCommodity(p, symbol);
	}

	const numStart = markStart(p);
	let numStr = "";
	let seenDot = false;
	while (!atEnd(p)) {
		const c = peek(p);
		if (/[0-9]/.test(c)) {
			numStr += advance(p);
		} else if (c === "." && !seenDot) {
			seenDot = true;
			numStr += advance(p);
		} else {
			break;
		}
	}

	if (!numStr || numStr === ".") {
		return null;
	}

	const value = parseFloat(numStr);
	if (Number.isNaN(value)) {
		addError(p, malformedAmount(spanFrom(p, numStart), numStr));
		return null;
	}

	if (!commodity) {
		skipHorizontalWhitespace(p);
		const afterNum = peek(p);
		if ("$€£¥₹₽₩₪฿".includes(afterNum)) {
			commodity = resolveCommodity(p, advance(p));
		} else if (/[a-zA-Z]/.test(afterNum)) {
			const ident = parseIdentifier(p);
			commodity = resolveCommodity(p, ident);
		}
	}

	if (!commodity) {
		addError(p, malformedAmount(spanFrom(p, start), numStr));
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
			addError(p, invalidToken(spanFrom(p, start), ch));
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
			addError(p, malformedAmount(spanFrom(p, markStart(p)), ""));
			skipLine(p);
			return;
		}

		p.data.budget.push({
			period: p.currentPeriod,
			category: categoryRef,
			amount,
			span: spanFrom(p, start),
		});

		skipLine(p);
		return;
	}

	addError(p, invalidToken(spanFrom(p, start), ch));
	skipLine(p);
}

function parseAccountRef(p: Parser): AccountRef | null {
	const start = markStart(p);
	if (!match(p, "@")) {
		return null;
	}
	const name = parseHierarchicalName(p);
	if (!name) {
		addError(p, invalidToken(spanFrom(p, start), "@"));
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
	let result = "";

	for (let i = 0; i < 4; i++) {
		const ch = peek(p);
		if (/[0-9]/.test(ch)) {
			result += advance(p);
		} else {
			addError(p, invalidDateFormat(spanFrom(p, start), result + ch));
			return null;
		}
	}

	if (peek(p) !== "-") {
		addError(p, invalidDateFormat(spanFrom(p, start), result));
		return null;
	}
	result += advance(p);

	for (let i = 0; i < 2; i++) {
		const ch = peek(p);
		if (/[0-9]/.test(ch)) {
			result += advance(p);
		} else {
			addError(p, invalidDateFormat(spanFrom(p, start), result + ch));
			return null;
		}
	}

	if (peek(p) !== "-") {
		addError(p, invalidDateFormat(spanFrom(p, start), result));
		return null;
	}
	result += advance(p);

	for (let i = 0; i < 2; i++) {
		const ch = peek(p);
		if (/[0-9]/.test(ch)) {
			result += advance(p);
		} else {
			addError(p, invalidDateFormat(spanFrom(p, start), result + ch));
			return null;
		}
	}

	return result;
}

function parseTarget(p: Parser): Target | null {
	const ch = peek(p);

	if (ch === "&") {
		const ref = parseCategoryRef(p);
		if (ref) {
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
		}

		return { kind: "account", ref, category };
	}

	if (
		ch === "+" ||
		ch === "-" ||
		/[0-9]/.test(ch) ||
		"$€£¥₹₽₩₪฿".includes(ch)
	) {
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
	if (!match(p, "#")) {
		return null;
	}
	const name = parseHierarchicalName(p);
	if (!name) {
		addError(p, invalidToken(spanFrom(p, start), "#"));
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

	let result = "";
	while (!atEnd(p) && peek(p) !== "\n") {
		result += advance(p);
	}
	return result.trim() || null;
}

function parseLedgerLine(p: Parser): void {
	const start = markStart(p);
	const ch = peek(p);

	if (ch === "@") {
		const accountRef = parseAccountRef(p);
		if (accountRef) {
			p.currentAccount = accountRef;
		}
		skipLine(p);
		return;
	}

	if (ch === "?" || /[0-9]/.test(ch)) {
		if (!p.currentAccount) {
			addError(p, invalidToken(spanFrom(p, start), ch));
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
				addError(p, malformedAmount(spanFrom(p, markStart(p)), ""));
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
			addError(p, malformedAmount(spanFrom(p, markStart(p)), ""));
			skipLine(p);
			return;
		}

		skipHorizontalWhitespace(p);

		const target = parseTarget(p);
		if (!target) {
			addError(p, invalidToken(spanFrom(p, markStart(p)), peek(p)));
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

	addError(p, invalidToken(spanFrom(p, start), ch));
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
			addError(p, contentBeforeSectionMarker(spanFrom(p, start)));
		}
	}

	return { data: p.data, errors: p.errors, warnings: p.warnings };
}
