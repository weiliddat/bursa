# Bursa - Agent Guidelines

## Philosophy

> "Everything should be made as simple as possible, but not simpler."

Iterate on concepts, features, and UX—then pare down until nothing more can be removed. The result should be austere yet complete, obvious yet elegant. Simplicity here is a product of intention and thoughtfulness, not naiveness or laziness.

## Project Overview

Bursa is a minimalistic plain-text personal finance tool with implicit double-entry accounting. See `docs/SPEC.md` for the language specification.

## Commands

```bash
# Development
npm run dev          # Start Vite dev server
npm run build        # TypeScript check + Vite build
npm run preview      # Preview production build

# Testing
npm test             # Run Vitest in watch mode
npm run test:run     # Run tests once
npm run test:coverage # Run with coverage report

# Code Quality
npm run check        # TypeScript type checking (no emit)
npm run lint         # Biome linting check
npm run lint:fix     # Biome auto-fix
```

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
│   ├── parser/          # Lexer, parser, AST (Phase 1)
│   ├── domain/          # Balance computation, budgets (Phase 2)
│   └── ui/              # SolidJS components (Phase 3+)
└── ...
```

## Code Conventions

- **Language:** TypeScript with strict mode
- **Framework:** SolidJS for UI, hand-written parser (no generators)
- **Testing:** Vitest with globals enabled
- **Formatting:** Biome (tabs, double quotes)
- **File naming:** kebab-case for files, PascalCase for components

## Testing Approach

- Test-driven development for the parser
- Tests live alongside code: `foo.ts` → `foo.test.ts`
- Use `examples/example.bursa` as the canonical test fixture
- Assert both valid parsing AND proper error messages for invalid input

## Key Design Decisions

1. **Single-file format** with section markers (`>>> META`, etc.)
2. **Implicit double-entry** - user writes single-entry, system tracks flows
3. **Fine-grained reactivity** - use SolidJS signals/memos for derived data
4. **Performance** - hand-written lexer/parser for speed and intellisense
5. **Position tracking** - every AST node includes source location

## Documentation

- `docs/SPEC.md` is the source of truth for syntax
- `docs/ARCHITECTURE.md` defines system design and AST structures
- `examples/example.bursa` is the canonical test fixture
- Update `docs/ROADMAP.md` when completing tasks
- Update this file when adding new commands or conventions

**When making changes that affect the language or system design:**

1. Read `docs/SPEC.md`, `docs/ARCHITECTURE.md`, and `examples/example.bursa` first
2. Update all three files to maintain consistency
3. Bump version numbers in changelogs when making substantive changes
4. Update `docs/ROADMAP.md` for any progress or roadmap changes
