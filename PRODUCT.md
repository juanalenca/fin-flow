# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

HTML5, Modern CSS (Design Tokens, Responsive Grid/Flex, Pure SVG Vector Charts), Vanilla ES6+ JavaScript, Firebase Authentication & Cloud Firestore, Capacitor Android Native Bridge.

## Users

Individuals seeking disciplined, intuitive personal financial management and cash flow clarity through the 50/30/20 methodology and meal voucher (VR) tracking.

## Product Purpose

FinFlow empowers users to gain complete control over their finances with zero clutter. It splits monthly net income into 50% Needs, 30% Wants, and 20% Savings/Investments, while managing specialized balances like Meal Tickets (VR) with real-time cloud persistence and offline resilience.

## Positioning

A lightweight, distraction-free fintech progressive web and native Android app with an obsidian dark theme, champagne gold accents, 100% vector SVG charts (immune to DPI canvas rendering bugs), and automated in-app updates.

## Operating Context

- Mobile first on modern Android smartphones (tested on Android 14/15, notched displays with safe area insets, bottom navigation dock, slide-up bottom sheets).
- Desktop & Tablet responsive web workspace (collapsible sticky sidebar, wide telemetry metrics, instant keyboard shortcuts).
- Multi-currency Brazilian Real (BRL `R$`) formatting and date grouping (`Hoje`, `Ontem`, formatted dates).

## Capabilities and Constraints

- **Budget Allocation**: Dynamic 50/30/20 calculations from monthly net income base.
- **VR Wallet**: Independent initial balance, credits/debits, and live remaining balance.
- **Vector Telemetry**:
  - Pure SVG Donut distribution chart with centered totals and responsive percentage legend.
  - Pure SVG Timeline cumulative expense chart with area gradients and glowing end-point indicators.
- **Authentication**: Google Sign-In (native Capacitor + Firebase) and Email/Password with real-time Firestore sync.
- **In-App Update Engine**: Automatic version comparison against `version.json` with direct GitHub Release APK download.

## Brand Commitments

- Name: FinFlow
- Aesthetic Signature: Obsidian Dark (`#09090B`), Surface Elevated (`#121216`), Champagne Gold (`#F59E0B`), and Semantic Triad (Emerald `#10B981`, Amber `#F59E0B`, Royal Blue `#3B82F6`, Pink `#EC4899`).
- Typography: Outfit (geometric, confident, high legibility) + Tabular Numeral alignment.

## Product Principles

1. **Instant Clarity**: All critical balances and progress bars visible within 1 second of loading.
2. **Zero AI Slop / Tactical Craft**: Clean elevation shadows, precise borders, no gaudy neon glows.
3. **Rock-Solid Robustness**: Robust offline fallbacks, reactive state re-renders, and pure vector rendering for crystal-sharp visuals on any screen DPI.
