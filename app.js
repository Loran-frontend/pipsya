"use strict";

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const NAME = { d: "Даня", s: "Соня" };
const STORE_KEY = "ds-pass";
const $ = (id) => document.getElementById(id);

let key = null;
let story = null;

/* ---------------------------------------------------------------- фон с сердечками */
(function sky() {
  const sky = document.querySelector(".sky");
  const em = ["💗", "💕", "🩷", "💖", "🤍", "✨"];
  for (let i = 0; i < 16; i++) {
    const s = document.createElement("span");
    s.textContent = em[i % em.length];
    s.style.left = Math.random() * 100 + "%";
    s.style.setProperty("--s", 12 + Math.random() * 16 + "px");
    s.style.setProperty("--t", 12 + Math.random() * 14 + "s");
    s.style.setProperty("--d", -Math.random() * 20 + "s");
    s.style.setProperty("--x", (Math.random() * 80 - 40) + "px");
    sky.appendChild(s);
  }
})();

/* ---------------------------------------------------------------- расшифровка */
// пароль сравнивается без регистра, пробелов, знаков и с «ё» = «е» (так же нормализует tools/build.py)
function normalize(s) { return s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/g, ""); }

function hex(s) { return new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16))); }

async function deriveKey(password) {
  const meta = await (await fetch("salt.json", { cache: "no-cache" })).json();
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: hex(meta.salt), iterations: meta.iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
}

async function decrypt(buf) {
  const b = new Uint8Array(buf);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, key, b.slice(12));
}

async function unlock(password) {
  key = await deriveKey(password);
  const buf = await (await fetch("data.enc", { cache: "no-cache" })).arrayBuffer();
  story = JSON.parse(new TextDecoder().decode(await decrypt(buf)));
}

function store(op, v) {
  try {
    if (op === "get") return localStorage.getItem(STORE_KEY);
    if (op === "set") localStorage.setItem(STORE_KEY, v);
    if (op === "del") localStorage.removeItem(STORE_KEY);
  } catch (e) { /* приватный режим */ }
  return null;
}

$("lockForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = normalize($("pw").value);
  const btn = $("unlockBtn");
  btn.disabled = true;
  btn.textContent = "Открываю…";
  $("lockErr").textContent = "";
  try {
    await unlock(pw);
    if ($("remember").checked) store("set", pw);
    start();
  } catch (err) {
    $("lockErr").textContent = location.protocol === "file:"
      ? "Открой сайт через сервер, а не как файл"
      : !(window.crypto && crypto.subtle)
        ? "Открой сайт по https://, иначе браузер не даст расшифровать"
        : "Не то 🙈 Попробуй ещё";
    const card = $("lockForm");
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
  } finally {
    btn.disabled = false;
    btn.textContent = "Открыть";
  }
});

$("logout").addEventListener("click", () => { store("del"); location.reload(); });

(async function auto() {
  const saved = store("get");
  if (!saved) return;
  try { await unlock(saved); start(); } catch (e) { store("del"); }
})();

/* ---------------------------------------------------------------- фото */
const photoCache = new Map();

function photoUrl(id) {
  if (!photoCache.has(id)) {
    const p = story.photos[id];
    photoCache.set(id, fetch("img/" + p.f + ".bin")
      .then((r) => r.arrayBuffer()).then(decrypt)
      .then((jpg) => URL.createObjectURL(new Blob([jpg], { type: "image/jpeg" }))));
  }
  return photoCache.get(id);
}

const lazy = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    lazy.unobserve(en.target);
    const img = en.target;
    photoUrl(img.dataset.id).then((u) => { img.src = u; img.onload = () => img.classList.add("ok"); });
  }
}, { rootMargin: "400px" });

function monthYear(d) { return MONTHS_NOM[+d.slice(5, 7) - 1] + " " + d.slice(0, 4); }

