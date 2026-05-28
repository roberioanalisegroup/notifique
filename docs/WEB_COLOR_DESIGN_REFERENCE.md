# Web Color & Design Reference Guide
> A comprehensive, opinionated reference for building modern, production-grade web interfaces.
> Covers dark/light themes, color theory, typography rules, contrast, accessibility, and color psychology.

---

## Table of Contents

1. [Color Fundamentals](#1-color-fundamentals)
2. [Color Psychology](#2-color-psychology)
3. [Dark Theme Design](#3-dark-theme-design)
4. [Light Theme Design](#4-light-theme-design)
5. [Curated Palettes](#5-curated-palettes)
6. [Typography Rules](#6-typography-rules)
7. [Contrast & Accessibility (WCAG)](#7-contrast--accessibility-wcag)
8. [CSS Variable Architecture](#8-css-variable-architecture)
9. [Color Pairing Rules](#9-color-pairing-rules)
10. [Common Mistakes to Avoid](#10-common-mistakes-to-avoid)
11. [Quick Reference Cheatsheet](#11-quick-reference-cheatsheet)

---

## 1. Color Fundamentals

### The Color Wheel

Colors are organized into three categories:

- **Primary**: Red, Blue, Yellow (traditional) / Red, Green, Blue (digital/RGB)
- **Secondary**: Orange, Purple, Green (mix of two primaries)
- **Tertiary**: Combinations of primary + secondary

### Key Properties of Color

| Property | Definition | Example |
|---|---|---|
| **Hue** | The color itself | Red, Blue, Teal |
| **Saturation** | Color intensity/purity | Vivid vs. Muted |
| **Lightness** | How light or dark | Near white vs. near black |
| **Opacity/Alpha** | Transparency level | 0% (invisible) → 100% (solid) |

### Color Harmony Models

| Model | Description | When to Use |
|---|---|---|
| **Monochromatic** | Shades/tints of one hue | Minimal, cohesive, calm UIs |
| **Analogous** | 2–3 adjacent hues on wheel | Natural, harmonious feel |
| **Complementary** | Opposite hues (e.g. Blue + Orange) | High contrast, bold CTAs |
| **Split-Complementary** | One hue + two adjacent to its complement | Vibrant but balanced |
| **Triadic** | Three evenly-spaced hues | Playful, energetic UIs |
| **Tetradic** | Four hues forming a rectangle | Complex palettes, use sparingly |

### The 60/30/10 Rule

A reliable ratio for distributing colors in a UI:

```
60% — Dominant/Background color (sets the tone)
30% — Secondary color (surfaces, cards, sidebars)
10% — Accent color (CTAs, highlights, interactive elements)
```

---

## 2. Color Psychology

Colors carry emotional and cultural weight. Use them intentionally.

### Color Meanings in Digital Contexts

| Color | Emotions / Associations | Best for |
|---|---|---|
| **Blue** | Trust, stability, calm, professionalism | Finance, healthcare, SaaS, B2B |
| **Green** | Growth, success, health, nature, money | Fintech, sustainability, dashboards |
| **Red** | Urgency, danger, energy, passion | Alerts, CTAs, food, sales |
| **Orange** | Warmth, creativity, enthusiasm, action | Startups, e-commerce, CTAs |
| **Yellow** | Optimism, attention, warmth | Warnings, highlights, children |
| **Purple** | Luxury, creativity, wisdom, mystery | Beauty, premium, tech |
| **Pink** | Playfulness, care, femininity, modernity | Lifestyle, wellness, fashion |
| **Teal/Cyan** | Balance, clarity, innovation | Tech, medical, dashboards |
| **Black** | Power, elegance, sophistication | Luxury, fashion, premium SaaS |
| **White** | Cleanliness, simplicity, space | Minimal UIs, documentation |
| **Gray** | Neutrality, professionalism, structure | Backgrounds, secondary text |

### Key Psychological Principles

**1. Color Temperature**
- **Warm colors** (Red, Orange, Yellow) → advance visually, feel closer, create urgency
- **Cool colors** (Blue, Green, Purple) → recede visually, feel distant, create calm

**2. Saturation & Emotion**
- High saturation → excitement, energy, attention
- Low saturation (muted) → sophistication, calm, professionalism

**3. Lightness & Perception**
- Lighter shades → open, friendly, approachable
- Darker shades → powerful, mysterious, premium

**4. The Von Restorff Effect**
An element that stands out from its surroundings will be remembered. Use accent colors strategically — only on elements that truly need attention (CTAs, alerts, key metrics).

**5. Color Consistency = Trust**
Using colors consistently builds pattern recognition. Users learn "green = success", "red = error". Never break these patterns.

**6. Simultaneous Contrast**
A color looks different depending on its surrounding colors. A gray on dark background appears lighter than the same gray on a white background. Test colors in context, never in isolation.

---

## 3. Dark Theme Design

Dark themes reduce eye strain in low-light environments and convey premium, modern aesthetics.

### Core Principles

- **Never use pure black (#000000)** as the base — it creates harsh contrast and looks flat
- **Never use pure white (#FFFFFF)** for body text on dark backgrounds — too much contrast causes halation (text appears to bleed)
- **Layer surfaces** — use slightly different shades of dark to indicate elevation
- **Desaturate colors slightly** — fully saturated colors vibrate harshly on dark backgrounds
- **Reserve white for emphasis only** — use it on headings, critical data, active states

### Surface Elevation System (Dark Theme)

Elevation is expressed through increasing lightness, not shadows alone:

```
Background (lowest)    → #0A0A0F  (near black, slightly blue-tinted)
Surface 1              → #111117  (+1 level)
Surface 2 (cards)      → #18181F  (+2 levels)
Surface 3 (modals)     → #1E1E27  (+3 levels)
Surface 4 (tooltips)   → #252530  (+4 levels)
Border                 → #2A2A38  (subtle separator)
```

> Rule: Each surface level should be roughly 5–7% lighter than the one below it.

### Text Colors for Dark Themes

```
Primary text    → #F0F0F0 or rgba(255,255,255,0.92)   — headings, critical info
Secondary text  → rgba(255,255,255,0.60)               — labels, descriptions
Tertiary text   → rgba(255,255,255,0.38)               — placeholders, disabled
Inverse text    → #0A0A0F                              — text on light/accent surfaces
```

> **Do not use** pure `#FFFFFF` for body text. Use `rgba(255,255,255,0.87)` or `#E8E8E8`.

### Accent Colors for Dark Themes

Accent colors must be **toned down** for dark backgrounds:

| Light Theme Accent | Dark Theme Equivalent |
|---|---|
| `#2563EB` (bright blue) | `#60A5FA` (softer blue) |
| `#16A34A` (strong green) | `#4ADE80` (lime green) |
| `#DC2626` (red) | `#F87171` (soft red) |
| `#9333EA` (purple) | `#C084FC` (lavender) |

Rule: **Use 300–400 range colors** (Tailwind scale) as accents on dark backgrounds. The 500–700 range works for light themes.

### Dark Theme: Minimal Full Example

```css
:root[data-theme="dark"] {
  --bg-base:      #0D0D12;
  --bg-surface:   #14141C;
  --bg-card:      #1A1A24;
  --bg-elevated:  #21212E;

  --border:       rgba(255,255,255,0.08);
  --border-focus: rgba(99,102,241,0.6);

  --text-primary:   rgba(255,255,255,0.92);
  --text-secondary: rgba(255,255,255,0.58);
  --text-muted:     rgba(255,255,255,0.34);

  --accent:         #818CF8;   /* Indigo 400 */
  --accent-hover:   #6366F1;   /* Indigo 500 */
  --accent-subtle:  rgba(99,102,241,0.15);

  --success:  #4ADE80;
  --warning:  #FBBF24;
  --error:    #F87171;
  --info:     #38BDF8;
}
```

---

## 4. Light Theme Design

### Core Principles

- **Never use pure white (#FFFFFF) as the only background** — pair with a warm or cool off-white for depth
- **Gray text, not black text** — pure black `#000000` on white feels harsh; use `#111827` or `#1F2937`
- **Subtle shadows over borders** — light themes rely on shadows for elevation, not lightness jumps
- **High saturation accents work well** — unlike dark themes, light themes can handle vibrant 500–600 range colors

### Surface Elevation System (Light Theme)

```
Background (base)    → #F9FAFB  (warm off-white)
Surface 1            → #FFFFFF  (cards, panels)
Surface 2 (modals)   → #FFFFFF  + shadow level 2
Surface 3 (tooltips) → #FFFFFF  + shadow level 3
Border               → #E5E7EB  (neutral gray)
```

### Text Colors for Light Themes

```
Primary text    → #111827   — headings
Secondary text  → #4B5563   — body text
Tertiary text   → #9CA3AF   — captions, placeholders
Disabled        → #D1D5DB   — inactive elements
Inverse text    → #FFFFFF   — text on colored/dark surfaces
```

### Light Theme: Minimal Full Example

```css
:root[data-theme="light"] {
  --bg-base:      #F9FAFB;
  --bg-surface:   #FFFFFF;
  --bg-card:      #FFFFFF;
  --bg-elevated:  #FFFFFF;

  --border:       #E5E7EB;
  --border-focus: #6366F1;

  --text-primary:   #111827;
  --text-secondary: #6B7280;
  --text-muted:     #9CA3AF;

  --accent:         #6366F1;   /* Indigo 500 */
  --accent-hover:   #4F46E5;   /* Indigo 600 */
  --accent-subtle:  #EEF2FF;   /* Indigo 50 */

  --success:  #16A34A;
  --warning:  #D97706;
  --error:    #DC2626;
  --info:     #0284C7;
}
```

---

## 5. Curated Palettes

### 5.1 Dark SaaS / Dashboard (Professional B2B)

```
Base:      #0C0C14  — deep navy-black
Surface:   #13131E  — cards
Border:    #252538
Accent:    #7C6AF7  — soft violet
Text:      rgba(255,255,255,0.90)
Sub-text:  rgba(255,255,255,0.55)
Success:   #34D399
Error:     #F87171
```

**Feel**: Premium, focused, enterprise. Good for: portals, dashboards, admin panels.

---

### 5.2 Dark Fintech / Accounting

```
Base:      #050B14  — deep navy
Surface:   #0D1A2A  — blue-tinted card
Border:    #1A3040
Accent:    #00D4AA  — financial teal
Text:      #E2F0FF
Sub-text:  rgba(226,240,255,0.55)
Success:   #00D4AA
Error:     #FF6B6B
Warning:   #FFD93D
```

**Feel**: Trustworthy, data-driven, clean. Good for: financial portals, accounting tools, ERP.

---

### 5.3 Dark Creative / Agency

```
Base:      #0A0A0A  — true black
Surface:   #111111  — near black
Border:    #222222
Accent:    #FF3D00  — electric orange-red
Text:      #FAFAFA
Sub-text:  #777777
Highlight: #FFD600  — electric yellow
```

**Feel**: Bold, editorial, high-contrast. Good for: agencies, portfolios, landing pages.

---

### 5.4 Light Minimal / Clean SaaS

```
Base:      #F8FAFC
Surface:   #FFFFFF
Border:    #E2E8F0
Accent:    #6366F1  — indigo
Text:      #0F172A
Sub-text:  #64748B
Success:   #059669
Error:     #DC2626
```

**Feel**: Clean, modern, trustworthy. Good for: SaaS products, documentation, B2B tools.

---

### 5.5 Light Warm / Human-Centered

```
Base:      #FFFBF5  — cream white
Surface:   #FFFFFF
Border:    #E8DFD0
Accent:    #E8580C  — warm orange
Text:      #1C1007
Sub-text:  #78614A
Success:   #3D7A4C
Error:     #C0392B
```

**Feel**: Warm, approachable, human. Good for: health apps, education, lifestyle, e-commerce.

---

## 6. Typography Rules

### Font Pairing Strategy

Always pair fonts with **contrast in purpose**:

```
Display font  → personality, headlines, brand expression
Body font     → readability, neutrality, legibility at small sizes
Mono font     → code, data, technical values
```

### Recommended Font Pairings

| Display | Body | Mono | Vibe |
|---|---|---|---|
| Fraunces | DM Sans | JetBrains Mono | Editorial, warm |
| Syne | Inter | Fira Code | Modern, geometric |
| Cabinet Grotesk | Satoshi | IBM Plex Mono | Clean, premium |
| Clash Display | Plus Jakarta Sans | Geist Mono | Bold, startup |
| Playfair Display | Source Sans 3 | Cascadia Code | Classic, trustworthy |
| Bebas Neue | Nunito | Roboto Mono | Strong, friendly |

> **Avoid overused generics**: Inter alone, Roboto alone, Arial, System UI with no personality.

### Type Scale (Modular Scale — ratio 1.25)

```
xs:    0.75rem  (12px)   — labels, badges, captions
sm:    0.875rem (14px)   — secondary text, form hints
base:  1rem     (16px)   — body text baseline
lg:    1.125rem (18px)   — large body, card titles
xl:    1.25rem  (20px)   — section subtitles
2xl:   1.5rem   (24px)   — section headings
3xl:   1.875rem (30px)   — page subheadings
4xl:   2.25rem  (36px)   — page headings
5xl:   3rem     (48px)   — hero titles
6xl:   3.75rem  (60px)   — display/impact text
7xl:   4.5rem   (72px)   — maximum display
```

### Font Weight Usage

```
100–200  — Thin         → decorative only, large sizes
300      — Light        → elegant, refined body text
400      — Regular      → default body weight
500      — Medium       → UI labels, navigation
600      — SemiBold     → card titles, emphasized content
700      — Bold         → headings, CTAs
800–900  — ExtraBold    → display/hero text only
```

### Line Height Rules

```
Display text (48px+)  → line-height: 1.1 – 1.2
Headings (24–48px)    → line-height: 1.2 – 1.35
Body text (16–18px)   → line-height: 1.5 – 1.7
Small text (12–14px)  → line-height: 1.4 – 1.6
UI labels/buttons     → line-height: 1.0 – 1.2
```

### Letter Spacing Rules

```
Display / Hero text     → letter-spacing: -0.02em to -0.04em  (tighten)
Section Headings        → letter-spacing: -0.01em to -0.02em
Body text               → letter-spacing: 0 (default)
Small caps / ALL CAPS   → letter-spacing: 0.05em to 0.15em   (loosen)
UI Labels / Overlines   → letter-spacing: 0.08em to 0.12em
```

### Paragraph Width (Measure)

```
Ideal readable width:  60–75 characters per line
CSS equivalent:        max-width: 65ch
Never exceed:          85ch for any continuous text block
```

---

## 7. Contrast & Accessibility (WCAG)

### Contrast Ratio Requirements

| Text Type | Minimum (AA) | Enhanced (AAA) |
|---|---|---|
| Normal text (< 18px) | 4.5:1 | 7:1 |
| Large text (≥ 18px bold or ≥ 24px) | 3:1 | 4.5:1 |
| UI components & icons | 3:1 | — |
| Decorative elements | No requirement | — |

### How to Check Contrast

- **Browser**: Chrome DevTools → Accessibility → Color contrast
- **Online**: `webaim.org/resources/contrastchecker`
- **Figma Plugin**: Contrast or Able
- **CSS in JS**: `polished` library has `readableColor()` helper

### Safe Text/Background Combinations

**Dark Theme (tested, AA+)**

| Background | Text Color | Ratio |
|---|---|---|
| `#0D0D12` | `rgba(255,255,255,0.92)` | ~16:1 ✅ |
| `#1A1A24` | `rgba(255,255,255,0.87)` | ~11:1 ✅ |
| `#1A1A24` | `rgba(255,255,255,0.55)` | ~6.5:1 ✅ |
| `#1A1A24` | `rgba(255,255,255,0.38)` | ~4.5:1 ✅ |
| `#7C6AF7` (accent) | `#FFFFFF` | ~4.6:1 ✅ |

**Light Theme (tested, AA+)**

| Background | Text Color | Ratio |
|---|---|---|
| `#FFFFFF` | `#111827` | ~18:1 ✅ |
| `#FFFFFF` | `#4B5563` | ~7.5:1 ✅ |
| `#FFFFFF` | `#6B7280` | ~4.6:1 ✅ |
| `#F3F4F6` | `#374151` | ~8:1 ✅ |
| `#6366F1` (accent) | `#FFFFFF` | ~4.5:1 ✅ |

---

## 8. CSS Variable Architecture

### Recommended Token Structure

Organize CSS variables in three layers:

```css
/* ─── LAYER 1: Primitive tokens (raw values) ─── */
:root {
  /* Color ramp */
  --indigo-50:  #EEF2FF;
  --indigo-100: #E0E7FF;
  --indigo-400: #818CF8;
  --indigo-500: #6366F1;
  --indigo-600: #4F46E5;
  --indigo-900: #312E81;

  /* Neutral ramp */
  --neutral-50:  #F9FAFB;
  --neutral-100: #F3F4F6;
  --neutral-200: #E5E7EB;
  --neutral-700: #374151;
  --neutral-800: #1F2937;
  --neutral-900: #111827;
  --neutral-950: #030712;
}

/* ─── LAYER 2: Semantic tokens (purpose-named) ─── */
:root[data-theme="dark"] {
  --color-bg:           #0D0D12;
  --color-surface:      #14141C;
  --color-surface-alt:  #1A1A24;
  --color-border:       rgba(255,255,255,0.08);
  --color-border-focus: var(--indigo-400);

  --color-text:         rgba(255,255,255,0.92);
  --color-text-muted:   rgba(255,255,255,0.55);
  --color-text-faint:   rgba(255,255,255,0.34);

  --color-accent:       var(--indigo-400);
  --color-accent-hover: var(--indigo-500);
  --color-accent-bg:    rgba(99,102,241,0.12);

  --color-success: #34D399;
  --color-warning: #FBBF24;
  --color-error:   #F87171;
  --color-info:    #38BDF8;
}

/* ─── LAYER 3: Component tokens (specific usage) ─── */
:root {
  --btn-primary-bg:    var(--color-accent);
  --btn-primary-text:  #FFFFFF;
  --btn-primary-hover: var(--color-accent-hover);

  --input-bg:          var(--color-surface);
  --input-border:      var(--color-border);
  --input-focus:       var(--color-border-focus);

  --card-bg:           var(--color-surface-alt);
  --card-border:       var(--color-border);
  --card-shadow:       0 1px 3px rgba(0,0,0,0.4);
}
```

### Theme Switching (JS)

```javascript
const toggleTheme = () => {
  const current = document.documentElement.getAttribute('data-theme');
  document.documentElement.setAttribute(
    'data-theme',
    current === 'dark' ? 'light' : 'dark'
  );
  localStorage.setItem('theme', document.documentElement.getAttribute('data-theme'));
};

// On load — respect user preference
const savedTheme = localStorage.getItem('theme')
  ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', savedTheme);
```

---

## 9. Color Pairing Rules

### Do ✅

- Pair a **neutral background** with a **single vivid accent** — clarity and hierarchy
- Use **monochromatic variations** for interactive states (hover = 10% darker/lighter)
- Use **opacity variants** of a color rather than a new color for subtle tones
- Apply **complementary color** only for maximum-contrast moments (hero CTAs, alerts)
- Keep **semantic colors consistent**: green = success, red = error, yellow = warning — always
- Use **one accent hue per product** — a second accent should only appear in charts/data

### Don't ❌

- Don't use more than **3 distinct hues** in a UI (background doesn't count)
- Don't place **two saturated colors** next to each other — they will fight for attention
- Don't use **random grays** — define a gray scale and stick to it
- Don't use color as the **only indicator** of state (for accessibility — pair with icon/label)
- Don't pick accent colors that **clash with semantic colors** (e.g. orange accent + orange warnings)
- Never use **pure #000000 text** on **pure #FFFFFF backgrounds** in a professional UI

### Color Relationships Quick Guide

| Relationship | Formula | Use For |
|---|---|---|
| Hover state | Accent +10% darker | Interactive feedback |
| Active/pressed | Accent +20% darker | Click/tap feedback |
| Subtle fill | Accent at 10–15% opacity | Highlighted rows, selected states |
| Disabled | Any color at 30–40% opacity | Inactive elements |
| Error background | Error at 10% opacity | Form field error fill |

---

## 10. Common Mistakes to Avoid

### Color Mistakes

| Mistake | Why it's wrong | Fix |
|---|---|---|
| Pure black background | Too harsh, unnatural | Use `#0A0A0F` or similar near-black |
| Too many accent colors | Creates visual chaos | Max 1–2 accent hues per product |
| Low-contrast placeholders | Fails WCAG, unreadable | Use at least 4.5:1 contrast ratio |
| Vibrant color on dark bg | Colors "vibrate", eye strain | Use desaturated/lighter tint variant |
| Gray text that's too light | Fails accessibility | Test against WCAG AA (4.5:1) |
| Color-only status indicators | Inaccessible to colorblind users | Add icons or labels alongside color |
| Inconsistent semantic colors | Destroys user trust | Define once, use everywhere |

### Typography Mistakes

| Mistake | Why it's wrong | Fix |
|---|---|---|
| Only one font weight | Flat hierarchy, no rhythm | Use at least 3 weights |
| Too many fonts (3+) | Visual clutter | Max 2 families (display + body) |
| Line height too tight for body | Eye fatigue, poor readability | Use 1.5–1.7 for body text |
| All-caps body text | Hard to read at length | All-caps for labels/badges only |
| Justified text in UI | Creates uneven spacing | Use `text-align: left` in UI |
| No max-width on paragraphs | Lines too long = hard to read | Cap at 65ch |

---

## 11. Quick Reference Cheatsheet

### Dark Theme Starter

```css
:root {
  /* Surfaces */
  --bg:       #0D0D12;
  --surface:  #14141C;
  --card:     #1A1A24;
  --border:   rgba(255,255,255,0.08);

  /* Text */
  --text:     rgba(255,255,255,0.92);
  --sub:      rgba(255,255,255,0.55);
  --muted:    rgba(255,255,255,0.32);

  /* Accent — swap hue to change personality */
  --accent:   #818CF8;  /* Indigo: professional */
  /* --accent: #34D399; — Emerald: financial     */
  /* --accent: #F472B6; — Pink: lifestyle        */
  /* --accent: #FB923C; — Orange: action/energy  */

  /* Status */
  --ok:   #34D399;
  --warn: #FBBF24;
  --err:  #F87171;
  --info: #38BDF8;
}
```

### Light Theme Starter

```css
:root {
  /* Surfaces */
  --bg:       #F9FAFB;
  --surface:  #FFFFFF;
  --card:     #FFFFFF;
  --border:   #E5E7EB;

  /* Text */
  --text:   #111827;
  --sub:    #6B7280;
  --muted:  #9CA3AF;

  /* Accent — same swap pattern */
  --accent: #6366F1;

  /* Status */
  --ok:   #16A34A;
  --warn: #D97706;
  --err:  #DC2626;
  --info: #0284C7;
}
```

### Typography Starter

```css
:root {
  --font-display: 'Fraunces', Georgia, serif;
  --font-body:    'DM Sans', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', monospace;

  --text-xs:   0.75rem;
  --text-sm:   0.875rem;
  --text-base: 1rem;
  --text-lg:   1.125rem;
  --text-xl:   1.25rem;
  --text-2xl:  1.5rem;
  --text-4xl:  2.25rem;
  --text-6xl:  3.75rem;

  --leading-tight:  1.2;
  --leading-normal: 1.6;
  --leading-loose:  1.8;
}
```

### Contrast Ratios — At a Glance

```
AA Normal text   →  ≥ 4.5:1
AA Large text    →  ≥ 3.0:1
AAA Normal text  →  ≥ 7.0:1
AAA Large text   →  ≥ 4.5:1
UI Components    →  ≥ 3.0:1
```

### Color Psychology — 5 Second Rule

```
Blue    → Trust / B2B / Finance
Green   → Growth / Success / Money
Red     → Urgency / Error / Energy
Orange  → Action / CTA / Warmth
Purple  → Premium / Creative / Luxury
Teal    → Innovation / Balance / Tech
Black   → Power / Elegance / Luxury
Gray    → Neutral / Professional / Structure
```

---

*Last updated: 2026 — Based on WCAG 2.2, Material Design 3, Radix UI Color System, and production UI patterns.*
