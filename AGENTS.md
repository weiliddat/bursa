# Bursa - Agent Guidelines

Bursa is a minimalistic plain-text personal finance tool with implicit double-entry accounting.

## Project Structure

- `docs/` — SPEC.md (source of truth), ARCHITECTURE.md, ROADMAP.md
- `examples/example.bursa` — canonical test fixture
- `src/` — parser/, domain/, ui/

## Commands

```bash
npm run dev           # Start Vite dev server
npm test              # Run tests once with coverage, and type checking
npm run lint:fix      # Lint auto-fix
```

## Instructions

> "Everything should be made as simple as possible, but not simpler."

Iterate on concepts, features, and UX—then pare down until nothing more can be removed. The result should be austere yet complete, obvious yet elegant. Simplicity here is a product of intention and thoughtfulness, not naiveness or laziness.

This applies equally to code, documentation, examples, and tests. Each should be minimal yet sufficient — no extraneous words, no redundant test cases, no over-explained examples.

1. Read `docs/SPEC.md`, `docs/ARCHITECTURE.md`, and `examples/example.bursa` first
2. Update all three files to maintain consistency
3. Bump version numbers in changelogs when making substantive changes
4. Update `docs/ROADMAP.md` for any progress or roadmap changes
5. Add tests when changing code, where the cases should reflect the feature that you're working on
6. Rerun tests and linters when making code changes
