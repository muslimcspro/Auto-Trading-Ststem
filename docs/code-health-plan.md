# Code Health Plan

This project has three legacy monolith files that are currently allowed only as a temporary baseline:

- `src/styles.css`
- `src/main.tsx`
- `server/index.ts`

The professional path is not a large rewrite. The safe path is staged extraction with behavior checks after every step.

## Rules

- New source files should stay under 1,000 lines.
- The three legacy monolith files should only shrink over time.
- Do not add end-of-file CSS override layers unless there is no safer local selector change.
- Prefer moving existing code unchanged before simplifying it.
- Run `npm run build` and `npm run check:health` before deploys.

## Refactor Sequence

1. Split `src/main.tsx` by route:
   - `src/pages/HomePage.tsx`
   - `src/pages/DashboardPage.tsx`
   - `src/pages/AutoTradePage.tsx`

2. Split shared UI:
   - badges, metrics, date fields, filter bars, modals, chart wrappers.

3. Split server by responsibility:
   - auth routes and session helpers
   - Binance vault and trading execution
   - Telegram notifications
   - ledger simulation
   - market scanner and strategy evaluation

4. Split CSS by feature after components move:
   - base/theme
   - home
   - dashboard
   - auto-trade
   - responsive layers per feature

5. Remove duplicated CSS only after visual comparison on desktop and mobile.
