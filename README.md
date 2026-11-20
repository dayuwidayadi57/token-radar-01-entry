[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dayuwidayadi57/token-radar-01-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/dayuwidayadi57/token-radar-01-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar — radar-4

A token launch radar: it reads a sealed DefiLlama snapshot of the protocol universe and ranks pre-token protocols by implied launch value, with a costed farm plan and a computed verdict for each. Built for [make.fun](https://make.fun/bounty/token-radar-01) (`token-radar-01`).

## The model (radar-4)

1. **Comps-fitted value.** The value model is fitted from the snapshot's own live tokens (128 protocols with a market cap): a log-log size curve, `log10(mcap) = slope × log10(TVL) + category level`, where the slope is a Theil–Sen robust fit and each category level is the median of its live tokens' residuals, shrunk toward the global level. The snapshot carries market cap, not fully-diluted value, so every multiple is honestly a market-cap multiple. Slope 0.5554 on this snapshot.
2. **Blind validation (leave-one-out).** Every candidate term is tested by holding each live token out, refitting without it, and predicting the held-out market cap. A term is kept only when it improves the blind miss by at least 1%. Growth survived (coefficient −0.4914 — a contrary signal: the fastest TVL growers trade at lower market-cap multiples, so they are discounted); maturity and breadth were tested and dropped. The selected model's LOO miss is a median absolute log-error of 0.567 — the median prediction is ×3.69 off. The miss is stated in the model section, with the bootstrap bands that carry the uncertainty — it is not the headline.
3. **Costed farm plans + verdict, on the cheapest chain.** Every row carries a full costed plan — setup gas + weekly gas × hold weeks + claim gas — against an expected airdrop of 10% of implied value shared pro-rata by deposit over TVL. Net = expected − total gas. The verdict is computed from the net: FARM (net ≥ $2), THIN (within $2 of break-even), SKIP (net below −$2). Deposits run $250–$1,250 by TVL band; capital is locked, not spent, so it is shown and never subtracted. **radar-4 farms each row on the cheapest chain the protocol runs on** — radar-3 farmed the first listed chain, and all 57 Ethereum-first rows scored SKIP on gas alone. Measured on this snapshot: 93 FARM / 31 THIN / 74 SKIP (was 75 / 25 / 98). The plan names the chain and the saving when it differs from the first chain.
4. **Uncertainty bands.** 200 bootstrap refits of the live set give every row a P10–P90 band and a rank range. The bands are wide — the blind miss is ×3.69 — so a row's rank is a range, not a point.
5. **All 758 protocols accounted for.** The board ranks 198 rows; the dashboard counts the rest: 128 live tokens fitted (24 shown), 288 live tokens the fit cannot use (no positive market cap or TVL), 144 pre-token protocols excluded by the house rule (128 by category, 16 by name). 198 + 128 + 288 + 144 = 758.

No protocol name is ever special-cased: one function scores every row. The board covers the 40-protocol watchlist plus the strongest 158 pre-token protocols below the floor (198 rows).

## Run it

Node 22, standard library only, no network. Fully deterministic: the same snapshot bytes write byte-identical output.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

This writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` to the output directory. The dashboard is a static page (no framework, no network) that reads `data.js` beside it.

## Layout

- `main.ts` — the entry point: reads the snapshot, writes the board, data, dashboard, screenshots and dossier.
- `lib/model.ts` — radar-4: the fit, the blind test, the bootstrap, the costed farm plans, the board gate.
- `dashboard/` — `index.html`, `app.css`, `app.js`: the static dashboard.
- `screenshots/` — the board, a detail view and a filtered view.
- `vendor/makefun-board.ts` — make.fun's dossier library, byte for byte the scorer's own copy.

## About

Token Radar ranks pre-token protocols by implied launch value, with a farm plan for each — built so a reader can answer "which pre-token protocol is worth farming next, and what do I do about it" from the board alone. Implied value is a model, not a price, and never a prediction that a token launches.

<sub>Entered on [make.fun](https://make.fun/?ref=dp1radt1&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
