/**
 * Per-day auto-share card generator.
 * Builds a 1200x630 Open Graph image (PNG) for a given word, so each day's
 * word has its own shareable card that social platforms render. SVG is drawn by
 * hand (no template deps) and rasterized to PNG by resvg using bundled DejaVu
 * fonts, so the container renders text identically with no system-font reliance.
 */

import { Resvg } from "@resvg/resvg-js";

// Load fonts by PATH, not buffer: the prebuilt resvg-js native binary silently
// ignores `fontBuffers` in some Linux builds (renders shapes but no text), while
// `fontFiles` works consistently on both the host and inside the container.
const A = new URL("./assets/", import.meta.url).pathname;
const FONT_FILES = [A + "DejaVuSans.ttf", A + "DejaVuSans-Bold.ttf", A + "DejaVuSansMono.ttf"];

const W = 1200;
const H = 630;

// OnlyMIP palettes — light ("OF") and a matching dark, both keeping the cyan
// accent. The card is rendered in whichever matches the viewer's OS setting.
type Palette = typeof LIGHT;
const LIGHT = {
  bg: "#f3f6f8",
  card: "#ffffff",
  border: "#e2e8ed",
  accent: "#00aff0",
  text: "#16191c",
  muted: "#5a6b76",
  dim: "#7c8a95",
  chipBg: "#f1f4f7",
};
const DARK = {
  bg: "#0f1216",
  card: "#171b21",
  border: "#2a313b",
  accent: "#00aff0",
  text: "#f2f5f8",
  muted: "#9aa6b2",
  dim: "#6b7784",
  chipBg: "#1e242c",
};
const THEMES: Record<string, Palette> = { light: LIGHT, dark: DARK };

