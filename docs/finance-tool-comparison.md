# Fire vs. Monarch Money vs. Fidelity

**Research date:** 2026-11-19  
**Purpose:** Product capability comparison for roadmap prioritization, not a financial-product endorsement or investment recommendation.

## Method

- Fire facts are checked against the current repository README and documented architecture/features.
- Competitor facts use official product/help pages linked below.
- **Supported** means explicitly documented; **partial** means only part of the workflow is documented; **unverified** means the public material reviewed does not establish the capability. Unverified is not proof of absence.
- Fidelity spans brokerage, planning tools, and advisory services; it is not a direct one-to-one budgeting-app comparison.

## Capability matrix

| Workflow | Fire | Monarch Money | Fidelity |
|---|---|---|---|
| Bank/brokerage aggregation | **Partial** — Plaid positions/accounts and transactions are documented; broader provider coverage is not established | **Supported** — multi-provider connections; 13,000+ institutions claimed by Monarch | **Partial** — account and investment views are documented within Fidelity; cross-institution aggregation scope unverified here |
| Manual data / imports | **Supported** — Fidelity, Chase, Capital One, and marketplace CSV imports | **Supported** — manual accounts/holdings and historical imports documented | **Partial** — planning inputs and Fidelity account data; general CSV import unverified |
| Net worth and history | **Supported** — accounts, CDs, property, vehicles, metals, crypto and investments in one local model | **Supported** — connected assets/liabilities and net-worth history | **Partial** — account/investment overview; whole-household external-asset net-worth workflow not established by sources reviewed |
| Holdings, allocation, performance | **Supported** — investment P&L, allocation, concentration and diversification views | **Supported** — holdings, portfolio performance and allocation | **Supported** — investment accounts and portfolio/planning tools |
| Retirement projections | **Supported** — SWR curves, growth presets, bull/bear scenarios and drawdown modeling | **Supported (Plus)** — retirement forecasting and what-if scenarios | **Supported** — Planning & Guidance Center and retirement income/what-if tools |
| Budgeting and transactions | **Partial** — expense ledger, CSV spending import and categorization; full connected-account budget workflow not established | **Supported** — flex/category budgets, transaction categorization, cash flow and reports | **Unverified** — no equivalent day-to-day budgeting workflow established by sources reviewed |
| Tax, rebalance and risk | **Partial** — tax-loss alerts, rebalancing what-ifs, concentration and diversification signals | **Partial** — advanced investment analysis and tax-prep exports (Plus); tax-loss/rebalancing parity unverified | **Partial** — retirement/tax-planning guidance and investment tools; exact feature parity varies by service |
| Integrations and data control | **Supported** — local-first JSON datastore, optional AES-256-GCM, read-only external integrations, read-only MCP tools | **Partial** — cloud account aggregation through third-party data providers; local/self-hosted ownership not offered in reviewed material | **Partial** — Fidelity account ecosystem and planning tools; external portability and local hosting not established |
| Mobile / web | **Partial** — responsive web app documented; native mobile apps unverified | **Supported** — web, iOS and Android | **Supported** — web and mobile experiences |
| Sync reliability / transparency | **Partial** — opt-in provider sync; live status/coverage evidence should be evaluated per integration | **Partial** — connection status dashboard and multiple data providers; no uptime guarantee inferred | **Unverified** — comparative sync reliability not assessed |

## Evidence and source notes

### Fire (repository evidence)
- [README — product overview, features, integrations, privacy and architecture](https://github.com/nitsuah/fire/blob/main/README.md)
- README documents local data/db.json storage, optional AES-256-GCM, opt-in read-only external integrations, Plaid account/position/transaction sync, CSV imports, retirement projections, allocation/risk tools, and 20 read-only MCP tools.
- These are repository-documented capabilities, not an independent audit of every integration's current live availability.

### Monarch Money (official sources)
- [Product overview](https://www.monarch.com/about) — account tracking, net worth, budgeting, cash flow, goals and forecasting.
- [Getting started](https://help.monarch.com/hc/en-us/articles/360048393272-Getting-Started-with-Monarch) — account aggregation providers, budgeting, reports, investments and web/mobile distinctions.
- [Investments](https://help.monarch.com/hc/en-us/articles/41855507661076-Investments-in-Monarch) — holdings, manual holdings, portfolio performance and allocation.
- [Pricing](https://www.monarch.com/pricing) — retirement forecasting and advanced investment analysis are listed under Plus.

### Fidelity (official sources)
- [Retirement planning](https://www.fidelity.com/retirement/retirement-planning) — planning center, retirement income calculator and scenario modeling.
- [Planning & Guidance Center methodology](https://www.fidelity.com/bin-public/060_Guidance_Pages/documents/IRE_METHODOLOGY.pdf) — describes retirement analysis and hypothetical what-if scenarios.
- [Retirement accounts](https://www.fidelity.com/retirement/retirement-accounts/) — self-directed and managed retirement-account paths.

## Prioritized product gaps for Fire

| Priority | Gap / opportunity | User value | Effort |
|---|---|---:|---:|
| 1 | Make provider connection coverage, last successful sync, stale-data age and failure recovery visible in one place | High | Medium |
| 2 | Add an optional recurring budget/cash-flow workflow over imported or Plaid transactions without weakening local-first storage | High | High |
| 3 | Improve account/holding history and explain valuation provenance, stale prices and manual overrides | High | Medium |
| 4 | Document portability, backup/restore and data ownership as first-class product workflows | Medium | Low |
| 5 | Evaluate mobile-specific workflows only after responsive-web gaps are measured | Medium | Medium |

## Interpretation

Fire's strongest documented differentiator is a local-first, broad-asset FIRE model with scenario analysis and read-only automation interfaces. Monarch's strongest documented advantage is turnkey household aggregation plus budgeting and reports. Fidelity's strongest documented advantage is retirement planning integrated with its brokerage and investment ecosystem. The comparison does not imply that Fire should replicate every competitor feature; prioritize gaps that improve data completeness, trust and retirement decisions while preserving local control.
