---
name: Sanction Screening
description: Compliance dashboard for merchant sanction screening
colors:
  accent-blue: "#006CFF"
  accent-blue-dim: "#0055CC"
  surface-base: "#0C0E14"
  surface-raised: "#13161F"
  surface-overlay: "#1A1E2A"
  border-subtle: "#252B3B"
  border-default: "#2E3547"
  text-primary: "#EEF0F7"
  text-secondary: "#8B92A8"
  text-muted: "#5A6173"
  status-confirmed: "#F87171"
  status-confirmed-bg: "#2C1212"
  status-potential: "#F59E0B"
  status-potential-bg: "#2A1F05"
  status-review: "#60A5FA"
  status-review-bg: "#0D1A2E"
  status-clear: "#22C55E"
  status-clear-bg: "#0D2A1A"
typography:
  display:
    fontFamily: "Inter, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.02em"
  mono:
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent-blue}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-blue-dim}"
    textColor: "{colors.text-primary}"
    textColor: "{colors.text-primary}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  input-default:
    backgroundColor: "{colors.surface-base}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  status-confirmed:
    backgroundColor: "{colors.status-confirmed-bg}"
    textColor: "{colors.status-confirmed}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  status-potential:
    backgroundColor: "{colors.status-potential-bg}"
    textColor: "{colors.status-potential}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  status-review:
    backgroundColor: "{colors.status-review-bg}"
    textColor: "{colors.status-review}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
---

# Design System: Sanction Screening

## 1. Overview

**Creative North Star: "The Command Centre"**

This is ops software for compliance professionals making serious decisions. The visual language is dark, structured, and fast to read: a single electric-blue accent against near-black surfaces, Inter throughout, and a layout designed to surface match status at a glance without any ceremony.

The current implementation is light-themed. The design system targets a dark theme that reflects the tool's actual use: a compliance analyst, often running batch reviews in a focused session, needs signal-not-noise, not a cheerful SaaS product. Dark reduces visual fatigue during extended sessions, and the accent blue pops cleanly against near-black surfaces in a way it does not against white.

This system explicitly rejects: generic SaaS warmth (pastel cards, rounded-everything, blue gradients), government-form density (grey walls of text with zero hierarchy), and security-dashboard theatre (neon alerts, excessive red, DEFCON aesthetics). The goal is the opposite: calm authority.

**Key Characteristics:**
- Single-accent discipline: the accent blue appears on interactive elements and primary CTAs only
- Status legibility in under 1 second: confirmed / potential / review / clear each have a distinct color role
- Data-table first: the primary surface is rows of data, not cards or dashboards
- Inter at every size: no display font, no mixing, consistency over personality
- Flat-by-default: elevation only on overlays and dropdowns, never decorative

**Accent blue:** `#006CFF` (`rgb(0, 108, 255)`) — a single saturated blue used only for interactive and brand purposes.

## 2. Colors: The Command Palette

A single saturated accent against deep neutrals. The palette has one job: make match status instantly readable.

### Primary
- **Accent Blue** (`#006CFF`): The only saturated color in the UI. Used on primary buttons, active tab indicators, focused input borders, and interactive elements. Appears on ≤15% of any screen at rest.
- **Accent Blue Dimmed** (`#0055CC`): Hover and pressed state for Accent Blue interactive elements. Never used as a standalone color.

### Neutral
- **Surface Base** (`#0C0E14`): Page background. Tinted very slightly blue-navy, not pure black.
- **Surface Raised** (`#13161F`): Cards, panels, the header. One step above base.
- **Surface Overlay** (`#1A1E2A`): Modals, dropdowns, hover states on rows.
- **Border Subtle** (`#252B3B`): Dividers, table row separators, inactive borders.
- **Border Default** (`#2E3547`): Input borders at rest, card outlines.
- **Text Primary** (`#EEF0F7`): Headings, data cells, any content that must be read precisely.
- **Text Secondary** (`#8B92A8`): Labels, metadata, secondary information.
- **Text Muted** (`#5A6173`): Timestamps, helper text, disabled states.

