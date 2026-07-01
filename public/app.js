/* OnlyMIP WordQuiz — Word of the Day (share-card app).
   Shows the day's auto-generated share card, lets you page between days, and
   copy the day's shareable link or download the card image. No framework. */

const $ = (id) => document.getElementById(id);

// Offset in days from today. The server rendered a specific day (data-initial-date);
// derive the starting offset from it so deep links to /day/<date> land correctly.
const initialDate = document.body.dataset.initialDate;
const todayNum = Math.floor(Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z") / 86400000);
const initNum = /^\d{4}-\d{2}-\d{2}$/.test(initialDate)
  ? Math.floor(Date.parse(initialDate + "T00:00:00Z") / 86400000)
  : todayNum;
// Never surface a future word — clamp forward navigation to today.
let offset = Math.min(0, initNum - todayNum);

let current = null;

const els = {
  img: $("card-img"),
  dateLabel: $("date-label"),
  copyBtn: $("copy-btn"),
  downloadBtn: $("download-btn"),
  status: $("share-status"),
};

function humanDate(iso, off) {
  const label = off === 0 ? "Today" : off === 1 ? "Tomorrow" : off === -1 ? "Yesterday" : null;
  const d = new Date(iso + "T00:00:00Z");
  const pretty = d.toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
  return label ? `${label} · ${pretty}` : pretty;
}

// Follow the OS light/dark setting for the on-page card (and download).
const darkMq = window.matchMedia("(prefers-color-scheme: dark)");
function applyScheme() {
  if (!current) return;
  const url = darkMq.matches ? current.card.pngDark : current.card.png;
  els.img.src = url;
  els.downloadBtn.href = url;
}
darkMq.addEventListener("change", applyScheme);

function flash(msg) {
  els.status.textContent = msg;
  els.status.classList.add("show");
  clearTimeout(flash._t);
  flash._t = setTimeout(() => els.status.classList.remove("show"), 2200);
}

async function load() {
  const res = await fetch(`/api/wotd?offset=${offset}`);
  current = await res.json();

  els.dateLabel.textContent = humanDate(current.date, offset);
  els.img.alt = `${current.word.word} — ${current.word.definition}`;
  els.downloadBtn.setAttribute("download", `onlymip-wod-${current.word.id}.png`);
  applyScheme();

  // Keep the address bar on the day's canonical URL so the link is shareable.
  history.replaceState(null, "", current.shareUrl);
  document.title = `${current.word.word} — OnlyMIP Word of the Day`;
}

function shareLink() {
  return location.origin + current.shareUrl;
}

async function copyLink() {
  const link = shareLink();
  try {
    if (navigator.share) {
      await navigator.share({ title: `${current.word.word} — OnlyMIP Word of the Day`, url: link });
      return;
    }
    await navigator.clipboard.writeText(link);
    flash("Share link copied ✓");
  } catch {
    flash(link);
  }
}

$("prev-day").addEventListener("click", () => { offset -= 1; load(); });
els.copyBtn.addEventListener("click", copyLink);

load();