function polaroid(id, { caption, tag = "figure", tape = false, fixedRatio } = {}) {
  const p = story.photos[id];
  const el = document.createElement(tag);
  el.className = "polaroid" + (tape ? " tape" : "");
  const ph = document.createElement("span");
  ph.className = "ph";
  ph.style.aspectRatio = fixedRatio || p.w + " / " + p.h;
  const img = document.createElement("img");
  img.alt = "";
  img.dataset.id = id;
  ph.appendChild(img);
  el.appendChild(ph);
  const cap = document.createElement("figcaption");
  cap.textContent = caption === undefined ? monthYear(p.d) : caption;
  el.appendChild(cap);
  lazy.observe(img);
  return el;
}

/* ---------------------------------------------------------------- просмотр фото */
let lbList = [];
let lbIdx = 0;

function lbShow(i) {
  lbIdx = (i + lbList.length) % lbList.length;
  const id = lbList[lbIdx];
  $("lbImg").removeAttribute("src");
  photoUrl(id).then((u) => { if (lbList[lbIdx] === id) $("lbImg").src = u; });
  $("lbCap").textContent = monthYear(story.photos[id].d);
}
function lbOpen(list, i) {
  lbList = list;
  $("lightbox").hidden = false;
  document.body.style.overflow = "hidden";
  lbShow(i);
}
function lbClose() { $("lightbox").hidden = true; document.body.style.overflow = ""; }
$("lbClose").onclick = lbClose;
$("lbPrev").onclick = () => lbShow(lbIdx - 1);
$("lbNext").onclick = () => lbShow(lbIdx + 1);
$("lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") lbClose(); });
document.addEventListener("keydown", (e) => {
  if ($("lightbox").hidden) return;
  if (e.key === "Escape") lbClose();
  if (e.key === "ArrowLeft") lbShow(lbIdx - 1);
  if (e.key === "ArrowRight") lbShow(lbIdx + 1);
});
let touchX = null;
$("lightbox").addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
$("lightbox").addEventListener("touchend", (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) lbShow(lbIdx + (dx < 0 ? 1 : -1));
  touchX = null;
});

/* ---------------------------------------------------------------- отрисовка */
function fmtDate(d) { return +d.slice(8, 10) + " " + MONTHS[+d.slice(5, 7) - 1] + " " + d.slice(0, 4); }
function fmtTime(d) { return d.slice(11, 16); }
function num(n) { return n.toLocaleString("ru-RU"); }
function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
}

function bubble(m, withName) {
  const el = document.createElement("div");
  el.className = "msg " + m.w;
  if (withName) {
    const w = document.createElement("span");
    w.className = "who";
    w.textContent = NAME[m.w];
    el.appendChild(w);
  }
  el.appendChild(document.createTextNode(m.t));
  const t = document.createElement("time");
  t.textContent = withName ? fmtDate(m.d) + ", " + fmtTime(m.d) : fmtTime(m.d);
  el.appendChild(t);
  return el;
}

function chat(list, withName) {
  const box = document.createElement("div");
  box.className = "chat";
  if (!withName) {
    const lg = document.createElement("div");
    lg.className = "chat-legend";
    lg.innerHTML = "<span>Соня</span><span>Даня</span>";
    box.appendChild(lg);
  }
  list.forEach((m) => box.appendChild(bubble(m, withName)));
  return box;
}

