import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bench, describe } from "vitest";

import { parseChevrotain } from "./chevrotain-parser.js";
import { parse } from "./parser.js";

const examplePath = resolve(__dirname, "../../examples/example.bursa");
const exampleSource = readFileSync(examplePath, "utf-8");

describe("parser", () => {
	bench(
		"handbuilt parser",
		() => {
			parse(exampleSource);
		},
		{
			time: 0,
			warmupTime: 0,
			iterations: 10,
			warmupIterations: 0,
		},
	);

	bench(
		"chevrotain parser",
		() => {
			parseChevrotain(exampleSource);
		},
		{
			time: 0,
			warmupTime: 0,
			iterations: 10,
			warmupIterations: 0,
		},
	);
});
