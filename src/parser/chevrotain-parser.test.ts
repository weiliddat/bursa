import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseChevrotain } from "./chevrotain-parser.js";

const examplePath = resolve(__dirname, "../../examples/example.bursa");
const exampleSource = readFileSync(examplePath, "utf-8");

describe("chevrotain parser", () => {
	it("parses example.bursa without errors", () => {
		const result = parseChevrotain(exampleSource);

		expect(result.lexErrors).toHaveLength(0);
		expect(result.parseErrors).toHaveLength(0);
		expect(result.cst).toBeDefined();
	});

	it("parses META section", () => {
		const source = `>>> META
commodity: $ = USD
commodity: AAPL
untracked: @Brokerage
`;
		const result = parseChevrotain(source);

		expect(result.lexErrors).toHaveLength(0);
		expect(result.parseErrors).toHaveLength(0);
	});

	it("parses BUDGET section", () => {
		const source = `>>> BUDGET
2026-01
  &Groceries 500 $
  &Investing 1000 $
`;
		const result = parseChevrotain(source);

		expect(result.lexErrors).toHaveLength(0);
		expect(result.parseErrors).toHaveLength(0);
	});

	it("parses LEDGER section", () => {
		const source = `>>> LEDGER
@Checking
  2026-01-01 +5000 $ &Unassigned
  2026-01-15 -100 $ &Groceries #traderjoes
  2026-01-20 -1000 $ @Savings
  2026-01-31 == $6800
`;
		const result = parseChevrotain(source);

		expect(result.lexErrors).toHaveLength(0);
		expect(result.parseErrors).toHaveLength(0);
	});

	it("parses swap transactions", () => {
		const source = `>>> LEDGER
@Brokerage
  2026-01-21 -1000 $ +6.5 AAPL
`;
		const result = parseChevrotain(source);

		expect(result.lexErrors).toHaveLength(0);
		expect(result.parseErrors).toHaveLength(0);
	});
});
