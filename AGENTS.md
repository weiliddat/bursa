# Bursa - Agent Guidelines

Bursa is a minimalistic plain-text personal finance tool with implicit double-entry accounting.

## Project Structure

```
bursa/
├── docs/
│   ├── SPEC.md          # Language specification (source of truth)
│   ├── ARCHITECTURE.md  # System design & parser architecture
│   └── ROADMAP.md       # Implementation plan & progress
├── examples/
│   └── example.bursa    # Canonical test fixture
├── src/
│   ├── parser/          # Fused single-pass parser
│   ├── domain/          # Balance computation, budgets
│   └── ui/              # SolidJS components
└── ...
```

## Code Conventions

- **Language:** TypeScript with strict mode
- **Framework:** SolidJS for UI, hand-written parser (no generators)
- **Testing:** Vitest
- **Formatting:** Biome (tabs, double quotes)
- **File naming:** kebab-case for files, PascalCase for components

## Testing Approach

- Test-driven development for the parser
- Tests live alongside code: `foo.ts` → `foo.test.ts`
- Use `examples/example.bursa` as the canonical test fixture

## Documentation

- `docs/SPEC.md` is the source of truth for syntax
- `docs/ARCHITECTURE.md` defines system design and AST structures
- Update `docs/ROADMAP.md` when completing tasks
- Update this file when adding new commands or conventions

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
5. Rerun tests and linters when making code changes
