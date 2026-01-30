import type { Diagnostic } from "../parser";
import { parse } from "../parser";

interface PlanRow {
	month: string;
	categoryGroup: string;
	category: string;
	assigned: number;
}

interface RegisterRow {
	account: string;
	flag: string;
	date: string;
	payee: string;
	categoryGroupCategory: string;
	categoryGroup: string;
	category: string;
	memo: string;
	outflow: number;
	inflow: number;
	cleared: string;
}

function validateHeaders(
	actual: string[],
	expected: string[],
	fileType: string,
): void {
	const missing = expected.filter((h) => !actual.includes(h));
	const extra = actual.filter((h) => !expected.includes(h));

	if (missing.length > 0 || extra.length > 0) {
		const errors: string[] = [];
		if (missing.length > 0) {
			errors.push(`Missing columns: ${missing.join(", ")}`);
		}
		if (extra.length > 0) {
			errors.push(`Unexpected columns: ${extra.join(", ")}`);
		}
		throw new Error(`Invalid ${fileType} CSV headers. ${errors.join("; ")}`);
	}
}

function parseCSV<T>(
	csv: string,
	expectedHeaders: string[],
	fileType: string,
	mapper: (headers: string[], values: string[]) => T,
): T[] {
	const cleanedCSV = csv.replace(/^\uFEFF/, "");
	const lines = cleanedCSV.split(/\r?\n/);
	if (lines.length < 2) return [];

	const headers = parseCSVLine(lines[0]);
	validateHeaders(headers, expectedHeaders, fileType);

	const rows: T[] = [];

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;
		const values = parseCSVLine(line);
		rows.push(mapper(headers, values));
	}

	return rows;
}

function parseCSVLine(line: string): string[] {
	const values: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (char === "," && !inQuotes) {
			values.push(current);
			current = "";
		} else {
			current += char;
		}
	}
	values.push(current);

	return values;
}

const PLAN_HEADERS = [
	"Month",
	"Category Group/Category",
	"Category Group",
	"Category",
	"Assigned",
	"Activity",
	"Available",
];

function parsePlanRow(headers: string[], values: string[]): PlanRow {
	const get = (name: string) => values[headers.indexOf(name)] ?? "";
	return {
		month: get("Month"),
		categoryGroup: get("Category Group"),
		category: get("Category"),
		assigned: Number.parseFloat(get("Assigned")) || 0,
	};
}

const REGISTER_HEADERS = [
	"Account",
	"Flag",
	"Date",
	"Payee",
	"Category Group/Category",
	"Category Group",
	"Category",
	"Memo",
	"Outflow",
	"Inflow",
	"Cleared",
];

function parseRegisterRow(headers: string[], values: string[]): RegisterRow {
	const get = (name: string) => values[headers.indexOf(name)] ?? "";
	return {
		account: get("Account"),
		flag: get("Flag"),
		date: get("Date"),
		payee: get("Payee"),
		categoryGroupCategory: get("Category Group/Category"),
		categoryGroup: get("Category Group"),
		category: get("Category"),
		memo: get("Memo"),
		outflow: Number.parseFloat(get("Outflow")) || 0,
		inflow: Number.parseFloat(get("Inflow")) || 0,
		cleared: get("Cleared"),
	};
}

