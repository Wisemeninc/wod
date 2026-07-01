# OnlyMIP WordQuiz — Word of the Day (WoD)

A one-purpose web app: every day serves one gloriously made-up, aggressively
relatable word (portmanteau slang like **Fucktivated**, **Bullshitual**,
**FuckityDooDah**) as an **auto-generated share card**. Each day has its own
shareable URL that unfurls with that day's card in Slack, Discord, iMessage, X,
Facebook, and LinkedIn.

Built on the [OnlyMIP MusicQuiz](https://quiz.onlymip.com/) template
([Wisemeninc/musikquiz](https://github.com/Wisemeninc/musikquiz)) — same theme
engine (OF / UA / TPB / PH / MIPify / MIPTube), cards, and pill buttons.

## What it does

- **Per-day auto-share card.** A 1200×630 Open Graph PNG is generated for each
  word — brand, date, the word, part of speech + IPA, the two words it's blended
  from, and the definition.
- **Per-day shareable URLs.** `/day/YYYY-MM-DD` renders with matching
  `og:image` / `twitter:image` meta so pasted links unfurl to that day's card.
- **Date navigation.** Page between yesterday / today / tomorrow. The word of the
  day is deterministic per calendar date — tomorrow (2026-07-02) is **Fucktivated**.
- **Share / download.** Copy the day's link (uses the native share sheet on
  mobile) or download the card PNG.

## Run in a container

```bash
docker build -t onlymip-wordquiz-wod .
docker run -d -p 3000:3000 --name onlymip-wod onlymip-wordquiz-wod
# …or: docker compose up -d
```

Open <http://localhost:3000>. Try <http://localhost:3000/day/2026-07-02>.

## Run locally (Bun)

```bash
bun install
bun run start      # or: bun run dev  (hot reload)
```

## API

| Endpoint | Description |
|---|---|
| `GET /` | Today's page (per-day OG meta). |
| `GET /day/:date` | That day's page (`date` = `YYYY-MM-DD`). |
| `GET /api/card/:id.png?date=YYYY-MM-DD` | The share card PNG (1200×630). |
| `GET /api/card/:id.svg?date=YYYY-MM-DD` | Same card as SVG. |
| `GET /api/wotd?offset=0` | Day's word + card URLs. `offset` shifts by days (±). `date=` overrides "today". |
| `GET /api/health` | `{ ok, words }`. |

## Adding words

Edit [`data/words.json`](data/words.json):

```json
{
  "id": "kebab-slug",
  "word": "DisplayWord",
  "pos": "noun",
  "ipa": "/prəˌnʌn.siˈeɪ.ʃən/",
  "blend": ["source", "words"],
  "definition": "What it means (fits ~3 lines on the card).",
  "example": "A sentence using it.",
  "tags": ["vibe", "tags"]
}
```

`anchorDate` maps `words[0]` to a calendar date; the daily word marches down the
list from there.

## How the card is rendered

`card.ts` hand-draws the SVG (no template deps) and rasterizes it to PNG with
[`@resvg/resvg-js`](https://github.com/yisibl/resvg-js) using the bundled DejaVu
fonts in `assets/`. Fonts are loaded via `fontFiles` (paths), not `fontBuffers` —
the prebuilt resvg Linux binary silently drops text when given buffers, so paths
are the portable choice inside the container.

## Structure

```
server.ts            Bun server: per-day pages (OG meta) + card routes + WoD logic
card.ts              SVG → PNG share-card renderer
data/words.json      The dictionary (36 words) + anchor date
assets/*.ttf         DejaVu fonts bundled for the card renderer
public/index.html    Page shell with OG placeholders (filled server-side per day)
public/style.css     OnlyMIP theme system + card-display components
public/app.js        Date nav, card display, copy-link / download
public/theme.js      Theme switcher (OnlyMIP, re-pointed at WordQuiz brand)
public/logo.svg      OnlyMIP mark
Dockerfile           oven/bun image (installs resvg) + healthcheck
docker-compose.yml   One-command run
```