### Status Colors (semantic only — never decorative)
A confirmed sanction match is a bad outcome (the merchant cannot be onboarded), so confirmed = red. Clear means safe to proceed = green.

- **Confirmed Match** (`#F87171` on `#2C1212`): The merchant matched a sanctions list. Red because this blocks onboarding.
- **Potential Match** (`#F59E0B` on `#2A1F05`): Likely match — analyst review required.
- **Review** (`#60A5FA` on `#0D1A2E`): Low-confidence match — human judgment needed.
- **Clear** (`#22C55E` on `#0D2A1A`): No match. Safe to proceed.

**The One Blue Rule.** Accent Blue is the only saturated color used for interactive and brand purposes. It is never used decoratively, never as a background fill, never in gradients. Its scarcity is what makes it meaningful.

**The Status Sovereignty Rule.** Green, amber, and blue-light are reserved exclusively for match status badges. They do not appear on buttons, links, or any non-status element. If a component needs emphasis, use Accent Blue or typography weight — not a status color.

## 3. Typography

**Display Font:** Inter at 700 weight — used for section headings and the wordmark.
**Body Font:** Inter (with `-apple-system, sans-serif` fallback) — used for all UI text, labels, data cells.
**Mono Font:** JetBrains Mono or Fira Code — for IDs, raw match scores, list source codes.

**Character:** Inter handles everything: it's legible at 13px in dense data tables, carries authority at 600 weight in headings, and is widely available. The system is deliberately utilitarian — hierarchy comes from size and weight contrast, not expressive typefaces.

### Hierarchy
- **Display** (700, 1.5rem / 24px, -0.02em tracking): Page section titles. Used sparingly — one per panel at most.
- **Headline** (600, 1rem / 16px, -0.01em tracking): Card headers, panel titles, column group labels.
- **Body** (400, 0.875rem / 14px): Table cell content, form inputs, the majority of the interface.
- **Label** (500, 0.75rem / 12px, +0.02em tracking): Column headers, badge text, metadata keys. Slightly tracked out to distinguish from body.
- **Mono** (400, 0.8125rem / 13px): Raw IDs, match scores, list source codes (OFAC, EU, etc.), any value that must be visually distinct from prose.

**The Contrast Rule.** Every step in the hierarchy changes at least one of: weight, size, or tracking. A 14px/400 body adjacent to a 14px/500 label is not enough contrast. Size and weight must move together.

## 4. Elevation

This system is flat by default. Surfaces are distinguished by background color, not shadow depth. Shadows are structural, not decorative — they appear only when a surface floats above the page (modal, dropdown, tooltip).

### Shadow Vocabulary
- **Overlay** (`0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)`): Modals, command palette, full-screen overlays. Strong shadow appropriate for a dark background.
- **Dropdown** (`0 4px 16px rgba(0,0,0,0.4)`): Select menus, contextual menus, date pickers.
- **Tooltip** (`0 2px 8px rgba(0,0,0,0.35)`): Small floating labels.

**The Flat-By-Default Rule.** Cards, panels, and status cards use background color (`surface-raised`) against the page background (`surface-base`) to create depth — not shadows. Shadows are reserved for elements that truly float above the document. Adding a shadow to a card that sits flat on a page is visual lying.

## 5. Components

### Buttons
Compact, functional, not decorative. Padding is tight because analysts use these constantly.

- **Shape:** Gently rounded (6px radius). Not pill-shaped — this is a tool, not a product.
- **Primary:** Accent Blue background (`#006CFF`), white text, 8px 16px padding, 0.875rem/500 weight.
- **Hover / Focus:** Background shifts to `#0055CC`. Focus ring: `0 0 0 3px rgba(0, 102, 255, 0.25)` — visible but not aggressive.
- **Ghost:** Transparent background, `border-default` border, secondary text color. Used for secondary actions (Refresh, Cancel, Export).
- **Danger outline:** Transparent, danger-red border and text. Used only for destructive confirmation, never as a default action style.
- **Disabled:** 40% opacity. No color change — opacity alone signals state.

