# Bursa

Minimalistic personal finance and budgeting

## Why Bursa?

- **Envelope budgeting** — Allocate money to categories, track what's left
- **Multi-asset tracking** — Cash, stocks, crypto, foreign currencies in one file
- **Simple by design** — Easier than YNAB or Beancount, no accounting background needed
- **Portable format** — A single `.bursa` text file you own forever
- **No lock-in** — Version control it, grep it, sync it however you want

## Quick Example

```
>>> META
commodity: $ = USD

>>> BUDGET
2026-01
  &Groceries 500 $
  &Investing 1000 $

>>> LEDGER
@Checking
  2026-01-01 +5000 $ &Unassigned #opening
  2026-01-15 +3000 $ &Unassigned #salary
  2026-01-16 -100 $ &Groceries
  2026-01-20 -1000 $ @Brokerage &Investing
```

## Development

```bash
npm install
npm run dev     # Start dev server
npm test        # Run tests with coverage
npm run lint    # Lint check
```

## Documentation

- [Language Specification](docs/SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)

## License

MIT
