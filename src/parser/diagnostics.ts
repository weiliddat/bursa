import type { Span } from "./models.ts";

export interface Diagnostic {
	code: string;
	message: string;
	severity: "error" | "warning";
	span: Span;
}

export function createDiagnostic(
	code: string,
	message: string,
	severity: "error" | "warning",
	span: Span,
): Diagnostic {
	return { code, message, severity, span };
}

// Error codes (E001-E011)

export function invalidToken(span: Span, char: string): Diagnostic {
	return createDiagnostic(
		"E001",
		`Invalid token or unexpected character: '${char}'`,
		"error",
		span,
	);
}

export function malformedAmount(span: Span, text: string): Diagnostic {
	return createDiagnostic(
		"E002",
		`Malformed amount (bad number format): '${text}'`,
		"error",
		span,
	);
}

export function invalidDateFormat(span: Span, text: string): Diagnostic {
	return createDiagnostic(
		"E003",
		`Invalid date format: '${text}'`,
		"error",
		span,
	);
}

export function missingRequiredComponent(
	span: Span,
	component: string,
): Diagnostic {
	return createDiagnostic(
		"E004",
		`Missing required transaction component: ${component}`,
		"error",
		span,
	);
}

export function unknownAccount(span: Span, account: string): Diagnostic {
	return createDiagnostic(
		"E005",
		`Unknown account reference: '${account}'`,
		"error",
		span,
	);
}

export function unknownCommodity(span: Span, commodity: string): Diagnostic {
	return createDiagnostic(
		"E007",
		`Unknown commodity: '${commodity}'`,
		"error",
		span,
	);
}

export function assertionFailed(
	span: Span,
	expected: string,
	actual: string,
): Diagnostic {
	return createDiagnostic(
		"E008",
		`Assertion failed: expected ${expected}, got ${actual}`,
		"error",
		span,
	);
}

export function invalidComponentOrder(
	span: Span,
	component: string,
): Diagnostic {
	return createDiagnostic(
		"E009",
		`Invalid component order in transaction: ${component}`,
		"error",
		span,
	);
}

export function transferMissingCategory(span: Span): Diagnostic {
	return createDiagnostic(
		"E010",
		"Transfer to untracked account missing category",
		"error",
		span,
	);
}

export function contentBeforeSectionMarker(span: Span): Diagnostic {
	return createDiagnostic(
		"E011",
		"Content before section marker",
		"error",
		span,
	);
}

// Warning codes (W001-W003)

export function nonChronologicalDates(span: Span): Diagnostic {
	return createDiagnostic(
		"W001",
		"Non-chronological dates in account block",
		"warning",
		span,
	);
}

export function expenseNotInBudget(span: Span, category: string): Diagnostic {
	return createDiagnostic(
		"W002",
		`Expense category not in budget: '${category}'`,
		"warning",
		span,
	);
}

export function unverifiedEntry(span: Span): Diagnostic {
	return createDiagnostic(
		"W003",
		"Unverified entry needs user confirmation",
		"warning",
		span,
	);
}