function renderHero() {
  const ids = story.sets.hero.slice(0, 3);
  const box = $("heroPhotos");
  ids.forEach((id, i) => box.appendChild(polaroid(String(id), { caption: ["это мы", "♥", "и это мы"][i], tape: i === 1, fixedRatio: "4 / 5" })));

  const start = new Date(story.start);
  const counter = $("counter");
  const parts = ["дней", "часов", "минут", "секунд"].map(() => {
    const d = document.createElement("div");
    d.innerHTML = "<b></b><small></small>";
    counter.appendChild(d);
    return d;
  });
  const tick = () => {
    let s = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const v = [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60];
    const labels = [plural(v[0], "день", "дня", "дней"), plural(v[1], "час", "часа", "часов"),
      plural(v[2], "минута", "минуты", "минут"), plural(v[3], "секунда", "секунды", "секунд")];
    parts.forEach((p, i) => { p.firstChild.textContent = num(v[i]); p.lastChild.textContent = labels[i]; });
  };
  tick();
  setInterval(tick, 1000);
  $("since").textContent = "с " + fmtDate(story.start) + ", " + fmtTime(story.start) + " ночи";

  // маленькое напоминание про Сонин день рождения
  const now = new Date();
  const bd = new Date(now.getFullYear(), +story.bday.slice(0, 2) - 1, +story.bday.slice(3, 5));
  const days = Math.round((bd - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (days >= 0 && days <= 7) {
    $("bday").hidden = false;
    $("bday").textContent = days === 0
      ? "🎂 Сегодня у Сони день рождения! С днём рождения, солнышко 💗"
      : "🎂 Через " + days + " " + plural(days, "день", "дня", "дней") + " у Сони день рождения";
  }
}

function renderTimeline() {
  const ol = $("timeline");
  story.timeline.forEach((e) => {
    const li = document.createElement("li");
    li.className = "tl" + (e.date.slice(5) === story.bday ? " bday-item" : "");
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = '<div class="tl-date"></div><h3></h3>';
    card.querySelector(".tl-date").textContent = fmtDate(e.date);
    card.querySelector("h3").textContent = e.title;
    if (e.text) {
      const p = document.createElement("p");
      p.className = "tl-text";
      p.textContent = e.text;
      card.appendChild(p);
    }
    if (e.moment) card.appendChild(chat(story.moments[e.moment], false));
    if (e.quote) card.appendChild(chat(e.reply ? [e.quote, e.reply] : [e.quote], true));
    if (e.photos) {
      const ph = document.createElement("div");
      ph.className = "tl-photos";
      e.photos.forEach((id) => {
        const el = polaroid(String(id), { tag: "button" });
        el.onclick = () => lbOpen(e.photos.map(String), e.photos.indexOf(id));
        ph.appendChild(el);
      });
      card.appendChild(ph);
    }
    li.appendChild(card);
    ol.appendChild(li);
  });
  const io = new IntersectionObserver((en) => en.forEach((x) => {
    if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); }
  }), { threshold: 0.12 });
  ol.querySelectorAll(".tl").forEach((li) => io.observe(li));
}