type Word = {
  id: string;
  word: string;
  pos: string;
  ipa: string;
  blend: string[];
  definition: string;
  example: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Rough advance-width estimate for DejaVu at a given font size. */
function textWidth(text: string, fs: number, bold = false): number {
  return text.length * fs * (bold ? 0.62 : 0.56);
}

/** Greedy word-wrap into at most `maxLines` lines fitting `maxWidth`. */
function wrap(text: string, fs: number, maxWidth: number, maxLines = 3): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (let k = 0; k < words.length; k++) {
    const trial = line ? line + " " + words[k] : words[k];
    if (line && textWidth(trial, fs) > maxWidth) {
      lines.push(line);
      if (lines.length === maxLines - 1) {
        // Final line takes all remaining words (may need ellipsizing below).
        line = words.slice(k).join(" ");
        break;
      }
      line = words[k];
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  // Ellipsize ONLY if the last line genuinely overflows the width.
  const li = lines.length - 1;
  if (li >= 0 && textWidth(lines[li], fs) > maxWidth) {
    let t = lines[li];
    while (t.length > 1 && textWidth(t + "…", fs) > maxWidth) t = t.slice(0, -1);
    lines[li] = t.replace(/\s+\S*$/, "").trimEnd() + "…";
  }
  return lines;
}

function prettyDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function chip(x: number, y: number, text: string, fs: number, C: Palette): { svg: string; w: number } {
  const padX = 16;
  const w = textWidth(text, fs, true) + padX * 2;
  const h = fs + 20;
  const svg = `<rect x="${x}" y="${y}" width="${w.toFixed(1)}" height="${h}" rx="${h / 2}" fill="${C.chipBg}" stroke="${C.border}"/>
    <text x="${(x + w / 2).toFixed(1)}" y="${y + h / 2 + fs * 0.35}" font-family="DejaVu Sans" font-weight="bold" font-size="${fs}" fill="${C.text}" text-anchor="middle">${esc(text)}</text>`;
  return { svg, w };
}

export function buildSVG(word: Word, dateStr: string, theme = "light"): string {
  const C = THEMES[theme] ?? LIGHT;
  const pad = 48;
  const cardX = pad;
  const cardY = pad;
  const cardW = W - pad * 2;
  const cardH = H - pad * 2;
  const inX = cardX + 60; // inner content left
  const contentW = cardW - 120;

  const eyebrow = `WORD OF THE DAY  ·  ${prettyDate(dateStr).toUpperCase()}`;

  const chipFs = 26;
  const defFs = 32;
  const defLines = wrap(word.definition, defFs, contentW, 3);
  const tight = defLines.length >= 3; // 3-line definition → tighter scale + 1-line example

  // Word — shrink font if very long so it never clips.
  let wordFs = tight ? 78 : 88;
  while (textWidth(word.word, wordFs, true) > contentW && wordFs > 48) wordFs -= 4;

  // Vertical layout positions — no brand header; the card ends with the example.
  const eyebrowY = cardY + 92;
  const wordY = eyebrowY + (tight ? 80 : 90);
  const metaY = wordY + (tight ? 46 : 50);
  const chipY = metaY + (tight ? 30 : 34); // top of chip rects
  const defStartY = chipY + (tight ? 80 : 88);
  const defSpacing = tight ? defFs + 6 : defFs + 10;

  // Blend chips row: chip + "+" + chip + … drawn at the known chipY.
  let bx = inX;
  let chipsSvg = "";
  word.blend.forEach((part, i) => {
    if (i > 0) {
      chipsSvg += `<text x="${bx + 6}" y="${chipY + (chipFs + 20) / 2 + chipFs * 0.35}" font-family="DejaVu Sans" font-weight="bold" font-size="${chipFs}" fill="${C.dim}">+</text>`;
      bx += 34;
    }
    const c = chip(bx, chipY, part, chipFs, C);
    chipsSvg += c.svg;
    bx += c.w + 12;
  });

  const meta = `${word.pos}`;
  const metaSvg =
    `<text x="${inX}" y="${metaY}" font-family="DejaVu Sans" font-style="italic" font-size="30" fill="${C.dim}">${esc(meta)}</text>` +
    `<text x="${inX + textWidth(meta, 30) + 18}" y="${metaY}" font-family="DejaVu Sans Mono" font-size="26" fill="${C.muted}">${esc(word.ipa)}</text>`;

  const defSvg = defLines
    .map((ln, i) => `<text x="${inX}" y="${defStartY + i * defSpacing}" font-family="DejaVu Sans" font-size="${defFs}" fill="${C.text}">${esc(ln)}</text>`)
    .join("");

  // Usage example: italic quote with an accent bar, closing out the card.
  const exFs = 25;
  const exMax = tight ? 1 : 2;
  const exLines = wrap(word.example, exFs, contentW - 24, exMax);
  const exSpacing = exFs + 7;
  const exStartY = defStartY + (defLines.length - 1) * defSpacing + (tight ? 66 : 72);
  const exBarTop = exStartY - exFs * 0.78;
  const exBarH = (exLines.length - 1) * exSpacing + exFs;
  const exampleSvg =
    `<rect x="${inX}" y="${exBarTop.toFixed(1)}" width="4" height="${exBarH.toFixed(1)}" rx="2" fill="${C.accent}"/>` +
    exLines
      .map((ln, i) => {
        const txt = (i === 0 ? "“" : "") + ln + (i === exLines.length - 1 ? "”" : "");
        return `<text x="${inX + 20}" y="${exStartY + i * exSpacing}" font-family="DejaVu Sans" font-style="italic" font-size="${exFs}" fill="${C.muted}">${esc(txt)}</text>`;
      })
      .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="28" fill="${C.card}" stroke="${C.border}" stroke-width="2"/>
  <rect x="${cardX}" y="${cardY}" width="10" height="${cardH}" rx="5" fill="${C.accent}"/>

  <text x="${inX}" y="${eyebrowY}" font-family="DejaVu Sans" font-weight="bold" font-size="22" letter-spacing="3" fill="${C.accent}">${esc(eyebrow)}</text>
  <text x="${inX}" y="${wordY}" font-family="DejaVu Sans" font-weight="bold" font-size="${wordFs}" fill="${C.text}">${esc(word.word)}</text>
  ${metaSvg}
  ${chipsSvg}
  ${defSvg}
  ${exampleSvg}
</svg>`;
}

const pngCache = new Map<string, Buffer>();

export function buildPNG(word: Word, dateStr: string, theme = "light"): Buffer {
  const key = word.id + "@" + dateStr + "@" + theme;
  const cached = pngCache.get(key);
  if (cached) return cached;
  const svg = buildSVG(word, dateStr, theme);
  const resvg = new Resvg(svg, {
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: "DejaVu Sans" },
    fitTo: { mode: "width", value: W },
  });
  const png = Buffer.from(resvg.render().asPng());
  pngCache.set(key, png);
  return png;
}
