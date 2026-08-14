# Stage 6.5 — the Evaluation & Learning Loop (proof)

**`npm run check` exit 0 · 565/565 tests.** Closes the empirical feedback spine the
autonomous system was missing: it can now (a) run real work through a harness, (b) prove
a reorganization actually helps on held-out work rather than grading its own homework,
and (c) feed proven outcomes back so the next run is smarter.

## The three closures

| Step | Module | What it closes |
|------|--------|----------------|
| 6.5a real executor | `src/autonomy/executor.mjs` | agents can run through the real harness boundary; dispatch class → honest quality (infra→**unknown**, never zero); evidence is a **reference**, never raw content |
| 6.5b learning loop | `src/autonomy/learning.mjs` | a proven run's sanitized outcomes are **admitted to the org store through the learning gate**; the next run's allocation **reads the prior** |
| 6.5c counterfactual A/B | `src/autonomy/counterfactual.mjs` | a reorg is kept only if it **measurably beats** the org it replaced on **held-out** work — not because it scored itself higher |

## Why this was the right next step

The system could already decide subgoals, synthesize agents, construct topology, and
reorganize itself under governance (Stage 6). But it judged its own adaptations against
**self-assigned quality on simulated execution** — the exact "grades its own homework on
fake data" failure the governance substrate exists to prevent. The gates stopped it from
*lying about authority*; nothing stopped it from *being confidently wrong about
improvement*. Stage 6.5 adds the missing sense: measured, held-out, outcome-based
evaluation, plus a real execution seam and a closed learning loop.

## The decisive guarantee (anti-self-grading)

`tests/autonomy/counterfactual.test.mjs` proves the key case: a replacement that looks
better on the **triggering** signal (in-loop eval 0.9 vs 0.2) but is **no better on
held-out** work (still 0.2) is **reverted**. The org cannot keep a reorg by flattering
itself — it must win a real A/B. A marginal gain below the margin is inconclusive and
also reverts: a reorg must earn its place.

## The closed learning loop

`tests/autonomy/orchestrate-learning.test.mjs`: a proven orchestration admits sanitized
aggregates (references only, no raw content) to the org store **through the learning
gate**; `reliabilityPriorFor` then returns a prior the next run's allocation consumes. An
**unproven** run admits **nothing** — unproven outcomes never influence history (the
spec's hard rule). Learning is opt-in (no store → back-compatible).

## Safety properties preserved

- **Unknown ≠ zero.** An infra failure yields `quality: null`, never 0 (`executor.mjs`).
- **No raw content leaves the process.** The executor emits `run:<id>:exit<c>:bytes<n>`
  references; the org store still refuses raw content at any depth.
- **Gated admission.** Only the learning gate's PASS writes to the store.
- **Deterministic + offline.** Injected executor; no wall clock / randomness; the real
  harness adapter is pluggable but CI uses the fake.

## Honest limitations

- The **held-out set** is supplied by the caller; auto-generating good holdout tasks from
  a goal is future work (the current default falls back to self-assigned benefit when no
  held-out set is given).
- The real harness executor is wired and unit-tested against stub adapters; a live
  end-to-end run against a real CLI is intentionally out of CI (no paid models in tests).

## Reproduce

```bash
npm run check                                     # 565/565, exit 0
node --test tests/autonomy/counterfactual.test.mjs tests/autonomy/learning.test.mjs tests/autonomy/executor.test.mjs
```
