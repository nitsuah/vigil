# Fire vs. Monarch Money vs. Fidelity

**Research date:** 2026-11-19  
**Purpose:** Product capability comparison for roadmap prioritization, not a financial-product endorsement or investment recommendation.

## Method

- Fire facts are checked against the `nitsuah/fire` repository README and documented architecture/features at commit [`d0a0661`](https://github.com/nitsuah/fire/commit/d0a0661c8a6f8ce2cf272a1f66d30028490d4387); this comparison is maintained in the separate `nitsuah/vigil` repository.
- Competitor facts use official product/help pages linked below.
- **Supported** means explicitly documented; **partial** means only part of the workflow is documented; **unverified** means public material reviewed does not establish the capability. Unverified is not proof of absence.
- Fidelity spans brokerage, planning tools, and advisory services; it is not a direct one-to-one budgeting-app comparison.

## Capability matrix

| Workflow | Fire | Monarch Money | Fidelity |
|---|---|---|---|
| Bank/brokerage aggregation | **Partial** — Plaid positions/accounts and transactions are documented; broader provider coverage is not established | **Supported** — multi-provider connections; Monarch states 13,000+ institutions ([homepage](https://www.monarch.com/)) | **Partial** — Full View aggregates external accounts from thousands of websites; provider count is not quantified |
| Manual data / imports | **Supported** — Fidelity, Chase, Capital One, and marketplace CSV imports | **Supported** — manual accounts/holdings and historical imports documented | **Partial** — Full View allows manual accounts for assets not accessible online; general CSV import unverified |
| Net worth and history | **Supported** — accounts, CDs, property, vehicles, metals, crypto and investments in one local model | **Supported** — connected assets/liabilities and net-worth history | **Supported** — Full View documents net worth over time and supports manually added assets ([Full View](https://www.fidelity.com/go/full-view)) |
| Holdings, allocation, performance | **Supported** — investment P&L, allocation, concentration and diversification views | **Supported** — holdings, portfolio performance and allocation | **Supported** — investment accounts and portfolio/planning tools |
| Retirement projections | **Supported** — SWR curves, growth presets, bull/bear scenarios and drawdown modeling | **Supported (Plus)** — retirement forecasting and what-if scenarios | **Supported** — Planning & Guidance Center and retirement income/what-if tools |
| Budgeting and transactions | **Partial** — expense ledger, CSV spending import and categorization; full connected-account budget workflow not established | **Supported** — flex/category budgets, transaction categorization, cash flow and reports | **Partial** — Full View offers budget goals, reporting and transaction categorization; it is view-only, not a full transaction-management workflow |
| Tax, rebalance and risk | **Partial** — tax-loss alerts, rebalancing what-ifs, concentration and diversification signals | **Partial** — advanced investment analysis and tax-prep exports (Plus); tax-loss/rebalancing parity unverified | **Partial** — retirement/tax-planning guidance and investment tools; exact feature parity varies by service |
| Integrations and data control | **Supported** — local-first JSON datastore, optional AES-256-GCM, read-only external financial-account integrations and read-only MCP tools; Google Drive backup writes encrypted backups to Drive | **Partial** — cloud account aggregation through third-party data providers; local/self-hosted ownership not offered in reviewed material | **Partial** — Fidelity account ecosystem and Full View aggregation; external portability and local hosting not established |
| Mobile / web | **Partial** — responsive web app documented; native mobile apps unverified | **Supported** — web, iOS and Android | **Supported** — web and mobile experiences |
| Sync reliability / transparency | **Partial** — opt-in provider sync; live status/coverage evidence should be evaluated per integration | **Partial** — connection status dashboard and multiple data providers; no uptime guarantee inferred | **Unverified** — comparative sync reliability not assessed |
| Export capabilities | **Supported** — full JSON backup and restore are documented; individual CSV export coverage is not fully established ([README at reviewed commit](https://github.com/nitsuah/fire/blob/d0a0661c8a6f8ce2cf272a1f66d30028490d4387/README.md)) | **Partial** — CSV downloads for transactions and balances are documented; broader export coverage is unverified ([download guide](https://help.monarch.com/hc/en-us/articles/15526600975764-Downloading-Transaction-or-Account-History)) | **Unverified** — comparable export scope was not established by the reviewed Full View sources |
| Setup / onboarding | **Partial** — README documents installation and initial configuration; comparable completion time was not measured | **Partial** — guided account connection and setup are documented; comparable completion time not established | **Partial** — Full View account-linking and manual-account setup are documented; comparable completion time not established |

## Evidence and source notes

### Fire (repository evidence)
- [README — product overview, features, integrations, privacy and architecture](https://github.com/nitsuah/fire/blob/d0a0661c8a6f8ce2cf272a1f66d30028490d4387/README.md)
- README documents local data/db.json storage, optional AES-256-GCM, opt-in read-only external financial-account integrations, Plaid account/position/transaction sync, CSV imports, retirement projections, allocation/risk tools, and 20 read-only MCP tools. Google Drive backup writes encrypted backup files to Drive; the read-only qualification applies to external financial-account integrations and MCP data tools, not backup destinations.
- These are repository-documented capabilities, not an independent audit of every integration's current live availability.

### Monarch Money (official sources)
- [Product overview](https://www.monarch.com/about) — account tracking, net worth, budgeting, cash flow, goals and forecasting.
- [Homepage](https://www.monarch.com/) — institution-count claim.
- [Getting started](https://help.monarch.com/hc/en-us/articles/360048393272-Getting-Started-with-Monarch) — account aggregation providers, budgeting, reports, investments and web/mobile distinctions.
- [Investments](https://help.monarch.com/hc/en-us/articles/41855507661076-Investments-in-Monarch) — holdings, manual holdings, portfolio performance and allocation.
- [Pricing](https://www.monarch.com/pricing) — retirement forecasting and advanced investment analysis are listed under Plus.

### Fidelity (official sources)
- [Full View FAQ](https://scs.fidelity.com/cash-management/faqs-full-view) — cross-institution aggregation from thousands of websites, manual accounts, net-worth snapshot, budget goals, reporting and transaction categorization; Full View is view-only.
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
