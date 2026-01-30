import { describe, expect, it } from "vitest";
import { convertAndValidate, convertYNAB } from "./ynab";

describe("YNAB converter", () => {
	const planCSV = `"Month","Category Group/Category","Category Group","Category","Assigned","Activity","Available"
"Jan 2021","Monthly Fixed: Rent","Monthly Fixed","Rent",700.00,0.00,700.00
"Jan 2021","True Expenses: Groceries","True Expenses","Groceries",200.00,-150.00,50.00
"Feb 2021","Monthly Fixed: Rent","Monthly Fixed","Rent",700.00,-700.00,0.00`;

	const registerCSV = `"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"
"Checking","","2021-01-01","Opening Balance","Inflow: Ready to Assign","Inflow","Ready to Assign","",0.00,5000.00,"Cleared"
"Checking","","2021-01-15","Supermarket","True Expenses: Groceries","True Expenses","Groceries","Weekly groceries",150.00,0.00,"Cleared"
"Checking","","2021-01-20","Transfer : Savings","","","","",1000.00,0.00,"Cleared"
"Savings","","2021-01-20","Transfer : Checking","","","","",0.00,1000.00,"Cleared"
"Checking","","2021-02-01","Landlord","Monthly Fixed: Rent","Monthly Fixed","Rent","",700.00,0.00,"Uncleared"`;

	it("generates valid META section", () => {
		const output = convertYNAB(planCSV, registerCSV, {
			commodity: "EUR",
			symbol: "€",
		});
		expect(output).toContain(">>> META");
		expect(output).toContain("commodity: € = EUR");
	});

	it("generates BUDGET section with allocations", () => {
		const output = convertYNAB(planCSV, registerCSV, {
			commodity: "EUR",
			symbol: "€",
		});
		expect(output).toContain(">>> BUDGET");
		expect(output).toContain("2021-01");
		expect(output).toContain("&Monthly_Fixed:Rent 700 €");
		expect(output).toContain("&True_Expenses:Groceries 200 €");
	});

	it("generates LEDGER section with transactions", () => {
		const output = convertYNAB(planCSV, registerCSV, {
			commodity: "EUR",
			symbol: "€",
		});
		expect(output).toContain(">>> LEDGER");
		expect(output).toContain("@Checking");
		expect(output).toContain("+5000 € &Unassigned");
		expect(output).toContain("-150 € &True_Expenses:Groceries");
	});

	it("marks uncleared transactions with ?", () => {
		const output = convertYNAB(planCSV, registerCSV, {
			commodity: "EUR",
			symbol: "€",
		});
		expect(output).toContain("? 2021-02-01 -700 €");
	});

	it("deduplicates transfer pairs", () => {
		const output = convertYNAB(planCSV, registerCSV, {
			commodity: "EUR",
			symbol: "€",
		});
		const transferMatches = output.match(/@Savings/g);
		expect(transferMatches).toBeTruthy();
		expect(output).toContain("-1000 € @Savings");
		expect(output).not.toContain("+1000 € @Checking");
	});

	it("includes payee as tag", () => {
		const output = convertYNAB(planCSV, registerCSV, {
			commodity: "EUR",
			symbol: "€",
		});
		expect(output).toContain("#payee:Supermarket");
		expect(output).toContain("#payee:Landlord");
	});

	it("preserves memos as comments", () => {
		const output = convertYNAB(planCSV, registerCSV, {
			commodity: "EUR",
			symbol: "€",
		});
		expect(output).toContain("; Weekly groceries");
	});

	it("validates output parses without errors", () => {
		const result = convertAndValidate(planCSV, registerCSV, {
			commodity: "EUR",
			symbol: "€",
		});
		expect(result.errors).toHaveLength(0);
	});

	it("handles BOM in CSV", () => {
		const bomPlanCSV = `\uFEFF"Month","Category Group/Category","Category Group","Category","Assigned","Activity","Available"
"Jan 2021","Savings: Emergency","Savings","Emergency",500.00,0.00,500.00`;

		const bomRegisterCSV = `\uFEFF"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"
"Bank","","2021-01-01","Salary","Inflow: Ready to Assign","Inflow","Ready to Assign","",0.00,3000.00,"Cleared"`;

		const output = convertYNAB(bomPlanCSV, bomRegisterCSV, {
			commodity: "USD",
			symbol: "$",
		});
		expect(output).toContain("@Bank");
		expect(output).toContain("&Savings:Emergency 500 $");
	});

	it("sanitizes special characters in names", () => {
		const specialPlanCSV = `"Month","Category Group/Category","Category Group","Category","Assigned","Activity","Available"
"Jan 2021","Life & Goals: Vacation 🏖️","Life & Goals","Vacation 🏖️",100.00,0.00,100.00`;

		const specialRegisterCSV = `"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"
"N26-Bank","","2021-01-01","Company Inc.","Inflow: Ready to Assign","Inflow","Ready to Assign","",0.00,1000.00,"Cleared"`;

		const output = convertYNAB(specialPlanCSV, specialRegisterCSV, {
			commodity: "EUR",
			symbol: "€",
		});
		expect(output).toContain("@N26Bank");
		expect(output).toContain("&Life_Goals:Vacation");
		expect(output).not.toContain("🏖️");
		expect(output).not.toContain("Life & Goals");
	});

	it("handles transfers to untracked accounts with category", () => {
		const planCSV = `"Month","Category Group/Category","Category Group","Category","Assigned","Activity","Available"
"Jan 2021","Investing: Stocks","Investing","Stocks",500.00,-500.00,0.00`;

		const registerCSV = `"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"
"Checking","","2021-01-15","Transfer : Brokerage","Investing: Stocks","Investing","Stocks","",500.00,0.00,"Cleared"
"Brokerage","","2021-01-15","Transfer : Checking","","","","",0.00,500.00,"Cleared"`;

		const output = convertYNAB(planCSV, registerCSV, {
			commodity: "EUR",
			symbol: "€",
		});
		expect(output).toContain("untracked: @Brokerage");
		expect(output).toContain("-500 € @Brokerage &Investing:Stocks");
	});

	it("skips zero-assigned budget entries", () => {
		const planCSV = `"Month","Category Group/Category","Category Group","Category","Assigned","Activity","Available"
"Jan 2021","Bills: Electric","Bills","Electric",0.00,0.00,0.00
"Jan 2021","Bills: Water","Bills","Water",50.00,0.00,50.00`;

		const registerCSV = `"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"`;

		const output = convertYNAB(planCSV, registerCSV, {
			commodity: "EUR",
			symbol: "€",
		});
		expect(output).not.toContain("&Bills:Electric");
		expect(output).toContain("&Bills:Water 50 €");
	});

	it("throws error for invalid plan CSV headers", () => {
		const invalidPlanCSV = `"Month","Category","Assigned"
"Jan 2021","Rent",700.00`;

		const registerCSV = `"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"`;

		expect(() =>
			convertYNAB(invalidPlanCSV, registerCSV, {
				commodity: "EUR",
				symbol: "€",
			}),
		).toThrow("Invalid plan CSV headers");
	});

	it("throws error for invalid register CSV headers", () => {
		const planCSV = `"Month","Category Group/Category","Category Group","Category","Assigned","Activity","Available"
"Jan 2021","Monthly Fixed: Rent","Monthly Fixed","Rent",700.00,0.00,700.00`;

		const invalidRegisterCSV = `"Account","Date","Amount"
"Checking","2021-01-01",5000.00`;

		expect(() =>
			convertYNAB(planCSV, invalidRegisterCSV, {
				commodity: "EUR",
				symbol: "€",
			}),
		).toThrow("Invalid register CSV headers");
	});
});
