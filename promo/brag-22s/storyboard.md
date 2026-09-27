# brag-22s — storyboard

**What it is:** A dashboard and MCP server that watches every GitHub repo you own: health grades, docs and best practices, and a cross-repo rollup of each repo's TASKS.md.
**For:** Developers with too many repos, and the AI agents working in them.
**Sets it apart:** One ranked list of open work across every repo, a relationship map that says which repo uses which (and why), and all of it readable by Claude over MCP.
**Most impressive:** Ask your agent "what should I work on next?" and it answers from the whole portfolio.
**Visual hook:** Ten repo chips pop in with their grades, a count lands ("10 repos · 23 open tasks · 1 failing build"), then the question is typed: "What do I work on next?"
**Share caption:** see share-copy.txt

**Tone:** default (punchy, clean). **Format:** 1920×1080, 30fps, 22s. **Music:** 120 BPM, D minor, cuts on the bar.
**Identity:** bg `#020617` (slate-950), header gradient `#0d0620 → #1a0b36`, indigo `#a5b4fc`, purple `#d8b4fe`, fuchsia `#e879f9`; grades emerald/green/yellow/orange/red. Inter. The crosshair VigilIcon.

Every screen is the real vigil UI (Next.js app under `next dev`) rendering the fictional **acme** portfolio in `promo/demo-seed.ts` through mocked APIs. Nothing on screen is the owner's data.

## Storyboard

| # | Time | Scene |
|---|---|---|
| 1 Hook | 0.0–3.0 | Ten repo chips (name + grade, real grade colors) pop in on a grid. At 1.1s: "10 repos · 23 open tasks · 1 failing build". At 1.7s "What do I work on next?" is typed big. |
| 2 Reveal | 3.0–7.0 | VigilIcon + **Vigil**, "Every repo, graded. One dashboard." The real dashboard swings in from a 3D tilt on the right. |
| 3 Open work | 7.0–11.0 | "Open work. Most urgent first." The real PMO grid (P0/P1). The cursor clicks the P2 chip and the grid fills in. |
| 4 Relationships | 11.0–15.0 | "Which repo uses which. And why." The real relationship map. The cursor confirms the agent's proposed edge. |
| 5 Ask Claude | 15.0–18.5 | A terminal: "what should I work on next?" is typed, then the `get_open_tasks` call and its result, P0 first. Headline: "Your agents read it too." |
| 6 Outro | 18.5–22.0 | VigilIcon + **Vigil** · "Keep watch over every repo." · chips `github.com/nitsuah/vigil` and `MCP for Claude Code`. |
