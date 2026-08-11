# Cross-family REFUTED — proof receipt (DEM-020 Track 2 / NODE-082)

## Claim under test
A green deterministic evidence set is **necessary, not sufficient**. A verifier from a
**different model family**, prompted to *refute*, can catch a fail-open bug that passing
tests cannot see.

## Fixtured proof (hermetic, in CI)
`tests/cross-family-verification.test.mjs` plants a fail-open scenario — a handler that
returns `200` on a missing auth token while `npm test` exits `0` — and drives it through
`dispatchIndependentVerification` with a cross-family verifier adapter whose transcript
returns:

```json
{"verdict":"fail","summary":"Refuted: endpoint returns 200 on auth failure (fail-open) despite passing tests."}
```

Result: `verdict = fail`, `outcome = REPAIR_REQUIRED`. The node cannot reach `verified`
on green evidence alone. This runs in CI with no live model calls.

## Live cross-family run
> **PENDING HUMAN EXECUTION.** A genuine live run against two different-vendor models
> (e.g. builder = Anthropic-family harness, verifier = OpenAI-family harness) must be
> executed by a human with both vendor credentials and its transcript pasted below.
> This receipt intentionally does NOT claim a live run happened until that transcript
> exists — fabricating it would be the exact dishonest evidence DEM-020 exists to prevent.

```
<paste live cross-family verifier transcript here: builder family, verifier family,
the diff, the green evidence, and the REFUTED JSON verdict line>
```
