import { createMemo, createSignal, For, Index } from "solid-js";
import type { Ledger, Transaction } from "../parser/models";
import { parse } from "../parser/parser";

// Store refs to all line inputs for focus management
const lineRefs: HTMLInputElement[] = [];

const EXAMPLE_LEDGER = `>>> META
commodity: $ = USD
commodity: RM = MYR
untracked: @Brokerage

>>> BUDGET
2026-01
  &Groceries 500 $
  &Investing 1000 $

>>> LEDGER
@Checking
  2026-01-01 +5000 $ &Unassigned
  2026-01-15 +3000 $ &Unassigned
  2026-01-16 -100 $ &Groceries
  2026-01-20 -1000 $ @Brokerage &Investing

@Brokerage
  2026-01-01 +1000 $ &Unassigned
  2026-01-21 -1000 $ +10 AAPL`;

interface AccountBalance {
	commodity: string;
	balance: number;
}

interface ComputedState {
	ledger: Ledger | null;
	errors: string[];
	warnings: string[];
	accountBalances: Map<string, AccountBalance[]>;
	categoryBalances: Map<string, number>;
	unassignedBalance: number;
}

function computeBalances(ledger: Ledger): ComputedState {
	const accountBalances = new Map<string, Map<string, number>>();
	const categoryBalances = new Map<string, number>();
	let unassignedBalance = 0;

	// Initialize categories from budget allocations
	for (const entry of ledger.budget) {
		const catKey = entry.category.raw;
		const current = categoryBalances.get(catKey) ?? 0;
		const amount =
			entry.amount.sign === "-" ? -entry.amount.value : entry.amount.value;
		categoryBalances.set(catKey, current + amount);
	}

	// Process all ledger entries
	for (const entry of ledger.ledger) {
		if (entry.kind === "transaction") {
			const tx = entry as Transaction;
			const account = tx.account.raw;
			const amount =
				tx.amount.sign === "-" ? -tx.amount.value : tx.amount.value;
			const commodity = tx.amount.commodity;

			// Update account balance
			let acctCommodities = accountBalances.get(account);
			if (!acctCommodities) {
				acctCommodities = new Map();
				accountBalances.set(account, acctCommodities);
			}
			const currentBalance = acctCommodities.get(commodity) ?? 0;
			acctCommodities.set(commodity, currentBalance + amount);

			// Update category balance based on target
			if (tx.target.kind === "category") {
				const catKey = tx.target.ref.raw;
				if (catKey === "&Unassigned") {
					unassignedBalance += amount;
				} else {
					const current = categoryBalances.get(catKey) ?? 0;
					categoryBalances.set(catKey, current - amount);
				}
			} else if (tx.target.kind === "account") {
				// Transfer to another account - update target account
				const targetAccount = tx.target.ref.raw;
				let targetCommodities = accountBalances.get(targetAccount);
				if (!targetCommodities) {
					targetCommodities = new Map();
					accountBalances.set(targetAccount, targetCommodities);
				}
				const targetCurrent = targetCommodities.get(commodity) ?? 0;
				targetCommodities.set(commodity, targetCurrent - amount);

				// If there's a category, drain it (transfer to untracked)
				if (tx.target.category) {
					const catKey = tx.target.category.raw;
					const current = categoryBalances.get(catKey) ?? 0;
					categoryBalances.set(catKey, current - amount);
				}
			} else if (tx.target.kind === "swap") {
				// Swap: also add the received commodity to the account
				const swapAmount = tx.target.amount;
				const swapValue =
					swapAmount.sign === "-" ? -swapAmount.value : swapAmount.value;
				const swapCommodity = swapAmount.commodity;
				const currentSwapBalance = acctCommodities.get(swapCommodity) ?? 0;
				acctCommodities.set(swapCommodity, currentSwapBalance + swapValue);
			}
		}
		// Assertions don't affect balances
	}

	// Convert account balances to array format
	const accountBalancesArray = new Map<string, AccountBalance[]>();
	for (const [account, commodities] of accountBalances) {
		const balances: AccountBalance[] = [];
		for (const [commodity, balance] of commodities) {
			balances.push({ commodity, balance });
		}
		accountBalancesArray.set(account, balances);
	}

	return {
		ledger,
		errors: [],
		warnings: [],
		accountBalances: accountBalancesArray,
		categoryBalances,
		unassignedBalance,
	};
}