### Status Badges
The most important component in the system. Must be readable before anything else.

- **Shape:** Full pill (`border-radius: 999px`), 3px 10px padding.
- **Confirmed Match:** Red text on red-tinted dark background. `font-weight: 600`.
- **Potential Match:** Amber text on amber-tinted dark background. `font-weight: 600`.
- **Review:** Blue-light text on blue-tinted dark background. `font-weight: 600`.
- **Clear:** Green text on green-tinted dark background. `font-weight: 600`.

### Data Tables
The primary surface of the application. Every design decision serves scannability.

- **Row height:** 44px minimum (comfortable click target, readable at a glance).
- **Row hover:** Background shifts to `surface-overlay`. No border change needed.
- **Column headers:** Label style (0.75rem, 500 weight, +0.02em tracking, `text-muted` color). Uppercase only if fewer than 4 characters (e.g. IDs).
- **Borders:** Row separators use `border-subtle` only. No outer border on the table itself.
- **Score column:** Displayed in mono font. Right-aligned.
- **Status column:** Badge only — no text alongside the badge.

### Inputs / Fields
- **Style:** `surface-base` background, `border-default` border at rest (1px), 6px radius.
- **Focus:** Border shifts to `accent-blue`, `0 0 0 3px rgba(0, 102, 255, 0.15)` focus ring.
- **Placeholder:** `text-muted` color.
- **Error:** `#EF4444` border and helper text below. No background fill change.

### Navigation Tabs
- **Style:** Flush with header bottom edge. Tabs are text-only — no icons unless the icon adds meaning.
- **Default:** `text-secondary` color, no underline.
- **Hover:** `text-primary` color.
- **Active:** `accent-blue` color, 2px bottom border in `accent-blue`. No background.

### Header
- **Background:** `surface-raised` with a 1px bottom border in `border-subtle`.
- **Brand mark:** "SENTINEL" wordmark in `text-primary` at 700 weight, followed by a separator and "Sanction Screening" in `text-muted` at 400 weight.
- **Height:** 56px.

## 6. Do's and Don'ts

### Do:
- **Do** use Inter at every text size. No display font mixing.
- **Do** use `surface-base` → `surface-raised` → `surface-overlay` as the three elevation steps, distinguished by background color alone.
- **Do** display match status (confirmed / potential / review / clear) as a badge in every results row. Status must be visible without expanding a row.
- **Do** use monospace for raw IDs, scores, and list source codes (OFAC, EU, UN, UK, etc.).
- **Do** keep Accent Blue (`#006CFF`) for interactive elements only: buttons, active tabs, focused inputs, links. Its rarity is its meaning.
- **Do** use weight + size contrast together for typographic hierarchy. Changing only weight or only size is insufficient.

### Don't:
- **Don't** use pastel cards, rounded-everything, purple gradients, or friendly illustrations. This tool makes serious compliance decisions. Generic SaaS aesthetics (Intercom, Notion, Loom-style) are explicitly rejected.
- **Don't** apply `border-left` or `border-right` greater than 1px as a colored accent stripe on any card, alert, or list item. Use background tints or full borders instead.
- **Don't** use `background-clip: text` with a gradient. Status should be communicated with solid color, weight, or layout — not decoration.
- **Don't** use status colors (green, amber, blue-light) on any element that is not a status badge. They are reserved exclusively for match status. A green button or amber heading breaks the status vocabulary.
- **Don't** build a dark-and-neon security dashboard. This is not a SOC monitor. No dramatic red alerts, no glowing borders, no pulsing indicators on routine states.
- **Don't** use grey-wall government-form density. Every section needs breathing room and readable hierarchy.
- **Don't** add shadows to cards or panels that sit flat on the page. Flat surfaces use background color steps, not shadows.
- **Don't** put the same padding on everything. Vary rhythm: 8px inside tight components, 16px inside cards, 24px between sections.
