"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const yen = (v) => (v === null || v === undefined) ? "—" : "¥" + Math.round(Math.abs(v)).toLocaleString("ja-JP");
  const signedYen = (v) => (v === null || v === undefined) ? "—" : (v < 0 ? "−" : v > 0 ? "+" : "") + yen(v);
  const money = (html, cls = "") => `<span class="money ${cls}">${html}</span>`;
  const pct = (v, digits = 1) => v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(digits) + "%";
  const compact = (v) => {
    const a = Math.abs(v);
    if (a >= 1e8) return (v / 1e8).toFixed(1).replace(/\.0$/, "") + "億";
    if (a >= 1e4) return Math.round(v / 1e4).toLocaleString("ja-JP") + "万";
    return Math.round(v).toLocaleString("ja-JP");
  };
  const toDate = (iso) => new Date(iso.length <= 10 ? iso + "T00:00:00+09:00" : iso);
  const md = (iso) => { if (!iso) return "—"; const d = toDate(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const hm = (iso) => { const d = toDate(iso); return `${md(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const daysAgo = (iso, today) => Math.round((toDate(today) - toDate(iso.slice(0, 10))) / 864e5);
  const ago = (iso, today) => { if (!iso) return "—"; const n = daysAgo(iso, today); return n <= 0 ? "今日" : n === 1 ? "昨日" : `${n}日前`; };
  const hoursAgo = (h) => h == null ? "—" : h < 1 ? "1時間以内" : h < 48 ? `${Math.round(h)}時間前` : `${Math.round(h / 24)}日前`;
  const sectionError = (sec, what) => `<div class="section-error"><b>${esc(what)}を表示できません</b>${esc(sec.error || "")}</div>`;
  const updown = (v) => v == null ? "" : v > 0 ? "pos" : v < 0 ? "neg" : "";

  // ---------- tooltip ----------
  const tip = $("tip");
  function showTip(evt, html) {
    tip.innerHTML = html; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = evt.clientX + 14, y = evt.clientY + 14;
    if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - 14;
    tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
  }
  const hideTip = () => { tip.hidden = true; };
  const masked = () => document.body.classList.contains("masked");
  const tipVal = (v) => masked() ? "•••" : v;

  // ---------- sparkline ----------
  function sparkline(values, color) {
    // v21（外部レビューLOW-01）: 値が不明（null）の区間はつながず、線を途切れさせる（前後を直線で結ばない）
    const ok = (v) => v !== null && v !== undefined && Number.isFinite(v);
    const vals = values.filter(ok);
    if (vals.length < 2 || values.length < 2) return `<svg viewBox="0 0 100 40"></svg>`;
    const w = 100, h = 40, min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
    const xy = (v, i) => [i / (values.length - 1) * w, h - 4 - (v - min) / span * (h - 10)];
    const segs = [];
    let cur = [];
    values.forEach((v, i) => {
      if (ok(v)) cur.push(xy(v, i));
      else if (cur.length) { segs.push(cur); cur = []; }
    });
    if (cur.length) segs.push(cur);
    const path = (pts) => pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(2) + " " + p[1].toFixed(2)).join(" ");
    const id = "sg" + Math.random().toString(36).slice(2, 8);
    const area = segs.filter((g) => g.length > 1).map((g) =>
      `<path d="${path(g)} L${g[g.length - 1][0].toFixed(2)} ${h} L${g[0][0].toFixed(2)} ${h} Z" fill="url(#${id})"/>`).join("");
    const lines = segs.map((g) => g.length > 1
      ? `<path d="${path(g)}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>`
      : `<circle cx="${g[0][0].toFixed(2)}" cy="${g[0][1].toFixed(2)}" r="1.2" fill="${color}"/>`).join("");
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      ${area}${lines}</svg>`;
  }
  function deltaChip(cur, prev, goodWhenUp = true) {
    if (cur === null || cur === undefined || !prev) return `<span class="chip flat">—</span>`;
    const p = (cur - prev) / Math.abs(prev) * 100;
    if (!isFinite(p)) return "";
    const flat = Math.abs(p) < 0.05, good = (p >= 0) === goodWhenUp;
    return `<span class="chip ${flat ? "flat" : good ? "up" : "down"}">${flat ? "→" : p >= 0 ? "▲" : "▼"} ${Math.abs(p).toFixed(1)}%</span>`;
  }

  // ---------- KPI ----------
  function renderKpis(d) {
    const fin = d.finance;
    const ids = ["kpi-balance", "kpi-income", "kpi-expense", "kpi-invest"];
    if (!fin.ok) {
      ids.forEach((id, i) => { $(id).innerHTML = i === 0 ? sectionError(fin, "家計") : ""; });
      return;
    }
    const f = fin.data, s = f.summary || {};
    const banks = f.banks || { items: [] }, proj = s.projected_balance || {};
    const series = (f.balance_series || []).map((p) => p.amount_jpy);
    const cut = new Date(toDate(d.today) - 30 * 864e5).toISOString().slice(0, 10);
    const before = (f.balance_series || []).filter((p) => p.date <= cut);
    const prev30 = before.length ? before[before.length - 1].amount_jpy : null;
    const total = banks.total_jpy, nBanks = banks.items.length;
    const breakdown = banks.items.map((b) => `${b.label} ${b.amount_jpy == null ? "要確認" : yen(b.amount_jpy)}`).join(" / ");
    $("kpi-balance").innerHTML = `
      <div class="label"><span title="${esc(breakdown)}">預金残高${nBanks > 1 ? `（${nBanks}口座）` : ""}${checkMark(f, "balance")}</span><span class="asof">${banks.oldest_as_of ? md(banks.oldest_as_of) + "時点" : ""}</span></div>
      <div class="value">${total == null ? `<span class="stale-tag">${nBanks ? "要確認" : "データなし"}</span>` : money(yen(total))}</div>
      <div class="delta">${deltaChip(total, prev30)}<span>30日前比${banks.complete ? "" : "（一部要確認）"}</span></div>
      <div class="delta">${(() => {
        const acc = ((f.charge_check || {}).accounts || [])[0];
        if (!acc) return "";
        if (acc.after_jpy == null) return `<span>次の引き落とし後（${esc(acc.label)}）判定できません</span>`;
        return `<span>次の引き落とし後（${esc(acc.label)}） ${money(yen(acc.after_jpy), acc.after_jpy < 0 ? "neg" : "")}</span>`;
      })()}</div>
      <div class="spark">${sparkline(series, "#8f84ff")}</div>`;

    const months = f.months || [], cur = months[months.length - 1] || {}, last = months[months.length - 2] || {};
    const pace = f.pace || { this_month: [], last_month: [] };
    const dayIdx = pace.this_month.length - 1;
    const lastSameDay = pace.last_month.length ? pace.last_month[Math.min(dayIdx, pace.last_month.length - 1)] : null;
    $("kpi-income").innerHTML = `
      <div class="label"><span>今月の収入${checkMark(f, "spending")}</span><span class="asof">${esc(cur.month || "")}</span></div>
      <div class="value">${money(yen(cur.income_jpy || 0))}</div>
      <div class="delta"><span>先月 ${money(yen(last.income_jpy || 0))}</span></div>
      <div class="spark">${sparkline(months.map((m) => m.income_jpy), "#3987e5")}</div>`;
    // カード明細は請求が確定してから取り込まれるので、今月のカード分がまだ無いときは、
    // カード明細が入っているいちばん新しい月を見せる（今月を見せると「0円」などに見えてしまう）
    const sp = f.spending || null;
    const lagging = sp && sp.focus !== sp.current;
    const fm = lagging ? sp.months.find((m) => m.month === sp.focus) : null;
    const fmPrev = lagging ? sp.months[sp.months.indexOf(fm) - 1] : null;
    const throughNote = sp && sp.card_through ? `<div class="delta"><span title="PFIは楽天カードの請求が確定した明細だけを取り込みます">カードは${md(sp.card_through)}利用分まで</span></div>` : "";
    $("kpi-expense").innerHTML = lagging && fm ? `
      <div class="label"><span>${Number(fm.month.slice(5))}月の支出${checkMark(f, "spending")}</span><span class="asof">${esc(fm.month)}</span></div>
      <div class="value">${money(yen(fm.total_jpy))}</div>
      <div class="delta">${fmPrev ? deltaChip(fm.total_jpy, fmPrev.total_jpy, false) + "<span>前の月比</span>" : ""}</div>
      ${throughNote}
      <div class="spark">${sparkline(sp.months.filter((m) => m.card !== "none").map((m) => m.total_jpy), "#d95926")}</div>` : `
      <div class="label"><span>今月の支出${checkMark(f, "spending")}</span><span class="asof">${esc(cur.month || "")}</span></div>
      <div class="value">${money(yen(cur.expense_jpy || 0))}</div>
      <div class="delta">${deltaChip(cur.expense_jpy, lastSameDay, false)}<span>先月の同じ日まで比</span></div>
      ${cur.pending_expense_jpy ? `<div class="delta"><span title="請求がまだ確定していない楽天カードの利用（PFIが確定済みの請求書の末尾から控えたもの）">うち速報（未確定）${money(yen(cur.pending_expense_jpy))}</span></div>` : ""}
      ${sp && sp.months.length && sp.months[sp.months.length - 1].card === "partial" ? throughNote : ""}
      ${(f.unconfirmed_bank_flows || {}).count ? `<div class="delta"><span title="銀行の入出金のうち種類が決まっていないもの（家計タブの「家計の確認」）">銀行の未分類 ${Number(f.unconfirmed_bank_flows.count)}件は含まず</span></div>` : ""}
      <div class="spark">${sparkline(months.map((m) => m.expense_jpy), "#d95926")}</div>`;

    const pf = f.portfolio || {}, lt = pf.latest || {}, pv = pf.previous || {};
    const up = lt.unrealized_profit_jpy;
    $("kpi-invest").innerHTML = `
      <div class="label"><span title="楽天証券の保有明細から">投資資産${checkMark(f, "assets")}</span><span class="asof">${lt.date ? md(lt.date) + "時点" : ""}</span></div>
      <div class="value">${lt.total_assets_jpy == null ? `<span class="stale-tag">${lt.date ? "要確認" : "データなし"}</span>` : money(yen(lt.total_assets_jpy))}</div>
      <div class="delta">${deltaChip(lt.total_assets_jpy, pv.total_assets_jpy)}<span>前回比</span></div>
      <div class="delta">${up != null ? `<span>含み損益 ${money(signedYen(up), up >= 0 ? "pos" : "neg")}</span>` : ""}</div>
      ${(() => {
        const sd = d.stocks && d.stocks.ok ? d.stocks.data.dividend_summary : null;
        if (!sd || !sd.all || sd.all.yield_pct == null) return "";
        const ok = sd.all.yield_pct >= sd.target_pct;
        const ex = sd.ex_yutai && sd.ex_yutai.yield_pct != null ? `・優待株を除く ${sd.ex_yutai.yield_pct.toFixed(2)}%` : "";
        return `<div class="delta"><span title="保有している個別株の、予想年間配当の合計÷評価額の合計（投資信託などは含みません）">配当利回り <b class="${ok ? "pos" : "low"}">${sd.all.yield_pct.toFixed(2)}%</b>（目標${sd.target_pct}%）${ex}</span></div>`;
      })()}
      <div class="spark">${sparkline((pf.history || []).map((h) => h.total_assets_jpy), "#199e70")}</div>`;
  }

  function niceTicks(max, n) {
    const raw = max / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag, out = [];
    for (let v = 0; v <= max; v += step) out.push(v);
    return out;
  }
  const boxSize = (el, minW, minH, defH) => [Math.max(minW, el.clientWidth || 600), Math.max(minH, el.clientHeight || defH)];

  // ---------- pace chart ----------
  function renderPace(d) {
    const el = $("pace-chart");
    if (!d.finance.ok) { el.innerHTML = sectionError(d.finance, "家計"); $("pace-head").innerHTML = ""; return; }
    const p = d.finance.data.pace, a = p.this_month, b = p.last_month;
    const cur = a[a.length - 1] || 0, cmp = b.length ? b[Math.min(a.length - 1, b.length - 1)] : null;
    const diff = cmp != null ? cur - cmp : null;
    $("pace-head").innerHTML = `<span class="big">${money(yen(cur))}</span>
      <span class="cmp">${diff == null ? "" : `先月の同じ日（${a.length}日目）より ${money((diff > 0 ? "+" : diff < 0 ? "−" : "±") + yen(diff), diff > 0 ? "neg" : "pos")} ${diff > 0 ? "多い" : "少ない"}`}</span>
      <span class="cmp">先月の合計 ${money(yen(b[b.length - 1] || 0))}</span>
      ${(() => { const sp = d.finance.data.spending; return sp && sp.focus !== sp.current
        ? `<span class="cmp note">今月のカード利用はまだ入っていません（${sp.card_through ? md(sp.card_through) + "利用分まで。" : ""}来月の請求が確定して明細を取り込むと反映されます）</span>`
        : sp && sp.months.length && sp.months[sp.months.length - 1].pending_jpy
          ? `<span class="cmp">カードの未確定の速報 ${money(yen(sp.months[sp.months.length - 1].pending_jpy))} を含みます（${sp.pending_through ? md(sp.pending_through) + "利用分まで" : ""}）</span>` : ""; })()}`;
    $("pace-legend").innerHTML = `<span><i style="background:var(--s7)"></i>今月</span><span><i class="dash"></i>先月</span>`;

    el.innerHTML = "";
    const [W, H] = boxSize(el, 300, 90, 250), L = 46, R = 12, T = 8, B = 24;
    const days = 31, max = Math.max(1, ...a, ...b) * 1.08;
    const x = (i) => L + i / (days - 1) * (W - L - R), y = (v) => T + (1 - v / max) * (H - T - B);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="今月と先月の累積支出">`;
    s += `<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9085e9" stop-opacity=".32"/><stop offset="1" stop-color="#9085e9" stop-opacity="0"/></linearGradient></defs>`;
    niceTicks(max, H > 200 ? 4 : 3).forEach((t) => { s += `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${compact(t)}</text>`; });
    [1, 5, 10, 15, 20, 25, 30].forEach((dd) => { s += `<text x="${x(dd - 1)}" y="${H - 5}" text-anchor="middle">${dd}日</text>`; });
    const path = (arr) => arr.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ");
    if (b.length > 1) s += `<path d="${path(b)}" fill="none" stroke="#7d7b8a" stroke-width="2" stroke-dasharray="5 5"/>`;
    if (a.length > 1) {
      s += `<path d="${path(a)} L${x(a.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z" fill="url(#pg)"/>`;
      s += `<path d="${path(a)}" fill="none" stroke="#9085e9" stroke-width="2.2" stroke-linejoin="round"/>`;
    }
    if (a.length) s += `<circle cx="${x(a.length - 1)}" cy="${y(cur)}" r="5" fill="#9085e9" stroke="#121218" stroke-width="2"/>`;
    s += `<line class="crosshair" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>`;
    s += `<rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" class="hit"/></svg>`;
    el.innerHTML = s;
    const svg = el.querySelector("svg"), cross = svg.querySelector(".crosshair"), hit = svg.querySelector(".hit");
    hit.addEventListener("pointermove", (evt) => {
      const r = svg.getBoundingClientRect(), px = (evt.clientX - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(days - 1, Math.round((px - L) / (W - L - R) * (days - 1))));
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      const rows = [];
      if (i < a.length) rows.push(`<div class="tt-row"><span><i style="background:#9085e9"></i>今月</span><span>${tipVal(yen(a[i]))}</span></div>`);
      if (i < b.length) rows.push(`<div class="tt-row"><span><i style="background:#7d7b8a"></i>先月</span><span>${tipVal(yen(b[i]))}</span></div>`);
      showTip(evt, `<div class="tt-title">${i + 1}日目までの累計</div>${rows.join("") || "<div>データなし</div>"}`);
    });
    hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); hideTip(); });
  }

  // ---------- monthly bars ----------
  function renderMonths(d) {
    const el = $("months-chart");
    if (!d.finance.ok) { el.innerHTML = ""; $("months-legend").innerHTML = ""; return; }
    const ms = d.finance.data.months;
    $("months-legend").innerHTML = `<span><i style="background:var(--s1)"></i>収入</span><span><i style="background:var(--s2)"></i>支出</span>`;
    el.innerHTML = "";
    const [W, H] = boxSize(el, 260, 90, 220), L = 40, R = 6, T = 8, B = 22;
    const max = Math.max(1, ...ms.map((m) => Math.max(m.income_jpy, m.expense_jpy))) * 1.1;
    const y = (v) => T + (1 - v / max) * (H - T - B);
    const band = (W - L - R) / ms.length, bw = Math.min(16, band / 3.2);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="月別の収入と支出">`;
    niceTicks(max, 3).forEach((t) => { s += `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${compact(t)}</text>`; });
    const bar = (cx, v, color) => {
      const top = y(v), h = Math.max(0, y(0) - top), r = Math.min(4, h);
      return `<path d="M${cx - bw / 2} ${y(0)} V${top + r} Q${cx - bw / 2} ${top} ${cx - bw / 2 + r} ${top} H${cx + bw / 2 - r} Q${cx + bw / 2} ${top} ${cx + bw / 2} ${top + r} V${y(0)} Z" fill="${color}"/>`;
    };
    ms.forEach((m, i) => {
      const cx = L + band * (i + .5);
      s += bar(cx - bw / 2 - 1, m.income_jpy, "#3987e5") + bar(cx + bw / 2 + 1, m.expense_jpy, "#d95926");
      s += `<text x="${cx}" y="${H - 5}" text-anchor="middle">${Number(m.month.slice(5))}月</text>`;
      s += `<rect x="${cx - band / 2}" y="${T}" width="${band}" height="${H - T - B}" fill="transparent" data-i="${i}" class="mhit"/>`;
    });
    el.innerHTML = s + "</svg>";
    el.querySelectorAll(".mhit").forEach((r) => {
      r.addEventListener("pointermove", (evt) => {
        const m = ms[+r.dataset.i];
        showTip(evt, `<div class="tt-title">${esc(m.month)}</div>
          <div class="tt-row"><span><i style="background:#3987e5"></i>収入</span><span>${tipVal(yen(m.income_jpy))}</span></div>
          <div class="tt-row"><span><i style="background:#d95926"></i>支出</span><span>${tipVal(yen(m.expense_jpy))}</span></div>
          <div class="tt-row"><span>収支</span><span>${tipVal(signedYen(m.net_jpy))}</span></div>
          ${m.investment_jpy ? `<div class="tt-row"><span>投資積立（別枠）</span><span>${tipVal(yen(m.investment_jpy))}</span></div>` : ""}`);
      });
      r.addEventListener("pointerleave", hideTip);
    });
  }

  // ---------- donut ----------
  // 色はカテゴリに固定で割り当てる（金額の順位で色が変わらないように）
  // 円グラフの色：金額の大きい順に系列色を割り当て、8つ目以降は「その他」にまとめる（未分類は灰色）
  const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"];
  let donutMonth = null;
  function renderDonut(d) {
    const el = $("donut"), list = $("cat-list"), nav = $("donut-nav"), note = $("donut-note");
    if (!d.finance.ok) { el.innerHTML = sectionError(d.finance, "家計"); list.innerHTML = ""; nav.innerHTML = ""; note.textContent = ""; return; }
    const sp = d.finance.data.spending;
    const months = sp ? sp.months : [{ month: d.today.slice(0, 7), categories: d.finance.data.categories, card: "complete" }];
    if (!donutMonth || !months.some((m) => m.month === donutMonth)) donutMonth = sp ? sp.focus : months[months.length - 1].month;
    const idx = months.findIndex((m) => m.month === donutMonth), mo = months[idx];
    const mLabel = (ym) => `${Number(ym.slice(5))}月`;
    nav.innerHTML = `<button type="button" class="mini-btn" data-step="-1" ${idx <= 0 ? "disabled" : ""} aria-label="前の月">‹</button>
      <span class="mini-label">${mLabel(mo.month)}${mo.month === (sp && sp.current) ? "（今月）" : ""}</span>
      <button type="button" class="mini-btn" data-step="1" ${idx >= months.length - 1 ? "disabled" : ""} aria-label="次の月">›</button>`;
    nav.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      const j = idx + Number(b.dataset.step);
      if (months[j]) { donutMonth = months[j].month; renderDonut(d); }
    }));
    note.textContent = [
      mo.card === "none" ? "この月のカード利用はまだ入っていません（翌月の請求が確定して明細を取り込むと反映されます）"
        : mo.card === "partial" && sp.card_through ? `カードは${md(sp.card_through)}利用分まで` : "",
      mo.pending_jpy ? `うち未確定の速報 ${yen(mo.pending_jpy)}（請求の確定後に確定値へ置き換わります）` : "",
    ].filter(Boolean).join("・");
    const cats = mo.categories;
    const total = cats.reduce((a, c) => a + c.amount_jpy, 0);
    const ranked = cats.filter((c) => c.category !== "uncategorized");
    const top = ranked.slice(0, SERIES.length), rest = ranked.slice(SERIES.length);
    const segs = top.map((c, i) => ({ ...c, color: SERIES[i] }));
    const unc = cats.find((c) => c.category === "uncategorized");
    if (rest.length) {
      const amt = rest.reduce((a, c) => a + c.amount_jpy, 0);
      segs.push({ label: "その他", amount_jpy: amt, count: rest.reduce((a, c) => a + c.count, 0), share: total ? amt / total : 0,
        color: "#8a8796", detail: rest.map((c) => c.label).join("・") });
    }
    if (unc) segs.push({ ...unc, label: "未分類", color: "#5f5d6b", detail: "PFIの add_category_keyword.py で分類すると内訳に入ります" });
    const R = 80, C = 2 * Math.PI * R, gap = segs.length > 1 ? 3 : 0;
    let off = 0, s = `<svg viewBox="0 0 200 200" role="img" aria-label="支出の内訳"><g transform="rotate(-90 100 100)">`;
    s += `<circle cx="100" cy="100" r="${R}" fill="none" stroke="#1c1c24" stroke-width="18"/>`;
    segs.forEach((g, i) => {
      const len = total ? g.amount_jpy / total * C : 0;
      s += `<circle class="seg" data-i="${i}" cx="100" cy="100" r="${R}" fill="none" stroke="${g.color}" stroke-width="18"
        stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-off}"/>`;
      off += len;
    });
    s += `</g><g class="donut-center"><text class="t1 money" x="100" y="102" text-anchor="middle">${total ? "¥" + compact(total) : "—"}</text>
      <text class="t2" x="100" y="122" text-anchor="middle">${mLabel(mo.month)}の支出</text></g></svg>`;
    el.innerHTML = total ? s : `<div class="empty">${mLabel(mo.month)}の支出データはまだありません</div>`;
    list.innerHTML = segs.map((g) => `<li title="${esc(g.detail || "")}"><span class="sw" style="background:${g.color}"></span>
      <span>${esc(g.label)} <small style="color:var(--muted)">${g.count}件${g.pending_jpy ? "・速報含む" : ""}</small></span><span class="amt money">${yen(g.amount_jpy)}</span><span class="pct">${Math.round(g.share * 100)}%</span></li>`).join("");
    el.querySelectorAll(".seg").forEach((c) => {
      c.addEventListener("pointermove", (evt) => { const g = segs[+c.dataset.i];
        showTip(evt, `<div class="tt-title">${esc(g.label)}${g.detail ? `（${esc(g.detail)}）` : ""}</div><div class="tt-row"><span>${g.count}件</span><span>${tipVal(yen(g.amount_jpy))}</span></div>`); });
      c.addEventListener("pointerleave", hideTip);
    });
  }

  // ---------- 口座と資産 ----------
  function renderBanks(d) {
    const el = $("banks");
    if (!d.finance.ok) { el.innerHTML = sectionError(d.finance, "家計"); return; }
    const f = d.finance.data, banks = f.banks || { items: [] }, s = f.summary || {};
    const charge = s.next_card_charge, proj = s.projected_balance || {}, lt = (f.portfolio || {}).latest || {};
    const status = { ok: "", needs_review: "重複の可能性があり要確認", ambiguous_across_files: "複数ファイルで食い違い・要確認",
      chain_unresolved: "残高のつながりを確認できず要確認", balance_needs_review: "要確認" };
    let h = banks.items.map((b) => `<div class="acct"><span class="nm">${esc(b.label)}</span>
      <span class="am">${b.amount_jpy == null ? `<span class="stale-tag">要確認</span>` : money(yen(b.amount_jpy))}</span>
      <span class="meta">${b.as_of ? md(b.as_of) + "時点" : ""}${status[b.status] ? "・" + status[b.status] : ""}</span></div>`).join("");
    if (!banks.items.length) h = `<div class="empty">銀行の明細がまだありません</div>`;
    if (banks.items.length > 1) h += `<div class="acct total sum"><span class="nm">預金の合計</span><span class="am">${banks.total_jpy == null ? "—" : money(yen(banks.total_jpy))}</span></div>`;
    if (charge) h += `<div class="acct"><span class="nm">次のカード引き落とし</span><span class="am">${charge.amount_jpy == null ? `<span class="stale-tag">金額未確定</span>` : money(yen(charge.amount_jpy))}</span>
      <span class="meta">${charge.expected_payment_date ? md(charge.expected_payment_date) + "予定" : ""}・${esc(charge.billing_month || "")}請求分</span></div>`;
    const cc = f.charge_check;
    const CC = { ok: ["足りる見込み", ""], short: ["不足の見込み", "neg"], unknown: ["判定できません", "neg"] };
    if (cc && cc.accounts) h += cc.accounts.map((a) => `<div class="acct"><span class="nm">${esc(a.label)} 引き落とし後</span>
      <span class="am">${a.after_jpy == null ? `<span class="stale-tag">—</span>` : money(yen(a.after_jpy), a.after_jpy < 0 ? "neg" : "")}</span>
      <span class="meta"><span class="${CC[a.status] ? CC[a.status][1] : ""}">${esc(CC[a.status] ? CC[a.status][0] : a.status)}</span>${a.reason ? "・" + esc(a.reason) : ""}${a.basis ? "・" + esc(a.basis) : ""}</span></div>`).join("");
    else if (proj.including_estimates_jpy != null) h += `<div class="acct"><span class="nm">三菱UFJ 引き落とし後の予測</span><span class="am">${money(yen(proj.including_estimates_jpy), proj.including_estimates_jpy < 0 ? "neg" : "")}</span></div>`;
    if (lt.total_assets_jpy != null) h += `<div class="acct"><span class="nm">投資資産（楽天証券）</span><span class="am">${money(yen(lt.total_assets_jpy))}</span><span class="meta">${md(lt.date)}時点</span></div>`;
    el.innerHTML = h;
    $("banks-sub").textContent = banks.complete ? "" : "一部の口座が要確認";
  }

  // ---------- 投資余力（PFIが計算。給料は入金されるまで数えない） ----------
  let capExtra = 0;
  function renderCapacity(d) {
    const el = $("cap");
    if (!d.finance.ok) { el.innerHTML = sectionError(d.finance, "家計"); $("cap-sub").textContent = ""; return; }
    const r = d.finance.data.investable || { status: "unsupported", reason: "PFIを更新すると表示されます" };
    $("cap-sub").textContent = r.next_payday ? `次の給料日 ${md(r.next_payday)}（あと${Number(r.days_to_payday)}日）` : "";
    if (r.status !== "ok") {
      el.innerHTML = `<p class="cap-off">${esc(r.reason || "計算できませんでした")}</p>`
        + (r.check_warnings || []).map((w) => `<p class="cap-warn">⚠ ${esc(w.source)} ${esc(w.title)}（${esc(w.action)}）</p>`).join("")
        + (r.cash ? `<p class="cap-note">三菱UFJの残高 ${money(yen(r.cash.amount_jpy))}（${md(r.cash.as_of)}時点）</p>` : "");
      return;
    }
    const targets = r.targets || [];
    const draw = () => {
      const avail = r.available_before_reserve_jpy - capExtra;
      const t0 = targets[0], inv0 = t0 ? Math.max(0, avail - t0.target_jpy) : Math.max(0, avail);
      const alt = targets.slice(1).map((t) => {
        const inv = Math.max(0, avail - t.target_jpy);
        const short = Math.max(0, t.target_jpy - avail);
        return `防衛資金${compact(t.target_jpy)}円を残すなら ${money(yen(inv))}`
          + (short ? `（あと${money(yen(short))}${t.months_to_reach && !capExtra ? `・今のペースで約${Number(t.months_to_reach)}か月` : ""}）` : "");
      }).join("<br>");
      const short0 = t0 ? Math.max(0, t0.target_jpy - avail) : 0;
      $("cap-main").innerHTML = `<div class="cap-big"><span class="v ${inv0 ? "" : "zero"}">${money(yen(inv0))}</span>
          <small>${t0 ? `防衛資金${compact(t0.target_jpy)}円を残した場合` : ""}${short0 ? `・あと${money(yen(short0))}で${compact(t0.target_jpy)}円` : ""}</small></div>
        <div class="cap-alt">${alt}</div>`;
      $("cap-sum").innerHTML = `<span>＝ 防衛資金に数えられる額</span><span>${money(avail < 0 ? signedYen(avail) : yen(avail), avail < 0 ? "neg" : "")}</span>`;
    };
    const rows = (r.deductions || []).filter((x) => x.amount_jpy).map((x) => `<li><span>− ${esc(x.label)}</span><span>${money(yen(x.amount_jpy))}</span>
      ${x.key === "fixed_costs" && x.paid_jpy ? `<span class="m">今の期間（${md(r.last_payday)}〜）に三菱UFJから出た ${money(yen(x.paid_jpy))} を差し引いた残り</span>` : ""}</li>`).join("");
    const tl = (r.timeline || []).map((e) => `<li><span class="muted">${e.date ? md(e.date) : "未定"}</span><span>${esc(e.label)}${e.amount_jpy ? ` <span class="neg">${money("−" + yen(e.amount_jpy))}</span>` : ""}</span>
      <span>${money(e.balance_jpy < 0 ? signedYen(e.balance_jpy) : yen(e.balance_jpy), e.balance_jpy < 0 ? "neg" : "")}</span></li>`).join("");
    const sal = r.next_salary_reference;
    el.innerHTML = `<div id="cap-main"></div>
      <label class="cap-extra">臨時出費の試算 <input id="cap-extra" type="number" inputmode="numeric" min="0" step="10000" placeholder="0" value="${capExtra || ""}"> 円</label>
      <ul class="cap-rows">
        <li><span>三菱UFJの残高（${md(r.cash.as_of)}時点）</span><span>${money(yen(r.cash.amount_jpy))}</span></li>
        ${rows}
        <li class="sum" id="cap-sum"></li>
      </ul>
      <details class="cap-tl"><summary>資金の推移（給料は入れない）</summary><ol>${tl}</ol></details>
      <p class="cap-note">${sal ? `給料（前回 ${money(yen(sal.last_amount_jpy))}）は入金されるまで計算に入れていません。` : "給料は入金されるまで計算に入れていません。"}${r.saving_pace_jpy != null ? `貯まるペース：月 ${money(signedYen(r.saving_pace_jpy))}（三菱UFJの月末残高）。` : ""}</p>
      ${(r.check_warnings || []).map((w) => `<p class="cap-warn">⚠ データの検証：${esc(w.source)} ${esc(w.title)}（${esc(w.action)}）</p>`).join("")}
      ${(r.notes || []).map((n) => `<p class="cap-note">⚠ ${esc(n)}</p>`).join("")}`;
    const input = $("cap-extra");
    input.addEventListener("input", () => {
      const v = Math.floor(Number(input.value));
      capExtra = Number.isFinite(v) && v > 0 ? Math.min(v, 1e9) : 0;
      draw();
    });
    draw();
  }

  // ---------- 投資信託（PFIが取り込んだ楽天証券の保有明細から） ----------
  function renderFunds(d) {
    const el = $("funds");
    if (!d.finance.ok) { el.innerHTML = sectionError(d.finance, "家計"); $("fund-sub").textContent = ""; return; }
    const pf = d.finance.data.portfolio || {}, lt = pf.latest || {}, funds = pf.funds || [], groups = pf.groups || [];
    const contrib = d.finance.data.fund_contributions || {};
    $("fund-sub").textContent = lt.date ? `${md(lt.date)}時点（楽天証券）` : "";
    if (lt.ambiguous) { el.innerHTML = `<div class="empty">同じ日の楽天証券のデータが複数あり、どれが正しいか分かりません（PFIで確認）</div>`; return; }
    if (!lt.date) { el.innerHTML = `<div class="empty">楽天証券の保有明細（assetbalance_all）がまだ取り込まれていません</div>`; return; }
    const total = groups.reduce((a, g) => a + g.market_value_jpy, 0);
    const colors = ["var(--s1)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s7)"];
    let h = "";
    if (total > 0 && groups.length) {
      h += `<div class="fund-mix">${groups.map((g, i) => `<span style="width:${(g.market_value_jpy / total * 100).toFixed(2)}%;background:${colors[i % colors.length]}"></span>`).join("")}</div>
        <div class="fund-legend">${groups.map((g, i) => `<span><i style="background:${colors[i % colors.length]}"></i>${esc(g.label)} ${money(yen(g.market_value_jpy))}（${Math.round(g.market_value_jpy / total * 100)}%）</span>`).join("")}</div>`;
    }
    if (!funds.length) {
      h += `<div class="empty">取り込んだ保有明細に投資信託がありません。楽天証券の「保有商品一覧（すべて）」のCSVを取り込んでいるか確認してください</div>`;
    } else {
      const fv = funds.reduce((a, f) => a + (f.market_value_jpy || 0), 0), fp = funds.reduce((a, f) => a + (f.unrealized_profit_jpy || 0), 0);
      h += `<div class="fund-row"><span class="nm"><b>投資信託の合計</b></span><span>${money(yen(fv))}</span>
        <span class="meta"><span>${funds.length}本</span><span class="${updown(fp)}">${money(signedYen(fp))}</span></span></div>`;
      h += funds.map((f) => `<div class="fund-row"><span class="nm" title="${esc(f.name)}">${esc(f.name)}</span><span>${f.market_value_jpy == null ? "—" : money(yen(f.market_value_jpy))}</span>
        <span class="meta"><span>${esc(f.account_type || "")}</span><span class="${updown(f.unrealized_profit_jpy)}">${f.unrealized_profit_jpy == null ? "" : money(signedYen(f.unrealized_profit_jpy))}${f.profit_pct == null ? "" : `（${pct(f.profit_pct)}）`}</span></span></div>`).join("");
    }
    if (contrib.this_month_jpy || contrib.last_month_jpy) {
      h += `<p class="cap-note">楽天カードでの積立：今月 ${money(yen(contrib.this_month_jpy))}・先月 ${money(yen(contrib.last_month_jpy))}（証券口座のお金からの積立は含みません）</p>`;
    }
    el.innerHTML = h;
  }

  // ---------- データの検証（PFIのdata_checks。問題があれば正常扱いにしない） ----------
  const CHK_WORD = { ok: "OK", info: "参考", needs_review: "要確認", failed: "失敗", unsupported: "未対応" };
  function checkMark(f, impact) {
    const st = ((f.data_checks || {}).impacts || {})[impact];
    if (st !== "failed" && st !== "needs_review") return "";
    // 数字のカードの高さを変えないよう、印だけ出して説明はマウスを重ねたとき（状態タブに詳細）
    return `<span class="chk-mark ${st}" title="データの検証で${st === "failed" ? "失敗" : "要確認"}があります（状態タブ）" aria-label="データの検証で${st === "failed" ? "失敗" : "要確認"}">⚠</span>`;
  }
  function renderChecks(d) {
    const el = $("checks");
    if (!d.finance.ok) { el.innerHTML = sectionError(d.finance, "家計"); $("check-sub").textContent = ""; return; }
    const dq = d.finance.data.data_checks || { overall: "unsupported", reason: "PFIを更新すると表示されます", checks: [], sources: [] };
    $("check-sub").textContent = dq.as_of ? `${md(dq.as_of)} 検証` : "";
    if (dq.overall === "unsupported" || (!dq.checks.length && dq.reason)) {
      el.innerHTML = `<div class="chk-overall"><span class="chk-badge ${esc(dq.overall)}">${CHK_WORD[dq.overall] || ""}</span>${esc(dq.reason || "")}</div>`;
      return;
    }
    const bad = dq.checks.filter((c) => c.status === "failed" || c.status === "needs_review");
    const info = dq.checks.filter((c) => c.status === "info"), okN = dq.checks.filter((c) => c.status === "ok").length;
    const item = (c) => `<div class="chk-item ${esc(c.status)}"><b>${esc(c.source_label)}：${esc(c.title)}</b>
        ${c.cause ? `<div class="why">${esc(c.cause)}</div>` : ""}
        ${(c.impact_labels || []).length ? `<div class="imp">影響: ${c.impact_labels.map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
        ${c.action ? `<div class="todo">対処: ${esc(c.action)}</div>` : ""}
        ${(c.items || []).length ? `<details><summary>該当 ${Number(c.item_count)}件</summary>${c.items.map((it) => `<div>${esc(it.detail || "")}</div>`).join("")}${c.item_count > c.items.length ? `<div>ほか${c.item_count - c.items.length}件</div>` : ""}</details>` : ""}</div>`;
    el.innerHTML = `<div class="chk-overall"><span class="chk-badge ${esc(dq.overall)}">${CHK_WORD[dq.overall]}</span>
        ${bad.length ? `問題 ${bad.length}件（影響のある数字には⚠を付けています）` : `${okN}項目すべて問題なし`}</div>
      <div class="chk-src">${(dq.sources || []).map((s) => `<div><span class="chk-badge ${esc(s.status)}">${CHK_WORD[s.status]}</span> ${esc(s.label)}
        <small>${s.data_through ? md(s.data_through) + "まで" : "—"}・取り込み ${s.last_imported_at ? ago(s.last_imported_at, d.today) : "—"}</small></div>`).join("")}</div>
      ${bad.map(item).join("")}
      ${info.length ? `<details class="cap-tl"><summary>参考 ${info.length}件</summary>${info.map(item).join("")}</details>` : ""}`;
  }

  // ---------- 振り返り（給料日区切り）。記録はPCの画面からだけ（追記だけで、直すと履歴が残る） ----------
  let rvIdx = null, rvBusy = false;
  const rvDraft = {};   // 入力中の文章（5分ごとの自動更新で消えないように）
  const draftOf = (k) => (rvDraft[k] = rvDraft[k] || { rules: {}, ruleText: {}, dec: {}, decEdit: {} });
  const rvCanWrite = () => !!(last && last.write_token) && !window.PCCSource;
  const range = (c) => `${md(c.start)}〜${md(c.end)}`;
  const diffCell = (v, goodUp) => v == null ? `<span class="muted">—</span>` : money(signedYen(v), v === 0 ? "" : (v > 0) === goodUp ? "pos" : "neg");
  async function rvPost(body) {
    const res = await fetch("/api/journal", { method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json", "X-PCC-Token": last.write_token }, body: JSON.stringify(body) });
    let j = {};
    try { j = await res.json(); } catch (e) { /* noop */ }
    if (!res.ok) throw new Error(j.error || ("HTTP " + res.status));
    return j;
  }
  async function rvRun(errId, steps) {
    if (rvBusy) return;
    rvBusy = true;
    document.querySelectorAll("#app .rv-btn").forEach((b) => { b.disabled = true; });
    try {
      for (const s of steps) await rvPost(s);
      return true;
    } catch (e) {
      const el = $(errId);
      if (el) el.textContent = "記録できませんでした：" + e.message;
      return false;
    } finally {
      rvBusy = false;
      document.querySelectorAll("#app .rv-btn").forEach((b) => { b.disabled = false; });
    }
  }
  const histHtml = (e, fmt) => (e.history || []).length ? `<details class="rv-hist"><summary>修正履歴 ${e.history.length}件</summary>
      ${e.history.map((h) => `<div>${esc(h.created_at.slice(0, 16).replace("T", " "))}：${fmt(h.payload)}</div>`).join("")}</details>` : "";

  function renderRetro(d) {
    const sec = d.review;
    const main = $("rv-body");
    if (!sec || !sec.ok) {
      main.innerHTML = sectionError(sec || { error: "振り返りのデータがありません" }, "振り返り");
      ["rv-dec", "rv-rule-list", "rv-rec"].forEach((id) => { $(id).innerHTML = ""; });
      return;
    }
    const R = sec.data, cycles = R.cycles || [];
    if (rvIdx === null || rvIdx >= cycles.length) {
      const due = R.due ? cycles.findIndex((c) => c.start === R.due.start) : -1;
      rvIdx = due >= 0 ? due : 0;
    }
    const c = cycles[rvIdx];
    if (!c) { main.innerHTML = `<div class="empty">データがありません</div>`; return; }
    const dr = draftOf(c.start), w = rvCanWrite();
    $("rv-title").textContent = `振り返り ${range(c)}${c.closed ? "" : "（今の区切り・途中）"}`;
    $("rv-nav").innerHTML = `<button type="button" id="rv-prev" ${rvIdx >= cycles.length - 1 ? "disabled" : ""} aria-label="前の区切り">‹</button>
      <span>${range(c)}</span><button type="button" id="rv-next" ${rvIdx <= 0 ? "disabled" : ""} aria-label="次の区切り">›</button>`;
    $("rv-prev").onclick = () => { rvIdx = Math.min(rvIdx + 1, cycles.length - 1); renderRetro(last); };
    $("rv-next").onclick = () => { rvIdx = Math.max(rvIdx - 1, 0); renderRetro(last); };

    // --- 数字
    const a = c.actuals, fc = c.forecast, fp = fc ? fc.payload : null;
    const fcNote = !fc ? "予測の記録はありません（記録を始める前の区切り）"
      : fc.origin === "backfill" ? "予測は記録を始める前の区切りのため、あとから計算した値です（区切りの初めまでのデータだけで計算）"
      : fp.late ? `予測は区切りの途中（${md(fp.recorded_on)}）に記録しました`
      : `予測は${md(fp.recorded_on)}に記録`;
    let banners = "";
    if (R.journal && R.journal.verify && !R.journal.verify.ok) banners += `<div class="rv-banner bad">記録のファイルが書き換えられた可能性があります（記録 #${Number(R.journal.verify.broken_at)} 以降）。data\\backups の写しを確認してください</div>`;
    if (R.journal && R.journal.write_error) banners += `<div class="rv-banner bad">${esc(R.journal.write_error)}</div>`;
    if (!a.complete) banners += `<div class="rv-banner info">カードは${a.card_known_through ? md(a.card_known_through) : "—"}まで、三菱UFJは${a.bank_known_through ? md(a.bank_known_through) : "—"}までのデータです。${c.closed ? "区切りの最後まで取り込むと数字が確定します" : "区切りの途中なので実績は途中の値です"}</div>`;
    if ((R.data_warnings || []).length) banners += `<div class="rv-banner">⚠ データの検証で問題があります：${R.data_warnings.map((x) => esc(x.source + " " + x.title)).join("／")}（状態タブ）</div>`;
    const row = (label, fv, av, dv, goodUp) => `<tr><td>${label}</td><td>${fv == null ? "—" : money(yen(fv))}</td><td>${money(yen(av))}</td><td>${diffCell(dv, goodUp)}</td></tr>`;
    const inv = c.investment, def = c.defense;
    main.innerHTML = banners + `<div class="rv-grid">
      <div class="rv-box"><h3>予測と実績</h3>
        <table class="rv-tbl"><tr><th></th><th>予測</th><th>実績</th><th>差</th></tr>
          ${row("収入", fp && fp.expected_income_jpy, a.income_jpy, c.compare.income, true)}
          ${row("支出", fp && fp.expected_spending_jpy, a.spending_jpy, c.compare.spending, false)}
          <tr><td>収支</td><td>${fp && fp.expected_net_jpy != null ? money(signedYen(fp.expected_net_jpy)) : "—"}</td><td>${money(signedYen(a.net_jpy))}</td><td>${diffCell(c.compare.net, true)}</td></tr>
        </table>
        <div class="rv-sub">${esc(fcNote)}${fp && fp.basis ? "。" + esc(fp.basis) : ""}${a.pending_spending_jpy ? `。支出のうち速報（未確定） ${money(yen(a.pending_spending_jpy))}` : ""}</div></div>
      <div class="rv-box"><h3>投資余力と実際の投資</h3>
        <div class="rv-big">${money(yen(inv.actual_jpy))}</div>
        <div class="rv-sub">実際に投資に回した額（カードの積立 ${money(yen(a.invested_breakdown.card_jpy))}・証券口座へ ${money(yen(a.invested_breakdown.to_securities_jpy))}）</div>
        <div class="rv-sub" style="margin-top:8px">区切りの初めの投資余力：${inv.planned_jpy == null ? "記録なし" : money(yen(inv.planned_jpy))}${inv.planned_jpy != null ? `（${inv.actual_jpy <= inv.planned_jpy ? "余力の範囲内" : `<span class="neg">余力を ${money(yen(inv.actual_jpy - inv.planned_jpy))} 超過</span>`}）` : ""}</div></div>
      <div class="rv-box"><h3>生活防衛資金（三菱UFJ）</h3>
        <div class="rv-big">${def.end ? money(yen(def.end.amount_jpy)) : "—"}</div>
        <div class="rv-sub">${def.start && def.end && def.start.amount_jpy != null && def.end.amount_jpy != null ? `区切りの前 ${money(yen(def.start.amount_jpy))} → ${md(def.end.date)}時点（${money(signedYen(def.end.amount_jpy - def.start.amount_jpy))}）` : def.end && def.end.amount_jpy == null ? `${md(def.end.date)}の残高を決められません（明細のつながりを確認）` : "残高のデータがありません"}</div>
        ${def.targets.map((t) => `<div class="rv-target">${compact(t.target_jpy)}円 ${t.reached ? "✅ 到達" : t.progress_pct == null ? "" : `${t.progress_pct}%`}
          <div class="rv-bar"><span style="width:${t.progress_pct || 0}%"></span></div></div>`).join("")}</div>
    </div>`;

    // --- 判断
    const decFmt = (p) => esc(p.reason) + (p.outcome_note ? `（その後：${esc(p.outcome_note)}）` : "");
    const decForm = (key, cur, trade, cycle) => {
      if (!w) return "";
      if (cur && !dr.decEdit[key]) return `<button type="button" class="rv-btn ghost" data-dec-edit="${esc(key)}">直す</button>`;
      const v = dr.dec[key] ?? (cur ? cur.payload.reason : "");
      return `<div class="rv-form"><textarea data-dec="${esc(key)}" placeholder="なぜ買った・売った・見送ったか（根拠・そのときの利回りや条件）">${esc(v)}</textarea>
        <button type="button" class="rv-btn ${cur ? "ghost" : ""}" data-dec-save="${esc(key)}">${cur ? "直して記録" : "根拠を記録"}</button><div class="rv-err" id="rv-err-${esc(key.replace(/[^A-Za-z0-9]/g, ""))}"></div></div>`;
    };
    const SIDE = { buy: "買い", sell: "売り" };
    let decH = (c.trades || []).map((t) => `<div class="rv-item"><div class="rv-top"><b>${esc(t.name || "")} ${esc(t.ticker)}　${SIDE[t.side]}</b>
        <span class="meta">${md(t.date)}・${Number(t.shares)}株 @ ${money(yen(t.price))}</span></div>
        <div class="meta">今 ${t.current_price == null ? "—（株価なし）" : money(yen(t.current_price))}${t.change_pct == null ? "" : `（約定から <span class="${updown(t.side === "buy" ? t.change_pct : -t.change_pct)}">${pct(t.change_pct)}</span>）`}</div>
        ${t.decision ? `<div class="why">${decFmt(t.decision.payload)}</div>${histHtml(t.decision, decFmt)}` : w ? "" : `<div class="why muted">根拠の記録なし</div>`}
        ${decForm(t.key, t.decision, t, c.start)}</div>`).join("");
    decH += (c.free_decisions || []).map((e) => `<div class="rv-item"><div class="rv-top"><b>約定のない判断</b><span class="meta">${esc(e.created_at.slice(0, 10))}</span></div>
        <div class="why">${decFmt(e.payload)}</div>${histHtml(e, decFmt)}${decForm(e.subject, e, null, c.start)}</div>`).join("");
    if (!decH) decH = `<div class="empty">この区切りの約定はありません（stock-watchlist の trades.csv）</div>`;
    if (w) decH += `<div class="rv-form"><label>約定のない判断（見送り・様子見など）</label><textarea data-dec="new" placeholder="例：〇〇は利回り3.4%で検討ライン未満のため見送り">${esc(dr.dec.new || "")}</textarea>
      <button type="button" class="rv-btn ghost" data-dec-save="new">記録</button><div class="rv-err" id="rv-err-new"></div></div>`;
    $("rv-dec").innerHTML = decH;
    $("rv-dec-sub").textContent = `約定 ${(c.trades || []).length}件`;

    // --- ルール
    const rules = R.rules || [], active = rules.filter((r) => r.payload.status === "active"), retired = rules.filter((r) => r.payload.status !== "active");
    const ruleFmt = (p) => esc(p.text) + (p.status === "retired" ? "（やめた）" : "");
    const done = c.review;
    $("rv-rule-list").innerHTML = (active.length ? active.map((r) => {
      const ch = dr.rules[r.subject] || "keep";
      return `<div class="rv-rule"><div>${esc(r.payload.text)}</div>${histHtml(r, ruleFmt)}
        ${w && !done ? `<div class="rv-choice">${[["keep", "継続"], ["change", "変更"], ["stop", "やめる"]].map(([v, l]) =>
          `<label><input type="radio" name="rv-r-${esc(r.subject)}" value="${v}" data-rule="${esc(r.subject)}" ${ch === v ? "checked" : ""}>${l}</label>`).join("")}</div>
          ${ch === "change" ? `<div class="rv-form"><input type="text" data-rule-text="${esc(r.subject)}" value="${esc(dr.ruleText[r.subject] ?? r.payload.text)}"></div>` : ""}` : ""}</div>`;
    }).join("") : `<div class="empty">まだルールがありません</div>`)
      + (w ? `<div class="rv-form"><label>ルールを追加</label><input type="text" id="rv-new-rule" placeholder="例：利回り3.5%未満は買わない" value="${esc(dr.newRule || "")}">
          <button type="button" class="rv-btn ghost" id="rv-add-rule">追加</button><div class="rv-err" id="rv-err-rule"></div></div>` : "")
      + (retired.length ? `<details class="rv-hist"><summary>やめたルール ${retired.length}件</summary>${retired.map((r) => `<div>${esc(r.payload.text)}</div>`).join("")}</details>` : "");
    $("rv-rules-sub").textContent = `${active.length}件`;

    // --- 振り返りの記録
    const recFmt = (p) => `改善点：${esc(p.improve)}${p.next_actions ? `／翌月：${esc(p.next_actions)}` : ""}`;
    const nums = () => ({ income_jpy: a.income_jpy, spending_jpy: a.spending_jpy, net_jpy: a.net_jpy,
      expected_income_jpy: fp ? fp.expected_income_jpy : null, expected_spending_jpy: fp ? fp.expected_spending_jpy : null,
      invested_jpy: inv.actual_jpy, investable_planned_jpy: inv.planned_jpy, mufg_end_jpy: def.end ? def.end.amount_jpy : null,
      data_complete: a.complete ? "yes" : "no", card_known_through: a.card_known_through || "" });
    let rec;
    const editing = dr.editing;
    if (done && !editing) {
      const p = done.payload, RD = { keep: "継続", change: "変更", stop: "やめる" };
      rec = `<div class="rv-rec-grid"><div><h3 class="mini-title">良かったこと</h3><p>${esc(p.good) || "—"}</p></div>
          <div><h3 class="mini-title">改善点</h3><p>${esc(p.improve)}</p></div><div><h3 class="mini-title">翌月の行動</h3><p>${esc(p.next_actions) || "—"}</p></div></div>
        ${(p.rules || []).length ? `<div class="rv-sub" style="margin-top:10px">ルール：${p.rules.map((r) => `${esc(r.text)}（${RD[r.decision]}）`).join("／")}</div>` : ""}
        <div class="rv-sub">記録 ${esc(done.created_at.slice(0, 16).replace("T", " "))}${p.numbers && p.numbers.data_complete === "no" ? "・記録したときはデータが途中でした" : ""}</div>
        ${histHtml(done, recFmt)}
        ${w ? `<button type="button" class="rv-btn ghost" id="rv-edit">直す（前の版は履歴に残ります）</button>` : ""}`;
    } else if (w) {
      const src = editing && done ? done.payload : {};
      const v = (k) => esc(dr[k] ?? src[k] ?? "");
      rec = `<div class="rv-form rv-rec-grid">
          <div><label>良かったこと</label><textarea data-rv="good">${v("good")}</textarea></div>
          <div><label>改善点（必須）</label><textarea data-rv="improve">${v("improve")}</textarea></div>
          <div><label>翌月の行動・変えること</label><textarea data-rv="next_actions">${v("next_actions")}</textarea></div></div>
        <div class="rv-sub">${editing ? "直した内容を新しい版として記録します（前の版は消えません）" : "記録すると、このときの数字とルールの扱い（継続・変更・やめる）も一緒に残ります"}${!c.closed ? "。区切りの途中です（締めてから記録するのがおすすめ）" : ""}</div>
        <button type="button" class="rv-btn" id="rv-save">${editing ? "直して記録" : "振り返りを記録"}</button>
        ${editing ? `<button type="button" class="rv-btn ghost" id="rv-cancel">やめる</button>` : ""}<div class="rv-err" id="rv-err-rec"></div>`;
    } else {
      rec = `<div class="empty">まだ記録はありません。${window.PCCSource ? "記録はPCの画面からできます" : ""}</div>`;
    }
    $("rv-rec").innerHTML = rec;
    $("rv-rec-sub").textContent = done ? "記録済み" : c.closed ? "未記録" : "区切りの途中";

    // --- 入力（下書きに残す）と送信
    document.querySelectorAll("#app [data-rv]").forEach((el) => el.addEventListener("input", () => { dr[el.dataset.rv] = el.value; }));
    document.querySelectorAll("#app [data-dec]").forEach((el) => el.addEventListener("input", () => { dr.dec[el.dataset.dec] = el.value; }));
    document.querySelectorAll("#app [data-rule]").forEach((el) => el.addEventListener("change", () => { dr.rules[el.dataset.rule] = el.value; renderRetro(last); }));
    document.querySelectorAll("#app [data-rule-text]").forEach((el) => el.addEventListener("input", () => { dr.ruleText[el.dataset.ruleText] = el.value; }));
    const nr = $("rv-new-rule");
    if (nr) nr.addEventListener("input", () => { dr.newRule = nr.value; });
    const add = $("rv-add-rule");
    if (add) add.onclick = async () => {
      const text = (dr.newRule || "").trim();
      if (!text) { $("rv-err-rule").textContent = "ルールを入力してください"; return; }
      const ok = await rvRun("rv-err-rule", [{ kind: "rule", cycle: c.start, subject: "r-" + Date.now().toString(36), payload: { text, status: "active" } }]);
      if (ok) { dr.newRule = ""; load(false); }
    };
    document.querySelectorAll("#app [data-dec-save]").forEach((b) => { b.onclick = async () => {
      const key = b.dataset.decSave, errId = key === "new" ? "rv-err-new" : "rv-err-" + key.replace(/[^A-Za-z0-9]/g, "");
      const box = document.querySelector(`[data-dec="${CSS.escape(key)}"]`);
      const reason = String(dr.dec[key] ?? (box ? box.value : "")).trim();
      if (!reason) { $(errId).textContent = "根拠を入力してください"; return; }
      const trade = (c.trades || []).find((t) => t.key === key);
      const prev = trade ? trade.decision : (c.free_decisions || []).find((e) => e.subject === key);
      const subject = key === "new" ? "free-" + Date.now().toString(36) : key;
      const payload = { reason, trade: trade ? { date: trade.date, ticker: trade.ticker, side: trade.side, shares: trade.shares, price: trade.price } : null };
      const ok = await rvRun(errId, [{ kind: "decision", cycle: c.start, subject, payload, supersedes_id: prev ? prev.id : null }]);
      if (ok) { delete dr.dec[key]; delete dr.decEdit[key]; load(false); }
    }; });
    document.querySelectorAll("#app [data-dec-edit]").forEach((b) => { b.onclick = () => { dr.decEdit[b.dataset.decEdit] = true; renderRetro(last); }; });
    const ed = $("rv-edit");
    if (ed) ed.onclick = () => { dr.editing = true; renderRetro(last); };
    const cc = $("rv-cancel");
    if (cc) cc.onclick = () => { dr.editing = false; renderRetro(last); };
    const sv = $("rv-save");
    if (sv) sv.onclick = async () => {
      const src = dr.editing && done ? done.payload : {};
      const val = (k) => (dr[k] ?? src[k] ?? "").trim();
      if (!val("improve")) { $("rv-err-rec").textContent = "改善点を入力してください"; return; }
      const steps = [], ruleRec = [];
      if (!dr.editing) {
        for (const r of active) {
          const dec = dr.rules[r.subject] || "keep";
          const text = dec === "change" ? (dr.ruleText[r.subject] ?? r.payload.text).trim() : r.payload.text;
          if (dec === "change" && !text) { $("rv-err-rec").textContent = "変更するルールの文を入力してください"; return; }
          if (dec === "change" && text !== r.payload.text) steps.push({ kind: "rule", cycle: r.cycle, subject: r.subject, supersedes_id: r.id, payload: { text, status: "active", changed_in_cycle: c.start } });
          if (dec === "stop") steps.push({ kind: "rule", cycle: r.cycle, subject: r.subject, supersedes_id: r.id, payload: { text: r.payload.text, status: "retired", changed_in_cycle: c.start } });
          ruleRec.push({ subject: r.subject, text, decision: dec });
        }
      }
      const payload = { good: val("good"), improve: val("improve"), next_actions: val("next_actions"),
        numbers: dr.editing && done ? done.payload.numbers : nums(), rules: dr.editing && done ? done.payload.rules : ruleRec };
      steps.push({ kind: "review", cycle: c.start, payload, supersedes_id: dr.editing && done ? done.id : null });
      const ok = await rvRun("rv-err-rec", steps);
      if (ok) { rvDraft[c.start] = null; load(false); }
    };
  }

  // ---------- 家計の確認 ----------
  function renderReview(d) {
    const el = $("review");
    if (!d.finance.ok) { el.innerHTML = ""; return; }
    const f = d.finance.data, rc = f.review_counts || {}, tasks = f.review_tasks || [], errs = f.import_errors || [];
    const uf = f.unconfirmed_bank_flows || { count: 0 };
    $("review-sub").textContent = `確認タスク${tasks.length}件`;
    const P = { high: "高", medium: "中", low: "低" };
    el.innerHTML = `<div class="stat-row">
        <div class="stat"><b>${tasks.length}</b><span>確認タスク</span></div>
        <div class="stat"><b>${rc.needs_review_transactions || 0}</b><span>分類があいまいな明細</span></div>
        <div class="stat"><b>${errs.length}</b><span>取り込めないファイル</span></div></div>
      ${uf.count ? `<p style="font-size:12px;color:var(--text-2);margin:0 0 10px">銀行の入出金のうち種類が決まっていない <b>${Number(uf.count)}件</b>（入金 ${money(yen(uf.in_jpy))}・出金 ${money(yen(uf.out_jpy))}）は、今月の収入・支出に入れていません。カードの引き落としや口座間の振替を二重に数えないためです。<code>add_category_keyword.py</code> で分類すると計上されます。</p>` : ""}
      ${rc.unreviewed_possible_duplicates ? `<p style="font-size:12px;color:var(--text-2);margin:0 0 10px">重複の可能性がある明細 <b>${Number(rc.unreviewed_possible_duplicates)}件</b> は、本物の支出を落とさないよう合計に含めています（PFIで確認できます）。</p>` : ""}
      <ul class="plain-list">${tasks.slice(0, 12).map((t) => `<li><span class="prio p${t.priority === "high" ? 1 : t.priority === "medium" ? 2 : 3}" style="padding:0 6px">${P[t.priority] || "—"}</span>${esc(t.title)}<span class="muted">${t.created_at ? ago(t.created_at, d.today) : ""}</span></li>`).join("")}
      ${errs.map((e) => `<li><span class="sev ${e.severity === "error" ? "error" : "warn"}" style="width:18px;height:18px;font-size:10px">!</span><span>${esc(e.file_name)}<br><small style="color:var(--muted)">${esc(e.label)}</small></span><span class="muted">${Number(e.count)}回</span></li>`).join("")}
      ${!tasks.length && !errs.length ? `<li class="empty">確認が必要なものはありません</li>` : ""}</ul>
      <p style="font-size:11.5px;color:var(--muted);margin:10px 0 0">処理はPFIで: <code>python scripts\\review_tasks.py</code></p>`;
  }

  // ---------- today ----------
  function renderToday(d) {
    const items = d.today_items || [];
    const now = new Date(), nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    $("today-count").textContent = items.length + "件";
    const P = { 1: ["高", "p1"], 2: ["中", "p2"], 3: ["低", "p3"] };
    $("today-list").innerHTML = items.length ? items.map((it) => {
      const end = (it.kind === "task" || it.kind === "event") && it.detail.split("–")[1];
      const past = it.time && end && end < nowHM;
      return `<li class="${past ? "past" : ""}"><span class="prio ${P[it.priority][1]}">${P[it.priority][0]}</span>
        <div><div class="t-title">${it.time ? `<span class="time">${esc(it.time)}</span> ` : ""}${esc(it.title)}</div>
        <div class="t-meta"><span class="tag">${esc(it.source)}</span>${it.detail && !(it.time && (it.kind === "task" || it.kind === "event")) ? `<span>${esc(it.detail)}</span>` : ""}</div></div></li>`;
    }).join("") : `<li><span class="prio p3">—</span><div class="t-title">今日やることはありません</div></li>`;
  }

  // ---------- alerts ----------
  function renderAlerts(d) {
    const al = d.alerts || [];
    const errs = al.filter((a) => a.severity === "error").length, warns = al.filter((a) => a.severity === "warn").length;
    $("alert-count").textContent = errs || warns ? `エラー${errs}・注意${warns}` : "問題なし";
    const badge = $("status-badge");
    for (const b of [badge, $("status-badge-m")]) {
      if (!b) continue;
      b.hidden = !(errs || warns); b.textContent = errs || warns; b.className = "tab-badge" + (errs ? "" : " warn");
    }
    const LABEL = { error: "エラー", warn: "注意", info: "情報" };
    $("alert-list").innerHTML = al.length ? al.map((a) => `<li><span class="sev ${a.severity}" title="${LABEL[a.severity]}" aria-label="${LABEL[a.severity]}">${a.severity === "info" ? "i" : "!"}</span>
      <div><div class="a-title">${esc(a.title)}</div><div class="a-detail">${esc(a.source)}${a.detail ? " · " + esc(a.detail) : ""}</div>
      ${a.action ? `<div class="a-action">${esc(a.action)}</div>` : ""}</div></li>`).join("")
      : `<li class="all-clear"><span class="sev ok">✓</span>取り込み・自動実行に問題はありません</li>`;
  }

  // ---------- stocks ----------
  const safetyBadge = (s) => !s ? "" : `<span class="badge ${s === "安全" ? "safe" : s === "やや注意" ? "caution" : s === "要注意" ? "danger" : "neutral"}">${esc(s)}</span>`;
  const priceCell = (o) => o.price == null ? `<span style="color:var(--muted)">—</span>`
    : `<span class="price">${o.price.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}<small class="${updown(o.change_pct)}">${pct(o.change_pct)}</small></span>`;
  const sigCell = (a, today) => a ? `${esc(a.level)}<small>${ago(a.date, today)}</small>` : `<span style="color:var(--muted)">—</span>`;
  const yieldCell = (y, min, meets) => y == null ? `<span style="color:var(--muted)">—</span>`
    : `<span class="yield ${meets == null ? "" : meets ? "pos" : "low"}">${y.toFixed(2)}%</span>`;
  function renderStocks(d) {
    const st = d.stocks;
    if (!st.ok) {
      $("cand-table").innerHTML = `<tr><td>${sectionError(st, "株の情報")}</td></tr>`;
      ["hold-table", "recent-list", "order-list"].forEach((id) => { $(id).innerHTML = ""; });
      ["cand-sub", "hold-sub", "recent-sub", "orders-sub"].forEach((id) => { $(id).textContent = ""; });
      return;
    }
    const s = st.data;
    const priceNote = s.prices_count ? `株価 ${s.prices_as_of ? hm(s.prices_as_of).split(" ")[1] : ""}取得` : (s.prices_error && s.prices_error !== "off" ? "株価なし" : "");
    const ds = s.dividend_summary || {};
    const minY = ds.buy_min_pct ?? 3.5;
    const meetsN = s.candidates.filter((c) => c.meets_yield).length;
    $("cand-sub").textContent = `${s.candidate_total}件中${s.candidates.length}件・利回り${minY}%以上 ${meetsN}件` + (priceNote ? `・${priceNote}` : "");
    $("cand-table").innerHTML = `<thead><tr><th>銘柄</th><th class="num">株価</th><th class="num" title="予想年間配当÷今の株価。${minY}%以上を緑で表示">利回り</th><th class="num hide-sm">目標まで</th><th>買い条件</th><th class="hide-sm hide-ov">配当</th><th>直近の通知</th></tr></thead><tbody>` +
      (s.candidates.length ? s.candidates.map((c) => {
        const ratio = c.buy_score != null && c.buy_score_max ? c.buy_score / c.buy_score_max : 0;
        const tgt = c.to_target_pct != null ? `<span class="${c.to_target_pct <= 0 ? "pos" : ""}">${c.to_target_pct <= 0 ? "到達" : "あと" + c.to_target_pct.toFixed(1) + "%"}</span><small style="display:block;color:var(--muted)">${money(yen(c.target_buy))}</small>`
          : c.target_buy ? money(yen(c.target_buy)) : `<span style="color:var(--muted)">—</span>`;
        return `<tr><td class="name">${esc(c.name)}<span class="code">${esc(c.code)}</span><span class="cat">${esc(c.category)}</span></td>
          <td class="num">${priceCell(c)}</td><td class="num">${yieldCell(c.yield_pct, minY, c.yield_pct == null ? null : c.meets_yield)}</td><td class="num hide-sm">${tgt}</td>
          <td>${c.buy_score != null ? `<span class="score"><span class="bar"><span style="width:${Math.round(ratio * 100)}%"></span></span>${c.buy_score}/${c.buy_score_max}</span>` : "—"}</td>
          <td class="hide-sm hide-ov">${safetyBadge(c.dividend_safety)}</td>
          <td class="sig">${sigCell(c.signal, d.today)}</td></tr>`;
      }).join("") : `<tr><td colspan="7" class="empty">条件に合う候補はありません</td></tr>`) + "</tbody>";

    const all = ds.all || {};
    const div = all.annual_jpy || s.annual_dividend_total_jpy;
    const tgtY = ds.target_pct ?? 4;
    $("hold-sub").innerHTML = `${s.counts.held}銘柄・要確認${s.counts.holdings_attention}` + (div ? `・年間配当(見込) ${money(yen(div))}` : "")
      + (all.yield_pct != null ? `・利回り <b class="${all.yield_pct >= tgtY ? "pos" : "low"}">${all.yield_pct.toFixed(2)}%</b>` : "");
    const pc = ((s.positions_check || {}).items || []).filter((i) => i.kind !== "unverifiable");
    if (pc.length) $("hold-sub").innerHTML += ` <span class="chk-mark failed" title="${esc(pc.map((i) => `${i.name}（${i.code}）: ${i.detail}`).join(" / "))}">⚠ 楽天証券と${pc.length}銘柄違います（状態タブ）</span>`;
    $("hold-table").innerHTML = `<thead><tr><th>銘柄</th><th class="num">株価</th><th class="num">評価額</th><th class="num hide-sm">損益</th><th class="num" title="予想年間配当÷今の株価">利回り</th><th class="hide-sm">配当</th><th>直近の通知</th></tr></thead><tbody>` +
      (s.holdings.length ? s.holdings.map((h) => {
        const value = h.value_now_jpy ?? h.market_value_jpy, profit = h.profit_now_jpy ?? h.unrealized_profit_jpy;
        return `<tr class="${h.attention ? "attn" : ""}">
        <td class="name">${esc(h.name)}<span class="code">${esc(h.code)}</span>${h.yutai ? `<span class="cat">優待</span>` : ""}</td>
        <td class="num">${priceCell(h)}</td>
        <td class="num">${value != null ? money(yen(value)) : `${money((h.shares ?? "—") + "株")}`}</td>
        <td class="num hide-sm">${profit != null ? money(signedYen(profit), profit >= 0 ? "pos" : "neg") : "—"}${h.vs_cost_pct != null ? `<small style="display:block;color:var(--muted)">${pct(h.vs_cost_pct)}</small>` : ""}</td>
        <td class="num">${yieldCell(h.yield_pct, null, null)}</td>
        <td class="hide-sm">${safetyBadge(h.dividend_safety)}${h.yoc ? `<small style="display:block;color:var(--muted)">YOC ${h.yoc}%</small>` : ""}</td>
        <td class="sig">${sigCell(h.latest_alert, d.today)}</td></tr>`;
      }).join("") : `<tr><td colspan="7" class="empty">保有銘柄はありません</td></tr>`) + "</tbody>";

    const held = new Set(s.holdings.map((h) => h.code));
    $("recent-sub").textContent = `直近${s.alert_days}日・${s.recent_alerts.length}件`;
    $("recent-list").innerHTML = s.recent_alerts.length ? s.recent_alerts.map((a) => `<li><span class="d">${md(a.date)}</span>
      <span>${esc(a.name || a.code)}<span style="color:var(--muted);margin-left:6px;font-size:12px">${esc(a.code)}</span>${held.has(a.code) ? `<span class="held">保有</span>` : ""}
      <div class="lv">${esc(a.level)}</div></span>
      <span class="price ${updown(a.pct)}" style="font-size:12px">${a.pct == null ? "" : pct(a.pct)}</span></li>`).join("")
      : `<li class="empty">直近の通知はありません</li>`;

    $("orders-sub").textContent = `${s.limit_orders.length}件`;
    $("order-list").innerHTML = s.limit_orders.length ? s.limit_orders.map((o) => `<li>
      <span>${esc(o.name || o.code)}<span style="color:var(--muted);margin-left:6px;font-size:12px">${esc(o.code)}</span>
        <small style="display:block;color:var(--muted)">${o.shares ?? "—"}株 @ ${money(yen(o.price))}${o.memo ? "・" + esc(o.memo) : ""}</small></span>
      <span class="${o.days_left != null && o.days_left <= 2 ? "neg" : ""}" style="font-size:12px;white-space:nowrap">${o.expires ? `期限 ${md(o.expires)}（あと${o.days_left}日）` : "期限なし"}</span></li>`).join("")
      : `<li class="empty">出している指値注文はありません（limit_orders.csv）</li>`;
  }

  // ---------- reminders ----------
  function renderReminders(d) {
    const el = $("reminders"), t = d.tasks;
    if (!t || !t.ok) { el.innerHTML = sectionError(t || {}, "タスク"); $("rem-sub").textContent = ""; return; }
    const r = t.data, err = r.last_error;
    $("rem-sub").textContent = `${r.total}件・${hoursAgo(r.age_hours)}取得` + (err ? (err.kind === "reauth_required" ? "・再認証が必要" : "・前回の取得に失敗") : "");
    const groups = [["overdue", "期限切れ"], ["today", "今日まで"], ["week", "1週間以内"], ["nodue", "期限なし"], ["later", "それ以降"]];
    const html = groups.map(([k, label]) => {
      const its = r.items.filter((i) => i.bucket === k);
      if (!its.length) return "";
      return `<div class="rem-group"><h4 class="${k}">${label}<span class="count">${its.length}</span></h4>${its.map((i) => `
        <div class="rem ${i.flagged ? "flag" : ""}"><span>${i.flagged ? "⚑ " : ""}${esc(i.title)}${i.list ? `<span class="rl">${esc(i.list)}${i.priority ? "・優先度 " + esc(i.priority) : ""}${i.estimated_minutes ? "・" + i.estimated_minutes + "分" : ""}</span>` : ""}</span>
        <span class="rm">${i.due ? md(i.due) + (i.due_time ? " " + esc(i.due_time) : "") : ""}</span></div>`).join("")}</div>`;
    }).join("");
    el.innerHTML = html || `<div class="empty">未完了のタスクはありません</div>`;
  }

  // ---------- week ----------
  function renderWeek(d) {
    const el = $("week-grid");
    if (!d.schedule.ok) { el.innerHTML = sectionError(d.schedule, "予定"); $("week-sub").textContent = ""; return; }
    const w = d.schedule.data;
    $("week-sub").innerHTML = `<span class="week-legend"><span><i class="bot"></i>AIが組んだタスク ${w.counts.bot_tasks}</span><span><i></i>そのほかの予定</span></span>`;
    el.innerHTML = w.days.map((day) => {
      const dt = toDate(day.date), past = day.date < d.today;
      const cls = day.weekday === "土" ? "sat" : day.weekday === "日" ? "sun" : "";
      return `<div class="day ${day.is_today ? "today-col" : ""} ${past ? "past-day" : ""}">
        <div class="day-head"><b>${dt.getDate()}</b><span class="${cls}">${day.weekday}${day.is_today ? "・今日" : ""}</span></div>
        <div>${day.events.length ? day.events.map((e) => `<div class="ev ${e.is_bot_task ? "bot" : ""}"><span class="et">${e.all_day ? "終日" : esc(e.start) + (e.end ? "–" + esc(e.end) : "")}</span>${esc(e.title)}</div>`).join("") : `<div class="empty" style="font-size:12px">予定なし</div>`}</div></div>`;
    }).join("");
  }

  // ---------- status ----------
  const FRESH = { fresh: ["新しい", "ok"], aging: ["そろそろ古い", "warn"], stale: ["古い", "error"], unknown: ["不明", "unknown"] };
  const PROVIDER = { mufg_bank: "三菱UFJ銀行", rakuten_card: "楽天カード", rakuten_securities: "楽天証券", mizuho_bank: "みずほ銀行", rakuten_bank: "楽天銀行" };
  const STATE = { ok: ["✓", "正常"], warn: ["!", "注意"], error: ["!", "エラー"], unknown: ["?", "不明"], off: ["–", "未設定"] };
  function renderStatus(d) {
    $("job-list").innerHTML = (d.jobs || []).length ? d.jobs.map((j) => `<li><span class="sev ${j.state}" aria-label="${STATE[j.state][1]}">${STATE[j.state][0]}</span>
      <div><div class="j-name">${esc(j.name)}</div><div class="j-sch">${esc(j.schedule)}</div></div>
      <div class="j-last">${j.last_run ? hm(j.last_run) : "—"}<small>${esc(j.last_status)}</small></div></li>`).join("")
      : `<li class="empty">監視できる自動実行がありません（設定を確認）</li>`;
    const runs = d.pfi_runs || [];
    const RS = { SUCCESS: "ok", SUCCESS_WITH_WARNINGS: "warn", FAILED: "error", INCOMPLETE: "error", RUNNING: "unknown" };
    $("run-list").innerHTML = runs.length ? runs.map((r) => `<li><span>${hm(r.started_at)}<small style="display:block;color:var(--muted)">${esc((r.warnings[0] || r.errors[0] || "").slice(0, 80))}</small></span>
      <span class="badge ${RS[r.status] === "ok" ? "safe" : RS[r.status] === "warn" ? "caution" : RS[r.status] === "error" ? "danger" : "neutral"}">${esc(r.status_label)}</span></li>`).join("")
      : `<li class="empty">ログがありません</li>`;
    $("conn-list").innerHTML = (d.connections || []).map((c) => `<li><span class="sev ${c.state}" aria-label="${STATE[c.state][1]}">${STATE[c.state][0]}</span>
      <div><div class="c-name">${esc(c.name)}</div><div class="c-detail">${esc(c.detail || "")}</div></div></li>`).join("");
    const fin = d.finance;
    if (!fin.ok) { $("fresh-list").innerHTML = ""; return; }
    const fr = (fin.data.summary || {}).data_freshness || {};
    const imports = {};
    (fin.data.last_imports || []).forEach((i) => { if (!imports[i.provider] || i.imported_at > imports[i.provider]) imports[i.provider] = i.imported_at; });
    const provs = [...new Set([...Object.keys(fr), ...Object.keys(imports)])];
    $("fresh-list").innerHTML = provs.map((p) => {
      const info = fr[p];
      // v21（外部レビューLOW-02）: 知らない状態の値は、そのまま画面に入れず「不明」と表示する
      const f = info ? (FRESH[info.freshness_status] || ["不明", "unknown"]) : ["判定なし", "unknown"];
      return `<li><b><span class="sev ${f[1]}" style="display:inline-grid;width:16px;height:16px;font-size:10px;margin-right:6px;vertical-align:-2px">${f[1] === "ok" ? "✓" : f[1] === "unknown" ? "?" : "!"}</span>${esc(PROVIDER[p] || p)}</b>
        <span>${f[0]}・最終取込 ${imports[p] ? ago(imports[p], d.today) : "—"}</span></li>`;
    }).join("");
  }

  // ---------- main ----------
  let last = null, greeting = "こんにちは";
  const VIEW_TITLE = { money: "家計", stocks: "株", plan: "予定・タスク", review: "振り返り", status: "状態" };
  const updateTitle = () => {
    const v = document.body.dataset.view;
    $("greeting").textContent = VIEW_TITLE[v] || greeting;
  };
  const renderers = [renderKpis, renderToday, renderPace, renderMonths, renderDonut, renderBanks, renderCapacity, renderReview, renderAlerts,
    renderStocks, renderFunds, renderReminders, renderWeek, renderStatus, renderChecks, renderRetro];
  function renderAll(d) {
    last = d;
    $("demo").hidden = !d.demo;
    document.body.classList.toggle("has-banner", !!d.demo);
    const now = new Date(d.generated_at), h = now.getHours();
    greeting = h < 11 ? "おはようございます" : h < 18 ? "こんにちは" : "こんばんは";
    updateTitle();
    $("date").textContent = now.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
    $("updated").textContent = "更新 " + now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
    renderers.forEach((fn) => { try { fn(d); } catch (e) { console.error(fn.name, e); } });
    setupMore("today-card", "today-list", 5);
    setupMore("alerts-card", "alert-list", 3);
  }
  // スマホのホームでは長い一覧を先頭の数件だけにし、「すべて表示」で広げる（CSSが件数を絞る）
  function setupMore(cardId, listId, limit) {
    const card = $(cardId), n = $(listId).children.length;
    let btn = card.querySelector(".more-btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button"; btn.className = "more-btn";
      btn.addEventListener("click", () => { card.classList.toggle("expanded"); setupMore(cardId, listId, limit); });
      card.appendChild(btn);
    }
    card.style.setProperty("--more-limit", limit);
    card.classList.toggle("has-more", n > limit);
    btn.textContent = card.classList.contains("expanded") ? "閉じる" : `すべて表示（${n}件）`;
  }
  const rerenderCharts = () => { if (last) { try { renderPace(last); renderMonths(last); } catch (e) { console.error(e); } } };

  async function load(force) {
    const btn = $("refresh");
    btn.classList.add("spin");
    try {
      // スマホ用ページ（GitHub Pages）では mobile.js が暗号化データの取得・復号を受け持つ
      const src = window.PCCSource;
      let d;
      if (src) {
        d = await src.load(force);
      } else {
        const res = await fetch("/api/dashboard" + (force ? "?refresh=1" : ""), { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        d = await res.json();
      }
      renderAll(d);
      if (src && src.afterRender) src.afterRender(d);
    } catch (e) {
      $("updated").textContent = "更新に失敗しました（" + e.message + "）";
      if (window.PCCSource && window.PCCSource.onError) window.PCCSource.onError(e);
    } finally {
      btn.classList.remove("spin");
    }
  }

  // ---------- タブ（PC） ----------
  const VIEWS = ["overview", "money", "stocks", "plan", "review", "status"];
  const tabs = [...document.querySelectorAll("[data-tab]")];  // PCの上のタブと、スマホの下のタブ
  function setView(v, push) {
    if (!VIEWS.includes(v)) v = "overview";
    document.body.dataset.view = v;
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === v)));
    updateTitle();
    if (push) {
      try { history.replaceState(null, "", "#" + v); } catch (e) { /* noop */ }
      if (window.innerWidth <= 1180) window.scrollTo(0, 0);  // スマホ: 切り替えたら先頭から
    }
    try { localStorage.setItem("pcc-view", v); } catch (e) { /* noop */ }
    requestAnimationFrame(rerenderCharts);
  }
  tabs.forEach((t) => t.addEventListener("click", () => setView(t.dataset.tab, true)));
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input,textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= VIEWS.length) setView(VIEWS[n - 1], true);
  });
  let initial = location.hash.slice(1);
  if (!VIEWS.includes(initial)) { try { initial = localStorage.getItem("pcc-view") || "overview"; } catch (e) { initial = "overview"; } }
  setView(initial, false);

  // 金額を隠す（外出先でスマホを開くとき用）。設定はこのブラウザだけに保存
  const maskBtn = $("mask");
  const setMask = (on) => { document.body.classList.toggle("masked", on); maskBtn.setAttribute("aria-pressed", String(on)); };
  try { setMask(localStorage.getItem("pcc-mask") === "1"); } catch (e) { /* 保存できない環境では毎回表示 */ }
  maskBtn.addEventListener("click", () => {
    const on = !document.body.classList.contains("masked");
    setMask(on);
    try { localStorage.setItem("pcc-mask", on ? "1" : "0"); } catch (e) { /* noop */ }
  });
  $("refresh").addEventListener("click", () => load(true));

  // グラフは入れ物の大きさに合わせて描き直す
  let rt;
  const schedule = () => { clearTimeout(rt); rt = setTimeout(rerenderCharts, 120); };
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(schedule);
    ro.observe($("pace-card")); ro.observe($("months-card"));
  } else {
    window.addEventListener("resize", schedule);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(false); });
  setInterval(() => { if (!document.hidden) load(false); }, 5 * 60 * 1000);
  load(false);
})();