export function App() {
	const [source, setSource] = createSignal(EXAMPLE_LEDGER);

	const computed = createMemo<ComputedState>(() => {
		const result = parse(source());

		if (result.errors.length > 0) {
			return {
				ledger: null,
				errors: result.errors.map(
					(e) => `Line ${e.span.start.line}: ${e.message}`,
				),
				warnings: result.warnings.map(
					(w) => `Line ${w.span.start.line}: ${w.message}`,
				),
				accountBalances: new Map(),
				categoryBalances: new Map(),
				unassignedBalance: 0,
			};
		}

		const state = computeBalances(result.data);
		state.errors = [];
		state.warnings = result.warnings.map(
			(w) => `Line ${w.span.start.line}: ${w.message}`,
		);
		return state;
	});

	const lines = createMemo(() => source().split("\n"));

	const updateLine = (index: number, value: string) => {
		const currentLines = lines();
		const newLines = [...currentLines];
		newLines[index] = value;
		setSource(newLines.join("\n"));
	};

	const addLine = () => {
		setSource((prev) => `${prev}\n`);
	};

	const handleKeyDown = (index: number, e: KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			const input = lineRefs[index];
			const cursorPos = input?.selectionStart ?? 0;
			const textBeforeCursor = input?.value.slice(0, cursorPos) ?? "";
			const insertAbove = textBeforeCursor.trim() === "";

			const currentLines = lines();
			const newLines = [...currentLines];
			const insertIndex = insertAbove ? index : index + 1;
			newLines.splice(insertIndex, 0, "");
			setSource(newLines.join("\n"));

			setTimeout(() => {
				const focusIndex = insertAbove ? index : index + 1;
				const target = lineRefs[focusIndex];
				target?.focus();
			}, 0);
		} else if (e.key === "Backspace") {
			const input = lineRefs[index];
			if (input?.value === "" && lines().length > 1) {
				e.preventDefault();
				const currentLines = lines();
				const newLines = [...currentLines];
				newLines.splice(index, 1);
				setSource(newLines.join("\n"));

				// Focus previous line (or same index if at end)
				setTimeout(() => {
					const targetIndex = index > 0 ? index - 1 : 0;
					const prevInput = lineRefs[targetIndex];
					if (prevInput) {
						prevInput.focus();
						prevInput.selectionStart = prevInput.value.length;
						prevInput.selectionEnd = prevInput.value.length;
					}
				}, 0);
			}
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			if (index > 0) {
				const prevInput = lineRefs[index - 1];
				if (prevInput) {
					prevInput.focus();
					prevInput.selectionStart = lineRefs[index]?.selectionStart ?? 0;
					prevInput.selectionEnd = lineRefs[index]?.selectionEnd ?? 0;
				}
			}
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			const currentLines = lines();
			if (index < currentLines.length - 1) {
				const nextInput = lineRefs[index + 1];
				if (nextInput) {
					nextInput.focus();
					nextInput.selectionStart = lineRefs[index]?.selectionStart ?? 0;
					nextInput.selectionEnd = lineRefs[index]?.selectionEnd ?? 0;
				}
			}
		}
	};

	return (
		<div class="container">
			<div class="pane ledger-pane">
				<div class="pane-header">Ledger</div>
				<div class="ledger-lines">
					<Index each={lines()}>
						{(line, index) => (
							<div class="ledger-line">
								<span class="line-number">{index + 1}</span>
								<input
									ref={(el) => {
										lineRefs[index] = el;
									}}
									type="text"
									value={line()}
									onInput={(e) => updateLine(index, e.currentTarget.value)}
									onKeyDown={(e) => handleKeyDown(index, e)}
									class="line-input"
								/>
							</div>
						)}
					</Index>
					<button type="button" onClick={addLine} class="add-line-btn">
						+ Add line
					</button>
				</div>
				<div class="diagnostics">
					<For each={computed().errors}>
						{(error) => <div class="error">{error}</div>}
					</For>
					<For each={computed().warnings}>
						{(warning) => <div class="warning">{warning}</div>}
					</For>
				</div>
			</div>
			<div class="pane balances-pane">
				<div class="pane-header">Balances</div>

				<div class="balance-section">
					<div class="section-title">Accounts</div>
					<For each={Array.from(computed().accountBalances.entries())}>
						{([account, balances]) => (
							<div class="balance-item">
								<div class="account-name">{account}</div>
								<For each={balances}>
									{({ commodity, balance }) => (
										<div class="balance-amount">
											{balance.toFixed(2)} {commodity}
										</div>
									)}
								</For>
							</div>
						)}
					</For>
				</div>

				<div class="balance-section">
					<div class="section-title">Categories</div>
					<div class="balance-item">
						<div class="category-name">&Unassigned</div>
						<div class="balance-amount">
							{computed().unassignedBalance.toFixed(2)}
						</div>
					</div>
					<For each={Array.from(computed().categoryBalances.entries())}>
						{([category, balance]) => (
							<div class="balance-item">
								<div class="category-name">{category}</div>
								<div class="balance-amount">{balance.toFixed(2)}</div>
							</div>
						)}
					</For>
				</div>
			</div>
		</div>
	);
}
