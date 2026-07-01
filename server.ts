/**
 * OnlyMIP WordQuiz — Word of the Day (WoD)
 * A tiny Bun server whose whole job is the per-day auto-share card.
 *
 * The word of the day is deterministic per calendar date. Each day's word has
 * its own Open Graph share card (PNG), and each day has its own shareable URL
 * (/day/YYYY-MM-DD) with matching OG/Twitter meta tags so links unfurl with the
 * day's card in Slack, Discord, iMessage, X, etc.
 */

import wordsData from "./data/words.json";
import { buildPNG, buildSVG } from "./card.ts";

type Word = {
  id: string;
  word: string;
  pos: string;
  ipa: string;
  blend: string[];
  definition: string;
  example: string;
  tags: string[];
};

const WORDS: Word[] = wordsData.words as Word[];
const ANCHOR = wordsData.anchorDate; // date that maps to WORDS[0]
// Bump when the card DESIGN changes so browsers fetch the new image instead of
// serving a stale cached one from the old (identical) URL.
const CARD_VERSION = "6";
const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = new URL("./public/", import.meta.url).pathname;
const INDEX_HTML = await Bun.file(PUBLIC_DIR + "index.html").text();

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

function dayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function dateFromDayNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

function todayStr(override?: string | null): string {
  if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  return new Date().toISOString().slice(0, 10);
}

/** Never reveal a future word: cap any date at today. */
function clampToToday(dateStr: string): string {
  const t = todayStr();
  return dateStr > t ? t : dateStr;
}

/** Deterministic word for a given date. */
function wordForDate(dateStr: string): Word {
  const delta = dayNumber(dateStr) - dayNumber(ANCHOR);
  const n = WORDS.length;
  return WORDS[((delta % n) + n) % n];
}

function origin(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Fill the OG/Twitter/title placeholders in index.html for a given day. */
function renderIndex(req: Request, dateStr: string): Response {
  const w = wordForDate(dateStr);
  const base = origin(req);
  const cardUrl = `${base}/api/card/${w.id}.png?date=${dateStr}&v=${CARD_VERSION}`;
  const pageUrl = `${base}/day/${dateStr}`;
  const title = `${w.word} — OnlyMIP Word of the Day`;
  const desc = `${w.word} (${w.pos}): ${w.definition}`;
  const html = INDEX_HTML
    .replaceAll("__TITLE__", escapeHtml(title))
    .replaceAll("__DESC__", escapeHtml(desc))
    .replaceAll("__IMAGE__", escapeHtml(cardUrl))
    .replaceAll("__URL__", escapeHtml(pageUrl))
    .replaceAll("__DATE__", dateStr);
  return new Response(html, { headers: { "content-type": MIME[".html"] } });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function serveStatic(pathname: string): Promise<Response> {
  const rel = pathname.replace(/^\/+/, "");
  if (rel.includes("..")) return new Response("Forbidden", { status: 403 });
  const file = Bun.file(PUBLIC_DIR + rel);
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  const ext = "." + (rel.split(".").pop() ?? "");
  return new Response(file, {
    headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
  });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;

    if (p === "/api/health") return json({ ok: true, words: WORDS.length });

    // Word-of-the-day metadata for the frontend (drives the page + share text).
    if (p === "/api/wotd") {
      const date = todayStr(url.searchParams.get("date"));
      const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
      const shifted = clampToToday(dateFromDayNumber(dayNumber(date) + offset));
      const w = wordForDate(shifted);
      return json({
        date: shifted,
        word: w,
        card: {
          png: `/api/card/${w.id}.png?date=${shifted}&v=${CARD_VERSION}`,
          pngDark: `/api/card/${w.id}.png?date=${shifted}&theme=dark&v=${CARD_VERSION}`,
          svg: `/api/card/${w.id}.svg?date=${shifted}&v=${CARD_VERSION}`,
        },
        shareUrl: `/day/${shifted}`,
      });
    }

    // Per-day share card. Keyed by word id so the image is stable & cacheable.
    const cardMatch = p.match(/^\/api\/card\/([a-z0-9-]+)\.(png|svg)$/);
    if (cardMatch) {
      const w = WORDS.find((x) => x.id === cardMatch[1]);
      if (!w) return new Response("Not found", { status: 404 });
      const date = todayStr(url.searchParams.get("date"));
      const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
      if (cardMatch[2] === "svg") {
        return new Response(buildSVG(w, date, theme), {
          headers: { "content-type": MIME[".svg"], "cache-control": "public, max-age=3600" },
        });
      }
      return new Response(buildPNG(w, date, theme), {
        headers: {
          "content-type": "image/png",
          "cache-control": "public, max-age=3600",
          "content-disposition": `inline; filename="onlymip-wod-${w.id}.png"`,
        },
      });
    }

    // Home = today; /day/YYYY-MM-DD = that day. Both get per-day OG meta.
    if (p === "/") return renderIndex(req, todayStr());
    const dayMatch = p.match(/^\/day\/(\d{4}-\d{2}-\d{2})$/);
    if (dayMatch) return renderIndex(req, clampToToday(dayMatch[1]));

    return serveStatic(p);
  },
});

console.log(`OnlyMIP WordQuiz — WoD (share cards) on http://localhost:${server.port} (${WORDS.length} words)`);
