import {
	CstNode,
	CstParser,
	ILexingResult,
	IToken,
	Lexer,
	createToken,
} from "chevrotain";

// ============================================================================
// Tokens
// ============================================================================

const WhiteSpace = createToken({
	name: "WhiteSpace",
	pattern: /[ \t]+/,
	group: Lexer.SKIPPED,
});

const NewLine = createToken({
	name: "NewLine",
	pattern: /\r?\n/,
});

const Comment = createToken({
	name: "Comment",
	pattern: /;[^\r\n]*/,
});

const SectionMeta = createToken({
	name: "SectionMeta",
	pattern: />>> *META/,
});

const SectionBudget = createToken({
	name: "SectionBudget",
	pattern: />>> *BUDGET/,
});

const SectionLedger = createToken({
	name: "SectionLedger",
	pattern: />>> *LEDGER/,
});

const Commodity = createToken({
	name: "Commodity",
	pattern: /commodity:/,
});

const Untracked = createToken({
	name: "Untracked",
	pattern: /untracked:/,
});

const Equals = createToken({
	name: "Equals",
	pattern: /=/,
});

const DoubleEquals = createToken({
	name: "DoubleEquals",
	pattern: /==/,
});

const QuestionMark = createToken({
	name: "QuestionMark",
	pattern: /\?/,
});

const Colon = createToken({
	name: "Colon",
	pattern: /:/,
});

const Asterisk = createToken({
	name: "Asterisk",
	pattern: /\*/,
});

const Plus = createToken({
	name: "Plus",
	pattern: /\+/,
});

const Minus = createToken({
	name: "Minus",
	pattern: /-/,
});

const AccountPrefix = createToken({
	name: "AccountPrefix",
	pattern: /@/,
});

const CategoryPrefix = createToken({
	name: "CategoryPrefix",
	pattern: /&/,
});

const TagPrefix = createToken({
	name: "TagPrefix",
	pattern: /#/,
});

const Date_ = createToken({
	name: "Date",
	pattern: /[0-9]{4}-[0-9]{2}-[0-9]{2}/,
});

const YearMonth = createToken({
	name: "YearMonth",
	pattern: /[0-9]{4}-[0-9]{2}/,
});

const Number_ = createToken({
	name: "Number",
	pattern: /[0-9]+(\.[0-9]+)?/,
});

// Matches symbol prefix attached to a number, e.g., RM1200, $500
// This is a key difference from the handbuilt parser which uses known symbols
const PrefixedAmount = createToken({
	name: "PrefixedAmount",
	pattern: /[a-zA-Z$€£¥₹₽₩₪฿]+[0-9]+(\.[0-9]+)?/,
});

const Identifier = createToken({
	name: "Identifier",
	pattern: /[a-zA-Z_][a-zA-Z0-9_]*/,
});

// Currency symbols (must come after other specific patterns)
const CurrencySymbol = createToken({
	name: "CurrencySymbol",
	pattern: /[$€£¥₹₽₩₪฿]/,
});

// Order matters: more specific patterns first
const allTokens = [
	WhiteSpace,
	NewLine,
	Comment,
	SectionMeta,
	SectionBudget,
	SectionLedger,
	DoubleEquals,
	Commodity,
	Untracked,
	Equals,
	QuestionMark,
	Colon,
	Asterisk,
	Plus,
	Minus,
	AccountPrefix,
	CategoryPrefix,
	TagPrefix,
	Date_,
	YearMonth,
	PrefixedAmount, // Must come before Number_ and Identifier
	Number_,
	CurrencySymbol,
	Identifier,
];

const BursaLexer = new Lexer(allTokens);

// ============================================================================
// Parser
// ============================================================================

class BursaParser extends CstParser {
	constructor() {
		super(allTokens);
		this.performSelfAnalysis();
	}

	public file = this.RULE("file", () => {
		this.MANY(() => {
			this.OR([
				{ ALT: () => this.SUBRULE(this.metaSection) },
				{ ALT: () => this.SUBRULE(this.budgetSection) },
				{ ALT: () => this.SUBRULE(this.ledgerSection) },
				{ ALT: () => this.CONSUME(NewLine) },
				{ ALT: () => this.CONSUME(Comment) },
			]);
		});
	});

	private metaSection = this.RULE("metaSection", () => {
		this.CONSUME(SectionMeta);
		this.OPTION(() => this.CONSUME(Comment));
		this.CONSUME(NewLine);
		this.MANY(() => {
			this.OR([
				{ ALT: () => this.SUBRULE(this.commodityDirective) },
				{ ALT: () => this.SUBRULE(this.untrackedDirective) },
				{ ALT: () => this.CONSUME2(NewLine) },
				{ ALT: () => this.CONSUME2(Comment) },
			]);
		});
	});

	private commodityDirective = this.RULE("commodityDirective", () => {
		this.CONSUME(Commodity);
		this.OPTION(() => {
			this.OR([
				{ ALT: () => this.CONSUME(CurrencySymbol) },
				{ ALT: () => this.CONSUME(Identifier) },
			]);
			this.CONSUME(Equals);
		});
		this.CONSUME2(Identifier);
		this.OPTION2(() => this.CONSUME(Comment));
		this.CONSUME(NewLine);
	});

	private untrackedDirective = this.RULE("untrackedDirective", () => {
		this.CONSUME(Untracked);
		this.SUBRULE(this.accountPattern);
		this.OPTION(() => this.CONSUME(Comment));
		this.CONSUME(NewLine);
	});

	private accountPattern = this.RULE("accountPattern", () => {
		this.CONSUME(AccountPrefix);
		this.CONSUME(Identifier);
		this.MANY(() => {
			this.CONSUME(Colon);
			this.OR([
				{ ALT: () => this.CONSUME2(Identifier) },
				{ ALT: () => this.CONSUME(Asterisk) },
			]);
		});
	});

