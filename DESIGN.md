# Design System · FinFlow

<!-- impeccable:design-schema 1 -->

## Visual World & Aesthetic Identity

- **Theme**: Obsidian Dark & Champagne Gold (`#09090B`, `#121216`, `#F59E0B`)
- **Philosophy**: Restrained luxury fintech. High contrast, clean elevation, zero colored glow blur shadows, tactile depth, and instant clarity.

## Typography

- **Primary Font**: `Outfit` (`400`, `500`, `600`, `700`, `800`)
- **Data & Numbers**: `font-variant-numeric: tabular-nums` for precise alignment of financial digits and currency amounts.
- **Ramp**:
  - Display / Hero Amount: `2.6rem` (Weight 800)
  - Page Titles: `1.85rem` (Desktop), `1.45rem` (Mobile) (Weight 800)
  - Card Titles: `1.15rem`–`1.25rem` (Weight 800)
  - Body Text: `0.95rem` (Weight 500/600)
  - Meta & Labels: `0.75rem`–`0.85rem` (Weight 700/800, `letter-spacing: 0.04em`)

## Color Palette & Semantic Tokens

| Token | Hex / Value | Usage |
|---|---|---|
| `--bg-app` | `#09090B` | Deep obsidian canvas background |
| `--surface` | `#121216` | Cards and container surfaces |
| `--surface-raised` | `#18181E` | Elevated elements and list cards |
| `--surface-subtle` | `#202028` | Inputs, badges, and inactive chips |
| `--border` | `rgba(255, 255, 255, 0.08)` | Subtle container boundaries |
| `--border-strong` | `rgba(255, 255, 255, 0.16)` | Modal borders and active states |
| `--primary` | `#F59E0B` | Champagne gold brand accent |
| `--color-needs` | `#10B981` | 50% Necessidades (Emerald) |
| `--color-wants` | `#F59E0B` | 30% Desejos (Amber) |
| `--color-savings` | `#3B82F6` | 20% Investimentos (Blue) |
| `--color-vr` | `#EC4899` | Carteira VR (Pink) |
| `--danger` | `#DC2626` | Destructive actions & deficits |

## Elevation & Depth

- **Elevation Shadows**:
  - Sub-surface: `--shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.4)`
  - Card: `--shadow-sm: 0 2px 6px rgba(0, 0, 0, 0.5)`
  - Floating / Modals: `--shadow-xl: 0 24px 50px -8px rgba(0, 0, 0, 0.9)`
- **Anti-Pattern Bans**: No zero-offset neon glow chromatic halos (`0 0 Xpx`).

## Micro-Interactions & Animation

- **Timing Function**: `cubic-bezier(0.16, 1, 0.3, 1)` (smooth exponential deceleration, no cartoon bounce).
- **Fast Transitions**: `0.15s` for buttons, links, and pill toggles.
- **Modals**: Slide-up bottom sheet on mobile (`0.28s`), scale-in on desktop (`0.25s`).
