# Color Palette — leonardespi.me

Warm parchment light mode with a terracotta accent. Dark mode uses deep warm browns.

---

## Light Mode

| Token                  | Hex       | Usage                     |
| ---------------------- | --------- | ------------------------- |
| `--color-bg`           | `#F5F0EA` | Page background           |
| `--color-bg-card`      | `#EDE8E0` | Card / surface background |
| `--color-bg-muted`     | `#EDE8E0` | Muted section background  |
| `--color-text`         | `#1C1A17` | Primary text              |
| `--color-text-muted`   | `#6B6460` | Secondary / caption text  |
| `--color-border`       | `#D5CFC6` | Borders and dividers      |
| `--color-accent`       | `#C17D52` | CTA, links, highlights    |
| `--color-accent-hover` | `#8A5E3A` | Accent on hover           |
| `--color-outcome-text` | `#7A4A28` | Outcome / result labels   |

---

## Dark Mode

| Token                  | Hex       | Usage                     |
| ---------------------- | --------- | ------------------------- |
| `--color-bg`           | `#2A2724` | Page background           |
| `--color-bg-card`      | `#333028` | Card / surface background |
| `--color-bg-muted`     | `#3A362D` | Muted section background  |
| `--color-text`         | `#F0EBE3` | Primary text              |
| `--color-text-muted`   | `#9A918A` | Secondary / caption text  |
| `--color-border`       | `#2E2A25` | Borders and dividers      |
| `--color-accent`       | `#D4926A` | CTA, links, highlights    |
| `--color-accent-hover` | `#C17D52` | Accent on hover           |
| `--color-outcome-text` | `#D4926A` | Outcome / result labels   |

---

## Typography

| Token            | Value                                      |
| ---------------- | ------------------------------------------ |
| `--font-display` | `'DM Serif Display', Georgia, serif`       |
| `--font-body`    | `'DM Sans', system-ui, sans-serif`         |
| `--font-mono`    | `'JetBrains Mono', 'Fira Code', monospace` |

Google Fonts import:

```
https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=JetBrains+Mono:wght@400;500&display=swap
```

---

## CSS Variables (ready to paste)

```css
:root {
  --color-bg: #f5f0ea;
  --color-bg-card: #ede8e0;
  --color-bg-muted: #ede8e0;
  --color-text: #1c1a17;
  --color-text-muted: #6b6460;
  --color-border: #d5cfc6;
  --color-accent: #c17d52;
  --color-accent-hover: #8a5e3a;
  --color-outcome-text: #7a4a28;

  --font-display: 'DM Serif Display', Georgia, serif;
  --font-body: 'DM Sans', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}

[data-theme='dark'] {
  --color-bg: #2a2724;
  --color-bg-card: #333028;
  --color-bg-muted: #3a362d;
  --color-text: #f0ebe3;
  --color-text-muted: #9a918a;
  --color-border: #2e2a25;
  --color-accent: #d4926a;
  --color-accent-hover: #c17d52;
  --color-outcome-text: #d4926a;
}
```
