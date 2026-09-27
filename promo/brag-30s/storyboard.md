# brag-30s — storyboard

**What it is:** A dashboard and MCP server that watches every GitHub repo you own: health grades, docs, best practices and community standards (with one-click fix PRs), a cross-repo rollup of each repo's TASKS.md, and a map of which repo uses which.
**For:** Developers with too many repos, and the AI agents working in them.
**Sets it apart:** It doesn't just grade repos, it opens the pull request that fixes them; it ranks open work across every repo; and Claude can read all of it over MCP.
**Visual hook:** Ten repo chips pop in with their grades, a count lands ("10 repos · 23 open tasks · 1 failing build"), then the question is typed: "What do I work on next?"
**Share caption:** see share-copy.txt

**Tone:** polished (numbered chapters, word-by-word headlines, blur-through cuts, slow push-ins). **Format:** 1920×1080, 30fps, 30s. **Music:** 120 BPM, D minor; every cut on a bar.
**Identity:** bg `#020617`, glows `#802dff`/`#3b0080` drifting over a faint dot grid; indigo `#a5b4fc` → purple `#d8b4fe` → fuchsia `#f0abfc` gradient; Inter; the crosshair VigilIcon.

Every screen is the real vigil UI (Next.js under `next dev`) rendering the fictional **acme** portfolio in `promo/demo-seed.ts` through mocked APIs. The "Pull request opened" pill in scene 4 is illustrative (the capture never calls GitHub).

## Storyboard

| # | Time | Scene |
|---|---|---|
| 1 Hook | 0–3 | Graded repo chips pop in, the count lands, "What do I work on next?" is typed. |
| 2 Reveal | 3–7 | VigilIcon + **Vigil**, "Every repo, graded. One dashboard." The real dashboard swings in. |
| 3 **01 · Inspect** | 7–11 | "Docs. Best practices. Community standards." The three real, fully expanded checklist cards (4/5, 6/11, 8/12) rise in one by one. The Best Practices **Fix All (2)** button pulses and is clicked. |
| 4 **02 · Fix** | 11–15 | "One click. One pull request." The real PR preview (`.github/dependabot.yml`, `.husky/pre-commit`); slow push-in; **Create PR (2)** pulses and is clicked; "✓ Pull request opened on acme/mobile-app". |
| 5 **03 · Prioritize** | 15–19 | "Open work. Most urgent first." The real PMO grid; the cursor clicks P2 and the grid fills in. |
| 6 **04 · Connect** | 19–23 | "Which repo uses which. And why." The relationship map; the cursor confirms the agent's proposed edge. |
| 7 **05 · Ask** | 23–27 | "Your agents read it too." Terminal: "what should I work on next?" → `get_open_tasks` → P0/P1 result. |
| 8 Outro | 27–30 | **Vigil** · "Keep watch over every repo." · Health · Docs · Best practices · Community standards · Open work · Relationships · MCP · `github.com/nitsuah/vigil`. |

## Revisions
- **v1 (brag-22s):** hook, dashboard, PMO grid, relationship map, MCP, outro.
- **v2 (brag-30s):** adds 01 Inspect (docs, best practices, community standards, all sections expanded) and 02 Fix (Fix All → real PR preview → Create PR); numbered chapters, word-by-word headlines, blur-through cuts, drifting background, cursor shadows and button pulses.