	private budgetSection = this.RULE("budgetSection", () => {
		this.CONSUME(SectionBudget);
		this.OPTION(() => this.CONSUME(Comment));
		this.CONSUME(NewLine);
		this.MANY(() => {
			this.OR([
				{ ALT: () => this.SUBRULE(this.budgetPeriod) },
				{ ALT: () => this.CONSUME2(NewLine) },
				{ ALT: () => this.CONSUME2(Comment) },
			]);
		});
	});

	private budgetPeriod = this.RULE("budgetPeriod", () => {
		this.CONSUME(YearMonth);
		this.OPTION(() => this.CONSUME(Comment));
		this.CONSUME(NewLine);
		this.MANY(() => {
			this.OR([
				{ ALT: () => this.SUBRULE(this.budgetEntry) },
				{ ALT: () => this.CONSUME2(NewLine) },
				{ ALT: () => this.CONSUME2(Comment) },
			]);
		});
	});

	private budgetEntry = this.RULE("budgetEntry", () => {
		this.SUBRULE(this.categoryRef);
		this.SUBRULE(this.amount);
		this.OPTION(() => this.CONSUME(Comment));
		this.CONSUME(NewLine);
	});

	private ledgerSection = this.RULE("ledgerSection", () => {
		this.CONSUME(SectionLedger);
		this.OPTION(() => this.CONSUME(Comment));
		this.CONSUME(NewLine);
		this.MANY(() => {
			this.OR([
				{ ALT: () => this.SUBRULE(this.accountBlock) },
				{ ALT: () => this.CONSUME2(NewLine) },
				{ ALT: () => this.CONSUME2(Comment) },
			]);
		});
	});

	private accountBlock = this.RULE("accountBlock", () => {
		this.SUBRULE(this.accountRef);
		this.OPTION(() => this.CONSUME(Comment));
		this.CONSUME(NewLine);
		this.MANY(() => {
			this.OR([
				{ ALT: () => this.SUBRULE(this.ledgerEntry) },
				{ ALT: () => this.CONSUME2(NewLine) },
				{ ALT: () => this.CONSUME2(Comment) },
			]);
		});
	});

	private ledgerEntry = this.RULE("ledgerEntry", () => {
		this.OPTION(() => this.CONSUME(QuestionMark));
		this.CONSUME(Date_);
		this.OR([
			{ ALT: () => this.SUBRULE(this.assertion) },
			{ ALT: () => this.SUBRULE(this.transaction) },
		]);
		this.OPTION2(() => this.CONSUME(Comment));
		this.CONSUME(NewLine);
	});

	private assertion = this.RULE("assertion", () => {
		this.CONSUME(DoubleEquals);
		this.SUBRULE(this.amount);
	});

	private transaction = this.RULE("transaction", () => {
		this.SUBRULE(this.amount);
		this.SUBRULE(this.target);
		this.MANY(() => this.SUBRULE(this.tagRef));
	});

	private target = this.RULE("target", () => {
		this.OR([
			{ ALT: () => this.SUBRULE(this.categoryRef) },
			{
				ALT: () => {
					this.SUBRULE(this.accountRef);
					this.OPTION(() => this.SUBRULE2(this.categoryRef));
				},
			},
			{ ALT: () => this.SUBRULE(this.amount) }, // swap
		]);
	});

	private amount = this.RULE("amount", () => {
		this.OPTION(() => {
			this.OR([
				{ ALT: () => this.CONSUME(Plus) },
				{ ALT: () => this.CONSUME(Minus) },
			]);
		});
		this.OR2([
			// Prefixed amount like RM1200, $500
			{ ALT: () => this.CONSUME(PrefixedAmount) },
			// Symbol then number: $ 500
			{
				ALT: () => {
					this.OR3([
						{ ALT: () => this.CONSUME(CurrencySymbol) },
						{ ALT: () => this.CONSUME(Identifier) },
					]);
					this.CONSUME(Number_);
				},
			},
			// Number then symbol: 500 $
			{
				ALT: () => {
					this.CONSUME2(Number_);
					this.OR4([
						{ ALT: () => this.CONSUME2(CurrencySymbol) },
						{ ALT: () => this.CONSUME2(Identifier) },
					]);
				},
			},
		]);
	});

	private accountRef = this.RULE("accountRef", () => {
		this.CONSUME(AccountPrefix);
		this.CONSUME(Identifier);
		this.MANY(() => {
			this.CONSUME(Colon);
			this.CONSUME2(Identifier);
		});
	});

	private categoryRef = this.RULE("categoryRef", () => {
		this.CONSUME(CategoryPrefix);
		this.CONSUME(Identifier);
		this.MANY(() => {
			this.CONSUME(Colon);
			this.CONSUME2(Identifier);
		});
	});

	private tagRef = this.RULE("tagRef", () => {
		this.CONSUME(TagPrefix);
		this.CONSUME(Identifier);
		this.MANY(() => {
			this.CONSUME(Colon);
			this.CONSUME2(Identifier);
		});
	});
}

// ============================================================================
// Export
// ============================================================================

const parserInstance = new BursaParser();

export interface ChevrotainParseResult {
	cst: CstNode | undefined;
	lexErrors: ILexingResult["errors"];
	parseErrors: ReturnType<typeof parserInstance.errors>;
}

export function parseChevrotain(source: string): ChevrotainParseResult {
	const lexResult = BursaLexer.tokenize(source);
	parserInstance.input = lexResult.tokens;
	const cst = parserInstance.file();

	return {
		cst,
		lexErrors: lexResult.errors,
		parseErrors: parserInstance.errors,
	};
}