function sanitizeName(name: string): string {
	return name
		.replace(/[:@&#;+\-.?>=]/g, "")
		.replace(/\s+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function formatYearMonth(ynabMonth: string): string {
	const months: Record<string, string> = {
		Jan: "01",
		Feb: "02",
		Mar: "03",
		Apr: "04",
		May: "05",
		Jun: "06",
		Jul: "07",
		Aug: "08",
		Sep: "09",
		Oct: "10",
		Nov: "11",
		Dec: "12",
	};
	const [mon, year] = ynabMonth.split(" ");
	return `${year}-${months[mon]}`;
}

function formatAmount(value: number, symbol: string): string {
	const formatted = value.toFixed(2).replace(/\.00$/, "");
	return `${formatted} ${symbol}`;
}

interface ConvertOptions {
	commodity: string;
	symbol: string;
}

export function convertYNAB(
	planCSV: string,
	registerCSV: string,
	options: ConvertOptions,
): string {
	const { commodity, symbol } = options;
	const planRows = parseCSV(planCSV, PLAN_HEADERS, "plan", parsePlanRow);
	const registerRows = parseCSV(
		registerCSV,
		REGISTER_HEADERS,
		"register",
		parseRegisterRow,
	);

	const accounts = new Set<string>();
	const untrackedAccounts = new Set<string>();
	const categoryHierarchy = new Map<string, Set<string>>();

	for (const row of registerRows) {
		accounts.add(row.account);
		if (row.categoryGroup === "Inflow" && row.category === "Ready to Assign") {
			continue;
		}
		if (
			row.payee.startsWith("Transfer : ") &&
			!row.categoryGroup &&
			!row.category
		) {
			continue;
		}
		if (
			row.payee.startsWith("Transfer : ") &&
			row.categoryGroup &&
			row.category
		) {
			const targetAccount = row.payee.replace("Transfer : ", "");
			untrackedAccounts.add(targetAccount);
		}
	}

	for (const row of planRows) {
		if (!row.categoryGroup || !row.category) continue;
		if (!categoryHierarchy.has(row.categoryGroup)) {
			categoryHierarchy.set(row.categoryGroup, new Set());
		}
		categoryHierarchy.get(row.categoryGroup)?.add(row.category);
	}

	const lines: string[] = [];

	lines.push(">>> META");
	lines.push(`commodity: ${symbol} = ${commodity}`);
	lines.push("");

	const sortedUntrackedAccounts = Array.from(untrackedAccounts).sort();
	for (const account of sortedUntrackedAccounts) {
		lines.push(`untracked: @${sanitizeName(account)}`);
	}
	if (sortedUntrackedAccounts.length > 0) {
		lines.push("");
	}

	lines.push(">>> BUDGET");
	const budgetByPeriod = new Map<string, Map<string, number>>();

	for (const row of planRows) {
		if (!row.month || !row.categoryGroup || !row.category) continue;
		if (row.assigned === 0) continue;

		const period = formatYearMonth(row.month);
		let periodBudget = budgetByPeriod.get(period);
		if (!periodBudget) {
			periodBudget = new Map();
			budgetByPeriod.set(period, periodBudget);
		}

		const categoryName = `${sanitizeName(row.categoryGroup)}:${sanitizeName(row.category)}`;
		periodBudget.set(
			categoryName,
			(periodBudget.get(categoryName) ?? 0) + row.assigned,
		);
	}

	const sortedPeriods = Array.from(budgetByPeriod.keys()).sort();
	for (const period of sortedPeriods) {
		lines.push(period);
		const categories = budgetByPeriod.get(period);
		if (!categories) continue;
		const sortedCategories = Array.from(categories.keys()).sort();
		for (const cat of sortedCategories) {
			const amount = categories.get(cat);
			if (amount === undefined) continue;
			lines.push(`  &${cat} ${formatAmount(amount, symbol)}`);
		}
		lines.push("");
	}

	lines.push(">>> LEDGER");

	const txByAccount = new Map<string, RegisterRow[]>();
	const seenTransfers = new Set<string>();
	const allAccounts = new Set<string>();

	for (const row of registerRows) {
		if (!row.account.trim()) continue;
		allAccounts.add(row.account);

		if (row.payee.startsWith("Transfer : ")) {
			const targetAccount = row.payee.replace("Transfer : ", "");
			allAccounts.add(targetAccount);

			const amount = row.outflow > 0 ? row.outflow : row.inflow;
			const [acct1, acct2] =
				row.account < targetAccount
					? [row.account, targetAccount]
					: [targetAccount, row.account];
			const transferKey = `${row.date}|${acct1}|${acct2}|${amount.toFixed(2)}`;

			if (row.inflow > 0 && !row.categoryGroup && !row.category) {
				seenTransfers.add(transferKey);
				continue;
			}

			if (seenTransfers.has(transferKey)) {
				continue;
			}
			seenTransfers.add(transferKey);
		}

		let accountTxs = txByAccount.get(row.account);
		if (!accountTxs) {
			accountTxs = [];
			txByAccount.set(row.account, accountTxs);
		}
		accountTxs.push(row);
	}

	for (const account of allAccounts) {
		if (!txByAccount.has(account)) {
			txByAccount.set(account, []);
		}
	}

	const sortedAccounts = Array.from(txByAccount.keys()).sort();

	for (const account of sortedAccounts) {
		const transactions = txByAccount.get(account);
		if (!transactions) continue;

		transactions.sort((a, b) => a.date.localeCompare(b.date));

		const sanitizedAccount = sanitizeName(account);
		if (!sanitizedAccount) continue;

		lines.push(`@${sanitizedAccount}`);

		for (const tx of transactions) {
			const parts: string[] = [];

			const unverified = tx.cleared === "Uncleared" ? "? " : "";
			parts.push(unverified + tx.date);

			const netAmount = tx.inflow - tx.outflow;
			const sign = netAmount >= 0 ? "+" : "";
			const amountStr = `${sign}${formatAmount(netAmount, symbol)}`;
			parts.push(amountStr);

			if (tx.payee.startsWith("Transfer : ")) {
				const targetAccount = tx.payee.replace("Transfer : ", "");
				parts.push(`@${sanitizeName(targetAccount)}`);

				if (tx.categoryGroup && tx.category) {
					const catName = `${sanitizeName(tx.categoryGroup)}:${sanitizeName(tx.category)}`;
					parts.push(`&${catName}`);
				}
			} else if (tx.categoryGroup && tx.category) {
				if (
					tx.categoryGroup === "Inflow" &&
					tx.category === "Ready to Assign"
				) {
					parts.push("&Unassigned");
				} else {
					const catName = `${sanitizeName(tx.categoryGroup)}:${sanitizeName(tx.category)}`;
					parts.push(`&${catName}`);
				}
			} else {
				parts.push("&Unassigned");
			}

			if (tx.payee && !tx.payee.startsWith("Transfer : ")) {
				const sanitizedPayee = sanitizeName(tx.payee);
				if (sanitizedPayee) {
					parts.push(`#payee:${sanitizedPayee}`);
				}
			}

			if (tx.memo) {
				const sanitizedMemo = tx.memo.replace(/;/g, ",").trim();
				if (sanitizedMemo) {
					parts.push(`; ${sanitizedMemo}`);
				}
			}

			lines.push(`  ${parts.join(" ")}`);
		}

		lines.push("");
	}

	return lines.join("\n");
}

export interface ConvertResult {
	output: string;
	errors: Diagnostic[];
	warnings: Diagnostic[];
}

export function convertAndValidate(
	planCSV: string,
	registerCSV: string,
	options: ConvertOptions,
): ConvertResult {
	const output = convertYNAB(planCSV, registerCSV, options);

	const parseResult = parse(output);

	return {
		output,
		errors: parseResult.errors,
		warnings: parseResult.warnings,
	};
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const fs = await import("node:fs");
	const path = await import("node:path");

	const args = process.argv.slice(2);
	const planPath = args[0] ?? "./data/ynab/plan.csv";
	const registerPath = args[1] ?? "./data/ynab/register.csv";
	const outputPath = args[2] ?? "./data/ynab/exported.bursa";

	const planCSV = fs.readFileSync(path.resolve(planPath), "utf-8");
	const registerCSV = fs.readFileSync(path.resolve(registerPath), "utf-8");

	const result = convertAndValidate(planCSV, registerCSV, {
		commodity: "EUR",
		symbol: "€",
	});

	fs.writeFileSync(path.resolve(outputPath), result.output);

	console.log(`Wrote ${outputPath}`);
	console.log(`Errors: ${result.errors.length}`);
	console.log(`Warnings: ${result.warnings.length}`);

	if (result.errors.length > 0) {
		console.log("\nErrors:");
		for (const e of result.errors) {
			console.log(`  [${e.name}] ${e.message}`);
		}
	}
}