function countUp(el, to, ms = 1400) {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = num(Math.round(to * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderStats() {
  const s = story.stats;
  const lh = Math.floor(s.longestCall / 3600), lm = Math.round(s.longestCall % 3600 / 60);
  const cards = [
    { em: "💬", n: s.total, p: "сообщений мы написали друг другу", wide: true, split: true },
    { em: "💗", n: s.love, p: "раз прозвучало «люблю»" },
    { em: "📞", n: s.callHours, p: "часов в звонках, это " + Math.round(s.callHours / 24) + " суток без перерыва" },
    { em: "⏱️", text: lh + " ч " + lm + " мин", p: "самый долгий звонок, " + fmtDate(s.longestCallDate) },
    { em: "🧸", n: s.stickers, p: "стикеров" },
    { em: "🎥", n: s.rounds, p: "кружочков" },
    { em: "📸", n: s.photos, p: "фоточек в чате" },
    { em: "🎙️", n: s.voices, p: "голосовых" },
    { em: "📅", n: s.days, p: "дней, когда мы переписывались" },
    { em: "🔥", n: s.topDay[1], p: "сообщений за самый болтливый день, " + fmtDate(s.topDay[0]) },
  ];
  const box = $("stats");
  const counters = [];
  cards.forEach((c) => {
    const el = document.createElement("div");
    el.className = "stat" + (c.wide ? " wide" : "");
    el.innerHTML = '<div class="em"></div><b></b><p></p>';
    el.querySelector(".em").textContent = c.em;
    el.querySelector("p").textContent = c.p;
    const b = el.querySelector("b");
    if (c.text) b.textContent = c.text; else { b.textContent = "0"; counters.push([b, c.n]); }
    if (c.split) {
      const pd = Math.round(s.d / s.total * 100);
      const sp = document.createElement("div");
      sp.innerHTML = '<div class="split"><i class="d"></i><i class="s"></i></div><div class="split-legend"><span></span><span></span></div>';
      sp.querySelector(".split-legend span:first-child").textContent = "Даня: " + num(s.d) + " (" + pd + "%)";
      sp.querySelector(".split-legend span:last-child").textContent = "Соня: " + num(s.s) + " (" + (100 - pd) + "%)";
      el.appendChild(sp);
      counters.push([sp, () => { sp.querySelector(".d").style.width = pd + "%"; sp.querySelector(".s").style.width = 100 - pd + "%"; }]);
    }
    box.appendChild(el);
  });
  const io = new IntersectionObserver((en) => {
    if (!en.some((x) => x.isIntersecting)) return;
    io.disconnect();
    counters.forEach(([el, v]) => typeof v === "function" ? v() : countUp(el, v));
  }, { threshold: 0.2 });
  io.observe(box);

  // график по месяцам
  const chart = $("chart");
  const max = Math.max(...story.months.map((m) => m[1]));
  const bars = story.months.map(([k, n]) => {
    const b = document.createElement("button");
    b.setAttribute("aria-label", monthYear(k) + ": " + num(n));
    b.onclick = () => {
      chart.querySelectorAll(".sel").forEach((x) => x.classList.remove("sel"));
      b.classList.add("sel");
      $("chartTip").textContent = monthYear(k) + ": " + num(n) + " " + plural(n, "сообщение", "сообщения", "сообщений") + (n === max ? " 🏆" : "");
    };
    chart.appendChild(b);
    return [b, n];
  });
  const axis = document.createElement("div");
  axis.className = "chart-axis";
  const first = story.months[0][0], last = story.months[story.months.length - 1][0];
  axis.innerHTML = "<span></span><span></span>";
  axis.firstChild.textContent = monthYear(first);
  axis.lastChild.textContent = monthYear(last);
  chart.after(axis);
  const io2 = new IntersectionObserver((en) => {
    if (!en[0].isIntersecting) return;
    io2.disconnect();
    bars.forEach(([b, n]) => { b.style.height = Math.max(3, n / max * 100) + "%"; });
  }, { threshold: 0.3 });
  io2.observe(chart);

  const nicks = $("nicks");
  s.nicks.forEach(([n, c]) => {
    const el = document.createElement("span");
    el.textContent = n;
    const sm = document.createElement("small");
    sm.textContent = "×" + num(c);
    el.appendChild(sm);
    nicks.appendChild(el);
  });
}

function renderGallery(boxId, ids) {
  const box = $(boxId);
  const list = ids.map(String);
  list.forEach((id, i) => {
    const el = polaroid(id, { tag: "button" });
    el.onclick = () => lbOpen(list, i);
    box.appendChild(el);
  });
}

function renderJar() {
  const jar = story.jar;
  let bag = [];
  $("jarBtn").addEventListener("click", () => {
    if (!bag.length) bag = jar.map((_, i) => i).sort(() => Math.random() - 0.5);
    const q = jar[bag.pop()];
    const note = $("note");
    $("noteText").textContent = q.t;
    $("noteBy").textContent = "— " + NAME[q.w] + ", " + fmtDate(q.d);
    note.classList.remove("pop");
    void note.offsetWidth;
    note.classList.add("pop");
    const b = $("jarBtn");
    b.classList.remove("shake-jar");
    void b.offsetWidth;
    b.classList.add("shake-jar");
  });
}

function navSpy() {
  const links = [...document.querySelectorAll(".nav a")];
  const io = new IntersectionObserver((en) => en.forEach((x) => {
    if (x.isIntersecting) links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + x.target.id));
  }), { rootMargin: "-45% 0px -50% 0px" });
  document.querySelectorAll(".section").forEach((s) => io.observe(s));
}

let started = false;
function start() {
  if (started) return;
  started = true;
  $("lock").hidden = true;
  $("app").hidden = false;
  $("year").textContent = "2023 — навсегда";
  renderHero();
  renderTimeline();
  renderStats();
  renderGallery("funGallery", story.sets.fun);
  renderGallery("prettyGallery", story.sets.pretty);
  renderJar();
  navSpy();
  window.scrollTo(0, 0);
}
