import type { Span } from "./models.ts";

export interface Diagnostic {
	name: string;
	message: string;
	severity: "error" | "warning";
	span: Span;
}

export function createDiagnostic(
	name: string,
	message: string,
	severity: "error" | "warning",
	span: Span,
): Diagnostic {
	return { name, message, severity, span };
}

// Syntax errors

export function invalidSectionError(span: Span, detail: string): Diagnostic {
	return createDiagnostic("InvalidSectionError", detail, "error", span);
}

export function invalidDirectiveError(span: Span, detail: string): Diagnostic {
	return createDiagnostic("InvalidDirectiveError", detail, "error", span);
}

export function invalidEntryError(span: Span, detail: string): Diagnostic {
	return createDiagnostic("InvalidEntryError", detail, "error", span);
}

// Validation errors

export function unknownEntityError(
	span: Span,
	entityType: "account" | "category" | "commodity",
	name: string,
): Diagnostic {
	return createDiagnostic(
		"UnknownEntityError",
		`Unknown ${entityType}: '${name}'`,
		"error",
		span,
	);
}

export function trunkEntityError(
	span: Span,
	entityType: "account" | "category",
	name: string,
): Diagnostic {
	return createDiagnostic(
		"TrunkEntityError",
		`Cannot use ${entityType} '${name}' directly; it has sub-${entityType === "account" ? "accounts" : "categories"}`,
		"error",
		span,
	);
}

export function missingCategoryError(span: Span): Diagnostic {
	return createDiagnostic(
		"MissingCategoryError",
		"Transfer to untracked account missing category",
		"error",
		span,
	);
}

// Warnings

export function unverifiedEntryWarning(span: Span): Diagnostic {
	return createDiagnostic(
		"UnverifiedEntryWarning",
		"Unverified entry needs user confirmation",
		"warning",
		span,
	);
}

export function assertionFailedWarning(
	span: Span,
	expected: string,
	actual: string,
): Diagnostic {
	return createDiagnostic(
		"AssertionFailedWarning",
		`Assertion failed: expected ${expected}, got ${actual}`,
		"warning",
		span,
	);
}

export function nonChronologicalWarning(span: Span): Diagnostic {
	return createDiagnostic(
		"NonChronologicalWarning",
		"Non-chronological dates in account block",
		"warning",
		span,
	);
}

export function unbudgetedCategoryWarning(
	span: Span,
	category: string,
): Diagnostic {
	return createDiagnostic(
		"UnbudgetedCategoryWarning",
		`Expense category not in budget: '${category}'`,
		"warning",
		span,
	);
}
