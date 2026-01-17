import type { Span } from "./models.ts";

export interface Diagnostic {
	name: string;
	message: string;
	severity: "error" | "warning";
	span: Span;
}

// Syntax errors

export function invalidSectionError(span: Span, detail: string): Diagnostic {
	return {
		name: "InvalidSectionError",
		message: detail,
		severity: "error",
		span,
	};
}

export function invalidDirectiveError(span: Span, detail: string): Diagnostic {
	return {
		name: "InvalidDirectiveError",
		message: detail,
		severity: "error",
		span,
	};
}

export function invalidEntryError(span: Span, detail: string): Diagnostic {
	return {
		name: "InvalidEntryError",
		message: detail,
		severity: "error",
		span,
	};
}

// Validation errors

export function unknownEntityError(
	span: Span,
	entityType: "account" | "category" | "commodity",
	name: string,
): Diagnostic {
	return {
		name: "UnknownEntityError",
		message: `Unknown ${entityType}: '${name}'`,
		severity: "error",
		span,
	};
}

export function trunkEntityError(
	span: Span,
	entityType: "account" | "category",
	name: string,
): Diagnostic {
	return {
		name: "TrunkEntityError",
		message: `Cannot use ${entityType} '${name}' directly; it has sub-${entityType === "account" ? "accounts" : "categories"}`,
		severity: "error",
		span,
	};
}

export function missingCategoryError(span: Span): Diagnostic {
	return {
		name: "MissingCategoryError",
		message: "Transfer to untracked account missing category",
		severity: "error",
		span,
	};
}

// Warnings

export function unverifiedEntryWarning(span: Span): Diagnostic {
	return {
		name: "UnverifiedEntryWarning",
		message: "Unverified entry needs user confirmation",
		severity: "warning",
		span,
	};
}

export function assertionFailedWarning(
	span: Span,
	expected: string,
	actual: string,
): Diagnostic {
	return {
		name: "AssertionFailedWarning",
		message: `Assertion failed: expected ${expected}, got ${actual}`,
		severity: "warning",
		span,
	};
}

export function nonChronologicalWarning(span: Span): Diagnostic {
	return {
		name: "NonChronologicalWarning",
		message: "Non-chronological dates in account block",
		severity: "warning",
		span,
	};
}

export function unbudgetedCategoryWarning(
	span: Span,
	category: string,
): Diagnostic {
	return {
		name: "UnbudgetedCategoryWarning",
		message: `Expense category not in budget: '${category}'`,
		severity: "warning",
		span,
	};
}
