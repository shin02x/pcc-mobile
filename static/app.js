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
    // v30（自己レビュー）: マウスを重ねたときの内訳（title）にも、ぼかし中は金額を出さない
    const breakdown = banks.items.map((b) => `${b.label} ${b.amount_jpy == null ? "要確認" : masked() ? "•••" : yen(b.amount_jpy)}`).join(" / ");
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
    // v33（外部レビューMEDIUM-04）: 前の区切りに同じ日数が無ければ比べない（短い区切りの最終日と比べていた）
    const lastSameDay = dayIdx >= 0 && dayIdx < pace.last_month.length ? pace.last_month[dayIdx] : null;
    $("kpi-income").innerHTML = `
      <div class="label"><span>今月の収入${checkMark(f, "spending")}</span><span class="asof">${esc(cur.label || cur.month || "")}</span></div>
      <div class="value">${money(yen(cur.income_jpy || 0))}</div>
      <div class="delta"><span>${f.month_basis === "payday" ? "前の区切り" : "先月"} ${money(yen(last.income_jpy || 0))}</span></div>
      <div class="spark">${sparkline(months.map((m) => m.income_jpy), "#3987e5")}</div>`;
    // カード明細は請求が確定してから取り込まれるので、今月のカード分がまだ無いときは、
    // カード明細が入っているいちばん新しい月を見せる（今月を見せると「0円」などに見えてしまう）
    const sp = f.spending || null;
    const lagging = sp && sp.focus !== sp.current;
    const fm = lagging ? sp.months.find((m) => m.month === sp.focus) : null;
    const fmPrev = lagging ? sp.months[sp.months.indexOf(fm) - 1] : null;
    const throughNote = sp && sp.card_through ? `<div class="delta"><span title="PFIは楽天カードの請求が確定した明細だけを取り込みます">カードは${md(sp.card_through)}利用分まで</span></div>` : "";
    $("kpi-expense").innerHTML = lagging && fm ? `
      <div class="label"><span>${f.month_basis === "payday" ? "前の区切り" : Number(fm.month.slice(5)) + "月"}の支出${checkMark(f, "spending")}</span><span class="asof">${esc(fm.label || fm.month)}</span></div>
      <div class="value">${money(yen(fm.total_jpy))}</div>
      <div class="delta">${fmPrev ? deltaChip(fm.total_jpy, fmPrev.total_jpy, false) + "<span>前の月比</span>" : ""}</div>
      ${throughNote}
      <div class="spark">${sparkline(sp.months.filter((m) => m.card !== "none").map((m) => m.total_jpy), "#d95926")}</div>` : `
      <div class="label"><span>今月の支出${checkMark(f, "spending")}</span><span class="asof">${esc(cur.label || cur.month || "")}</span></div>
      <div class="value">${money((cur.expense_jpy || 0) < 0 ? "−" + yen(cur.expense_jpy) : yen(cur.expense_jpy || 0))}</div>
      ${(cur.expense_jpy || 0) < 0 ? `<div class="delta"><span>返金が支出より多い（差し引きで戻り）</span></div>` : ""}
      <div class="delta">${deltaChip(cur.expense_jpy, lastSameDay, false)}<span>${f.month_basis === "payday" ? "前の区切りの同じ日数まで比" : "先月の同じ日まで比"}</span></div>
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
  const loadPref = (k, def) => { try { const v = localStorage.getItem(k); return v == null ? def : v; } catch (e) { return def; } };
  const savePref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 保存できない環境では毎回既定 */ } };
  // v36: 過去の区切り（約1年半）を選んで振り返り、比べる相手（1つ前・1年前・過去12区切りの平均）を選べる
  const PACE_CMP = [["prev", "1つ前の区切り"], ["year", "1年前の同じ時期"], ["avg", "過去12区切りの平均"], ["none", "比べない"]];
  const paceState = { view: null, cmp: null };
  function paceHistory(p) {
    if (p.history && p.history.length) return p.history;
    // 古い形式（v35まで）：今と前の区切りだけ
    return [{ month: p.last_label, label: p.last_range, series: p.last_month, card: "complete" },
            { month: p.this_label, label: p.this_range, series: p.this_month, current: true, card: "complete" }];
  }
  const paceName = (h, pay) => {
    if (!h) return "";
    const y = String(h.month || "").slice(0, 4);
    return pay ? `${y}年 ${h.label}` : `${y}年${Number(String(h.month).slice(5))}月`;
  };
  function paceCompare(hist, i, mode) {
    const v = hist[i];
    if (mode === "none" || !v) return null;
    if (mode === "prev") return i > 0 ? { h: hist[i - 1], series: hist[i - 1].series } : null;
    if (mode === "year") {
      // 開始日が1年前に最も近い区切り（±20日以内）。給料日が土日で前にずれても同じ時期を選べるように
      const t = new Date(v.start || v.month + "-01").getTime() - 365 * 864e5;
      let best = null, gap = 20 * 864e5;
      hist.slice(0, i).forEach((x) => { const g = Math.abs(new Date(x.start || x.month + "-01").getTime() - t); if (g <= gap) { gap = g; best = x; } });
      return best ? { h: best, series: best.series } : null;
    }
    // 平均：直前の12区切りのうち、カードの明細がそろい、途中からの明細でない区切りだけ
    const pool = hist.slice(Math.max(0, i - 12), i).filter((x) => x.card === "complete" && !x.data_partial);
    if (!pool.length) return null;
    // 日数の短い区切りは、最後の日のあとも合計のまま（累計なので、その区切りの支出はそれ以上増えない）として平均する
    const len = Math.max(...pool.map((x) => x.series.length)), out = [];
    for (let k = 0; k < len; k++) {
      const vals = pool.map((x) => x.series.length ? x.series[Math.min(k, x.series.length - 1)] : 0);
      out.push(Math.round(vals.reduce((s2, x) => s2 + x, 0) / vals.length));
    }
    return { avg: pool.length, series: out };
  }
  function renderPace(d) {
    const el = $("pace-chart");
    if (!d.finance.ok) { el.innerHTML = sectionError(d.finance, "家計"); $("pace-head").innerHTML = ""; $("pace-ctl").innerHTML = ""; return; }
    const p = d.finance.data.pace, hist = paceHistory(p);
    const pay = d.finance.data.month_basis === "payday";
    if (paceState.cmp == null) paceState.cmp = PACE_CMP.some(([k]) => k === loadPref("pcc-pace-cmp", "prev")) ? loadPref("pcc-pace-cmp", "prev") : "prev";
    let vi = hist.findIndex((h) => h.month === paceState.view);
    if (vi < 0) { vi = hist.length - 1; paceState.view = null; }   // 既定は今の区切り（選んだ区切りは覚えない）
    const v = hist[vi], isCur = !!v.current;
    const c = paceCompare(hist, vi, paceState.cmp);
    const a = v.series || [], b = c ? c.series : [];
    const curWord = isCur ? (pay ? "今の区切り" : "今月") : paceName(v, pay);
    const prevWord = !c ? "" : c.avg ? `過去${c.avg}区切りの平均` : paceState.cmp === "year" ? `1年前（${paceName(c.h, pay)}）`
      : isCur ? (pay ? "前の区切り" : "先月") : paceName(c.h, pay);

    $("pace-title").textContent = isCur ? "今月の支出ペース" : "支出ペースの振り返り";
    const opts = hist.map((h, i) => `<option value="${esc(h.month)}"${i === vi ? " selected" : ""}>${esc(h.current ? (pay ? "今の区切り" : "今月") + `（${h.label}）` : paceName(h, pay))}${h.card !== "complete" && !h.current ? "（カード未反映あり）" : ""}</option>`).reverse().join("");
    $("pace-ctl").innerHTML = `<label>表示 <select class="mini-select" id="pace-view" aria-label="表示する区切り">${opts}</select></label>
      <label>比べる <select class="mini-select" id="pace-cmp" aria-label="比べる相手">${PACE_CMP.map(([k, t]) => `<option value="${k}"${k === paceState.cmp ? " selected" : ""}>${t}</option>`).join("")}</select></label>
      ${isCur ? "" : `<button type="button" class="mini-select" id="pace-now">今に戻る</button>`}`;
    $("pace-view").onchange = (e) => { const h = hist.find((x) => x.month === e.target.value); paceState.view = h && !h.current ? h.month : null; renderPace(d); };
    $("pace-cmp").onchange = (e) => { paceState.cmp = e.target.value; savePref("pcc-pace-cmp", paceState.cmp); renderPace(d); };
    if ($("pace-now")) $("pace-now").onclick = () => { paceState.view = null; renderPace(d); };

    // v33（外部レビューMEDIUM-04）: 比べる相手に同じ日数が無ければ比べない
    // v36: 終わった区切りを振り返るときは、日数ではなく区切りの合計どうしで比べる
    const cur = a[a.length - 1] || 0;
    const cmp = !c || !a.length ? null : !isCur ? (b.length ? b[b.length - 1] : null) : a.length <= b.length ? b[a.length - 1] : null;
    const diff = cmp != null ? cur - cmp : null;
    const notes = [];
    const cardNote = (h, who) => {
      if (!h || h.current) return;
      if (h.card === "none") notes.push(`${who}はカードの明細がまだ入っていないため、カードの分が抜けています`);
      else if (h.card === "partial") notes.push(`${who}はカードの明細が途中までしか入っていないため、少なく見えます`);
      if (h.data_partial) notes.push(`${who}は途中からの明細しか無いため、少なく見えます`);
    };
    cardNote(v, isCur ? curWord : "この区切り");
    if (c && c.h) cardNote(c.h, "比べる区切り");
    $("pace-head").innerHTML = `<span class="big"${isCur ? "" : ` title="${esc(v.label)}の合計"`}>${money(yen(cur))}</span>
      <span class="cmp">${!c ? (paceState.cmp === "none" ? "" : paceState.cmp === "year" ? "1年前の同じ時期のデータがありません" : "比べられるデータがありません")
        : diff == null ? (a.length > b.length && b.length ? `${prevWord}は${b.length}日分しか無いため、同じ日数では比べられません` : "")
        : `${isCur ? `${prevWord}の同じ日（${a.length}日目）` : `合計は${prevWord}`}より ${money((diff > 0 ? "+" : diff < 0 ? "−" : "±") + yen(diff), diff > 0 ? "neg" : "pos")} ${diff > 0 ? "多い" : "少ない"}`}</span>
      ${c ? `<span class="cmp tot">${esc(prevWord)}の合計 ${money(yen(b[b.length - 1] || 0))}</span>` : ""}
      ${isCur ? (() => { const sp = d.finance.data.spending; return sp && sp.focus !== sp.current
        ? `<span class="cmp note">今月のカード利用はまだ入っていません（${sp.card_through ? md(sp.card_through) + "利用分まで。" : ""}来月の請求が確定して明細を取り込むと反映されます）</span>`
        : sp && sp.months.length && sp.months[sp.months.length - 1].pending_jpy
          ? `<span class="cmp">カードの未確定の速報 ${money(yen(sp.months[sp.months.length - 1].pending_jpy))} を含みます（${sp.pending_through ? md(sp.pending_through) + "利用分まで" : ""}）</span>` : ""; })() : ""}
      ${notes.map((n) => `<span class="cmp note">${esc(n)}</span>`).join("")}`;
    $("pace-legend").innerHTML = `<span><i style="background:var(--s7)"></i>${esc(curWord)}</span>` + (c ? `<span><i class="dash"></i>${esc(prevWord)}</span>` : "");

    el.innerHTML = "";
    const [W, H] = boxSize(el, 300, 90, 250), L = 46, R = 12, T = 8, B = 24;
    // v36: 給料日区切りは31日を超えることがある（以前は31日の幅に固定で、32日目以降がはみ出していた）
    const days = Math.max(31, a.length, b.length, v.days || 0), max = Math.max(1, ...a, ...b) * 1.08;
    const x = (i) => L + i / (days - 1) * (W - L - R), y = (val) => T + (1 - val / max) * (H - T - B);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(curWord)}と${esc(prevWord || "比較なし")}の累積支出">`;
    s += `<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9085e9" stop-opacity=".32"/><stop offset="1" stop-color="#9085e9" stop-opacity="0"/></linearGradient></defs>`;
    niceTicks(max, H > 200 ? 4 : 3).forEach((t) => { s += `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${compact(t)}</text>`; });
    [1, 5, 10, 15, 20, 25, 30].concat(days > 33 ? [35] : []).filter((dd) => dd <= days).forEach((dd) => { s += `<text x="${x(dd - 1)}" y="${H - 5}" text-anchor="middle">${dd}日</text>`; });
    const path = (arr) => arr.map((val, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(val).toFixed(1)).join(" ");
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
      if (i < a.length) rows.push(`<div class="tt-row"><span><i style="background:#9085e9"></i>${esc(curWord)}</span><span>${tipVal(yen(a[i]))}</span></div>`);
      if (i < b.length) rows.push(`<div class="tt-row"><span><i style="background:#7d7b8a"></i>${esc(prevWord)}</span><span>${tipVal(yen(b[i]))}</span></div>`);
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
      s += `<text x="${cx}" y="${H - 5}" text-anchor="middle">${esc(m.short || Number(m.month.slice(5)) + "月")}</text>`;
      s += `<rect x="${cx - band / 2}" y="${T}" width="${band}" height="${H - T - B}" fill="transparent" data-i="${i}" class="mhit"/>`;
    });
    el.innerHTML = s + "</svg>";
    el.querySelectorAll(".mhit").forEach((r) => {
      r.addEventListener("pointermove", (evt) => {
        const m = ms[+r.dataset.i];
        showTip(evt, `<div class="tt-title">${esc(m.label || m.month)}</div>
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
  // v31: 「その他」にまとめる前に出す項目を増やした（7→10。まとめた中身はマウスを重ねると分かる）
  const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767", "#3fa7b5", "#a8875a"];
  let donutMonth = null;
  // v38: 色を少し明るくする（中分類で、同じ大分類の項目を同じ系統の色にするため）
  const lighten = (hex, t) => {
    const n = parseInt(hex.slice(1), 16), f = (c) => Math.round(c + (255 - c) * t);
    return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, "0")).join("");
  };
  const DONUT_MAX = 11;   // 円グラフに分けて出す項目の数（残りは「その他（少額）」にまとめる）
  function donutSegments(cats, level) {
    const real = cats.filter((c) => c.category !== "uncategorized");
    const groups = new Map();
    real.forEach((c) => {
      const key = c.group || c.category, g = groups.get(key) || { key, label: c.group_label || c.label, amount_jpy: 0, count: 0, pending_jpy: 0, children: [] };
      g.amount_jpy += c.amount_jpy; g.count += c.count; g.pending_jpy += c.pending_jpy || 0; g.children.push(c);
      groups.set(key, g);
    });
    const ranked = [...groups.values()].sort((a, b) => b.amount_jpy - a.amount_jpy);
    ranked.forEach((g, i) => { g.color = SERIES[i % SERIES.length]; g.children.sort((a, b) => b.amount_jpy - a.amount_jpy); });
    let segs;
    if (level === "group") {
      segs = ranked.map((g) => ({ label: g.label, amount_jpy: g.amount_jpy, count: g.count, pending_jpy: g.pending_jpy, color: g.color,
        detail: g.children.length > 1 ? g.children.map((c) => `${c.label} ${yen(c.amount_jpy)}`).join("・") : "",
        children: g.children.length > 1 ? g.children : [] }));
    } else {
      segs = [];
      ranked.forEach((g) => g.children.forEach((c, k) => segs.push({ ...c, color: k ? lighten(g.color, Math.min(0.6, k * 0.22)) : g.color,
        detail: g.children.length > 1 ? `大分類：${g.label}` : "" })));
    }
    if (segs.length > DONUT_MAX) {
      // 金額の小さい項目を、並び（大分類ごと）を崩さずに「その他（少額）」へまとめる
      const keep = new Set([...segs].sort((a, b) => b.amount_jpy - a.amount_jpy).slice(0, DONUT_MAX - 1));
      const rest = segs.filter((x) => !keep.has(x));
      segs = segs.filter((x) => keep.has(x));
      segs.push({ label: "その他（少額）", amount_jpy: rest.reduce((a, c) => a + c.amount_jpy, 0), count: rest.reduce((a, c) => a + c.count, 0),
        pending_jpy: rest.reduce((a, c) => a + (c.pending_jpy || 0), 0), color: "#8a8796", detail: rest.map((c) => c.label).join("・") });
    }
    const unc = cats.find((c) => c.category === "uncategorized");
    if (unc) segs.push({ ...unc, label: "未分類", color: "#5f5d6b", detail: "PFIの add_category_keyword.py で分類すると内訳に入ります" });
    return segs;
  }
  function renderDonut(d) {
    const el = $("donut"), list = $("cat-list"), nav = $("donut-nav"), note = $("donut-note"), ctl = $("donut-ctl");
    if (!d.finance.ok) { el.innerHTML = sectionError(d.finance, "家計"); list.innerHTML = ""; nav.innerHTML = ""; note.textContent = ""; ctl.innerHTML = ""; return; }
    const sp = d.finance.data.spending;
    const months = sp ? sp.months : [{ month: d.today.slice(0, 7), categories: d.finance.data.categories, card: "complete" }];
    if (!donutMonth || !months.some((m) => m.month === donutMonth)) donutMonth = sp ? sp.focus : months[months.length - 1].month;
    const idx = months.findIndex((m) => m.month === donutMonth), mo = months[idx];
    const mLabel = (ym) => { const x = months.find((m) => m.month === ym); return x && x.label ? x.label : `${Number(ym.slice(5))}月`; };
    nav.innerHTML = `<button type="button" class="mini-btn" data-step="-1" ${idx <= 0 ? "disabled" : ""} aria-label="前の月">‹</button>
      <span class="mini-label">${mLabel(mo.month)}${mo.month === (sp && sp.current) ? "（今月）" : ""}</span>
      <button type="button" class="mini-btn" data-step="1" ${idx >= months.length - 1 ? "disabled" : ""} aria-label="次の月">›</button>`;
    nav.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      const j = idx + Number(b.dataset.step);
      if (months[j]) { donutMonth = months[j].month; renderDonut(d); }
    }));
    // v38: 大分類（食費＝食費＋外食 など）と中分類（PFIのカテゴリ）の切り替え。選んだ方を覚える
    const level = loadPref("pcc-donut-level", "group") === "category" ? "category" : "group";
    ctl.innerHTML = `<span class="seg-tabs" role="group" aria-label="分類の細かさ">${[["group", "大分類"], ["category", "中分類"]].map(([k, t]) =>
      `<button type="button" data-level="${k}" aria-pressed="${k === level}">${t}</button>`).join("")}</span>`;
    ctl.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { savePref("pcc-donut-level", b.dataset.level); renderDonut(d); }));
    note.textContent = [
      mo.card === "none" ? "この月のカード利用はまだ入っていません（翌月の請求が確定して明細を取り込むと反映されます）"
        : mo.card === "partial" && sp.card_through ? `カードは${md(sp.card_through)}利用分まで` : "",
      mo.pending_jpy ? `うち未確定の速報 ${yen(mo.pending_jpy)}（請求の確定後に確定値へ置き換わります）` : "",
      // v33（外部レビューMEDIUM-02）: 返金の方が多かった分野は円グラフに入らないので、別に書く
      (mo.refunds || []).length ? "返金の方が多かった分野: " + mo.refunds.map((r) => `${r.label} ${yen(r.amount_jpy)}の戻り`).join("、") : "",
    ].filter(Boolean).join("・");
    const cats = mo.categories;
    const total = cats.reduce((a, c) => a + c.amount_jpy, 0);
    const segs = donutSegments(cats, level);
    if (!total) {
      el.innerHTML = `<div class="empty">${mLabel(mo.month)}の支出データはまだありません</div>`;
    } else {
      const [W, H] = [Math.max(260, el.clientWidth || 420), window.innerWidth <= 760 ? 230 : 250];
      labeledDonut(el, segs.map((g) => ({ ...g, amount: g.amount_jpy })), total, W, H,
        [["dc1", W < 460 ? "支出" : `${mLabel(mo.month)}の支出`], ["dc2", "¥" + compact(total)]],
        (evt, g) => showTip(evt, `<div class="tt-title">${esc(g.label)}</div>${g.detail ? `<div style="color:var(--muted);font-size:12px;max-width:260px">${esc(g.detail)}</div>` : ""}
          <div class="tt-row"><span>${g.count}件・${(g.amount_jpy / total * 100).toFixed(1)}%</span><span>${tipVal(yen(g.amount_jpy))}</span></div>`),
        "支出の内訳（円グラフ）", 2);
    }
    list.innerHTML = segs.map((g) => `<li title="${esc(g.detail || "")}"><span class="sw" style="background:${g.color}"></span>
      <span>${esc(g.label)} <small style="color:var(--muted)">${g.count}件${g.pending_jpy ? "・速報含む" : ""}</small>${(g.children || []).length
        ? `<small class="cat-sub">${g.children.map((c) => `${esc(c.label)} <span class="money">${yen(c.amount_jpy)}</span>`).join("・")}</small>` : ""}</span>
      <span class="amt money">${yen(g.amount_jpy)}</span><span class="pct">${total ? Math.round(g.amount_jpy / total * 100) : 0}%</span></li>`).join("");
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
      h += `<p class="cap-note">楽天カードでの積立：今月 ${money(yen(contrib.this_month_jpy))}${contrib.this_month_pending_jpy ? `（うち速報 ${money(yen(contrib.this_month_pending_jpy))}）` : ""}・先月 ${money(yen(contrib.last_month_jpy))}（証券口座のお金からの積立は含みません）</p>`;
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
    if (R.journal && R.journal.read_error) banners += `<div class="rv-banner bad">振り返りの記録を読めません: ${esc(R.journal.read_error)}（下の記録は表示していません）</div>`;
    if (R.journal && R.journal.backup && R.journal.backup.stale) banners += `<div class="rv-banner warn">振り返りの記録の写し（data\\backups）が${R.journal.backup.latest ? esc(R.journal.backup.latest) + "から" : "まだ一度も"}作られていません。フォルダの権限・空き容量を確認してください（logs\\server.log に理由があります）</div>`;
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
  // ---------- 表の並び替え（見出しを押すたびに 降順 → 昇順 → 元の順。選んだ並びはこの端末に覚える） ----------
  const SAFETY_ORDER = { "安全": 0, "やや注意": 1, "要注意": 2 };
  const sortState = {};
  ["cand", "hold"].forEach((t) => {
    try { const v = JSON.parse(localStorage.getItem("pcc-sort-" + t) || "null"); if (v && v.key) sortState[t] = v; } catch (e) { /* 既定の並び */ }
  });
  function sortRows(table, rows, keys) {
    const st = sortState[table];
    if (!st || !keys[st.key]) return rows;
    const get = keys[st.key], dir = st.dir === "asc" ? 1 : -1;
    // 値が無いもの（—）は、どちらの向きでも最後にする
    return rows.map((r, i) => ({ r, i, v: get(r) })).sort((a, b) => {
      const an = a.v == null || a.v === "", bn = b.v == null || b.v === "";
      if (an || bn) return an === bn ? a.i - b.i : an ? 1 : -1;
      const c = typeof a.v === "string" ? a.v.localeCompare(b.v, "ja") : a.v - b.v;
      return c ? c * dir : a.i - b.i;
    }).map((x) => x.r);
  }
  function sortHead(table, key, label, cls = "", title = "") {
    const st = sortState[table], on = st && st.key === key;
    const mark = on ? (st.dir === "asc" ? " ▲" : " ▼") : "";
    return `<th class="${cls} sortable${on ? " sorted" : ""}" data-sort-table="${table}" data-sort-key="${key}"${title ? ` title="${esc(title)}"` : ""}
      aria-sort="${on ? (st.dir === "asc" ? "ascending" : "descending") : "none"}"><button type="button">${label}${mark}</button></th>`;
  }
  function bindSort(el, d) {
    el.querySelectorAll("th[data-sort-key]").forEach((th) => th.querySelector("button").addEventListener("click", () => {
      const t = th.dataset.sortTable, k = th.dataset.sortKey, st = sortState[t];
      sortState[t] = !st || st.key !== k ? { key: k, dir: "desc" } : st.dir === "desc" ? { key: k, dir: "asc" } : null;
      try { localStorage.setItem("pcc-sort-" + t, JSON.stringify(sortState[t])); } catch (e) { /* noop */ }
      renderStocks(d);
    }));
  }
  const alertTime = (a) => a && a.date ? toDate(a.date).getTime() : null;

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
    const candRows = sortRows("cand", s.candidates, {
      name: (c) => c.name || c.code, price: (c) => c.change_pct ?? null, yield: (c) => c.yield_pct,
      target: (c) => c.to_target_pct, score: (c) => c.buy_score != null && c.buy_score_max ? c.buy_score / c.buy_score_max : null,
      safety: (c) => SAFETY_ORDER[c.dividend_safety] ?? null, signal: (c) => alertTime(c.signal),
    });
    $("cand-table").innerHTML = `<thead><tr>${sortHead("cand", "name", "銘柄")}${sortHead("cand", "price", "株価", "num", "前日比で並び替え")}${sortHead("cand", "yield", "利回り", "num", `予想年間配当÷今の株価。${minY}%以上を緑で表示`)}${sortHead("cand", "target", "目標まで", "num hide-sm")}${sortHead("cand", "score", "買い条件")}${sortHead("cand", "safety", "配当", "hide-sm hide-ov", "安全→要注意の順（降順は要注意から）")}${sortHead("cand", "signal", "直近の通知", "", "通知の新しさで並び替え")}</tr></thead><tbody>` +
      (candRows.length ? candRows.map((c) => {
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
    const holdRows = sortRows("hold", s.holdings, {
      name: (h) => h.name || h.code, price: (h) => h.change_pct ?? null,
      value: (h) => h.value_now_jpy ?? h.market_value_jpy, profit: (h) => h.vs_cost_pct ?? (h.profit_now_jpy ?? h.unrealized_profit_jpy),
      yield: (h) => h.yield_pct, safety: (h) => SAFETY_ORDER[h.dividend_safety] ?? null, signal: (h) => alertTime(h.latest_alert),
    });
    $("hold-table").innerHTML = `<thead><tr>${sortHead("hold", "name", "銘柄")}${sortHead("hold", "price", "株価", "num", "前日比で並び替え")}${sortHead("hold", "value", "評価額", "num")}${sortHead("hold", "profit", "損益", "num hide-sm", "損益率で並び替え")}${sortHead("hold", "yield", "利回り", "num", "予想年間配当÷今の株価")}${sortHead("hold", "safety", "配当", "hide-sm", "安全→要注意の順（降順は要注意から）")}${sortHead("hold", "signal", "直近の通知", "", "通知の新しさで並び替え")}</tr></thead><tbody>` +
      (holdRows.length ? holdRows.map((h) => {
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

    bindSort($("cand-table"), d);
    bindSort($("hold-table"), d);
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

  // ---------- 配当（銘柄・業種・口座ごとの割合。ツリーマップ） ----------
  const divState = { tax: loadPref("pcc-div-tax", "after"), group: loadPref("pcc-div-group", "stock"), basis: loadPref("pcc-div-basis", "value"),
    other: Number(loadPref("pcc-div-other", "2")), view: loadPref("pcc-div-view", "donut") };
  if (!["donut", "treemap"].includes(divState.view)) divState.view = "donut";
  if (!(divState.other >= 0 && divState.other <= 10)) divState.other = 2;

  // 面積が値に比例する長方形に分ける（squarified treemap）
  function squarify(values, x, y, w, h) {
    const out = [], total = values.reduce((a, v) => a + v, 0);
    if (!total || w <= 0 || h <= 0) return out;
    const scale = (w * h) / total;
    let items = values.map((v, i) => ({ i, a: v * scale })), rect = { x, y, w, h };
    const worst = (row, side) => {
      const s = row.reduce((a, r) => a + r.a, 0), mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a));
      return Math.max(side * side * mx / (s * s), (s * s) / (side * side * mn));
    };
    while (items.length) {
      const side = Math.min(rect.w, rect.h);
      let row = [items[0]], k = 1;
      while (k < items.length && worst(row.concat(items[k]), side) <= worst(row, side)) { row.push(items[k]); k++; }
      const s = row.reduce((a, r) => a + r.a, 0);
      if (rect.w >= rect.h) {
        const cw = s / rect.h; let cy = rect.y;
        row.forEach((r) => { const ch = r.a / cw; out[r.i] = { x: rect.x, y: cy, w: cw, h: ch }; cy += ch; });
        rect = { x: rect.x + cw, y: rect.y, w: rect.w - cw, h: rect.h };
      } else {
        const ch = s / rect.w; let cx = rect.x;
        row.forEach((r) => { const cw = r.a / ch; out[r.i] = { x: cx, y: rect.y, w: cw, h: ch }; cx += cw; });
        rect = { x: rect.x, y: rect.y + ch, w: rect.w, h: rect.h - ch };
      }
      items = items.slice(k);
    }
    return out;
  }

  function renderDividends(d) {
    const top = $("div-top"), map = $("div-map"), note = $("div-note");
    const st = d.stocks, b = st && st.ok ? st.data.dividend_breakdown : null;
    const seg = (id, opts, key, prefKey) => {
      $(id).innerHTML = opts.map(([v, label]) => `<button type="button" data-v="${v}" aria-pressed="${divState[key] === v}">${label}</button>`).join("");
      $(id).querySelectorAll("button").forEach((btn) => btn.onclick = () => { divState[key] = btn.dataset.v; savePref(prefKey, btn.dataset.v); renderDividends(d); });
    };
    seg("div-tax", [["pre", "税引前"], ["after", "税引後"]], "tax", "pcc-div-tax");
    seg("div-group", [["stock", "銘柄"], ["category", "業種"], ["account", "口座"], ["yield", "利回り"]], "group", "pcc-div-group");
    seg("div-view", [["donut", "円グラフ"], ["treemap", "ツリーマップ"]], "view", "pcc-div-view");
    $("div-other-val").textContent = divState.other.toFixed(1) + "%";
    document.querySelectorAll("#div-card [data-other]").forEach((btn) => btn.onclick = () => {
      divState.other = Math.min(10, Math.max(0, Math.round((divState.other + 0.5 * Number(btn.dataset.other)) * 10) / 10));
      savePref("pcc-div-other", String(divState.other)); renderDividends(d);
    });
    if (!st || !st.ok) { top.innerHTML = ""; map.innerHTML = sectionError(st || {}, "配当"); note.textContent = ""; return; }
    if (!b || !b.items.length) { top.innerHTML = ""; map.innerHTML = `<div class="empty">配当の見込みを計算できる保有銘柄がありません</div>`; note.textContent = ""; return; }
    const key = divState.tax === "pre" ? "pre_tax_jpy" : "after_tax_jpy", taxKey = divState.tax === "pre" ? "pre_tax" : "after_tax";
    const total = b[key], yl = b.yield[divState.basis] ? b.yield[divState.basis][taxKey] : null;
    const base = divState.basis === "value" ? b.value_jpy : b.cost_jpy;
    top.innerHTML = `<span class="big money">${yen(total)}</span>
      <span class="yl">年間（見込み）・${divState.tax === "pre" ? "税引前" : `税引後（${b.tax_rate_pct}%。NISAは非課税）`}</span>
      <span class="yl">利回り <b>${yl == null ? "—" : yl.toFixed(2) + "%"}</b>
        <span class="seg-tabs" id="div-basis" role="group" aria-label="利回りの基準" style="margin-left:6px"></span>
        <small>（${divState.basis === "value" ? "評価額" : "取得額"} ${money(yen(base))}）</small></span>`;
    seg("div-basis", [["value", "評価額"], ["cost", "取得額"]], "basis", "pcc-div-basis");

    let groups;
    if (divState.group === "account") {
      groups = b.accounts.map((a) => ({ label: a.label, amount: a[key], detail: "" }));
    } else if (divState.group === "yield") {
      // v34: 利回りの帯ごと（評価額・取得額の切り替えに合わせる）
      const bands = [["5%以上", 5], ["4〜5%", 4], ["3.5〜4%", 3.5], ["3〜3.5%", 3], ["3%未満", -Infinity]];
      const m = new Map();
      b.items.forEach((i) => {
        const basisJpy = divState.basis === "value" ? i.value_jpy : i.cost_jpy;
        const y = basisJpy ? i.pre_tax_jpy / basisJpy * 100 : null;
        const label = y == null ? "利回り不明" : bands.find(([, lo]) => y >= lo)[0];
        const g = m.get(label) || { label, amount: 0, names: [] }; g.amount += i[key]; g.names.push(i.name || i.code); m.set(label, g);
      });
      groups = [...m.values()].map((g) => ({ label: g.label, amount: g.amount, detail: g.names.join("・") }));
    } else if (divState.group === "category") {
      const m = new Map();
      b.items.forEach((i) => { const g = m.get(i.category) || { label: i.category, amount: 0, names: [] }; g.amount += i[key]; g.names.push(i.name); m.set(i.category, g); });
      groups = [...m.values()].map((g) => ({ label: g.label, amount: g.amount, detail: g.names.join("・") }));
    } else {
      groups = b.items.map((i) => ({ label: i.name || i.code, amount: i[key], detail: `${i.code}${i.yutai ? "・優待目的" : ""}` }));
    }
    groups = groups.filter((g) => g.amount > 0).sort((x, y) => y.amount - x.amount);
    const sum = groups.reduce((a, g) => a + g.amount, 0);
    const big = groups.filter((g) => g.amount / sum * 100 >= divState.other), small = groups.filter((g) => g.amount / sum * 100 < divState.other);
    const cells = big.map((g, i) => ({ ...g, color: SERIES[i % SERIES.length] }));
    if (small.length) cells.push({ label: `その他（${small.length}）`, amount: small.reduce((a, g) => a + g.amount, 0),
      detail: small.map((g) => g.label).join("・"), color: "#5f5d6b" });
    const W = map.clientWidth || 600, H = map.clientHeight || 260;
    map.classList.toggle("is-donut", divState.view === "donut");
    const tip = (evt, c) => showTip(evt, `<div class="tt-title">${esc(c.label)}</div>${c.detail ? `<div style="color:var(--muted);font-size:12px;max-width:260px">${esc(c.detail)}</div>` : ""}<div class="tt-row"><span>${(c.amount / sum * 100).toFixed(1)}%</span><span>${tipVal(yen(c.amount))}</span></div>`);
    if (divState.view === "donut") {
      renderDivDonut(map, cells, sum, W, H, divState.tax === "pre" ? "税引前" : "税引後", tip);
    } else {
    const rects = squarify(cells.map((c) => c.amount), 0, 0, W, H);
    map.innerHTML = cells.map((c, i) => { const r = rects[i]; if (!r) return "";
      const p = c.amount / sum * 100, tiny = r.w < 46 || r.h < 34;
      return `<div class="tm${tiny ? " small" : ""}" data-i="${i}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background:${c.color}">
        <span class="n">${esc(c.label)}</span><span class="p">${p.toFixed(1)}%</span></div>`; }).join("");
    map.querySelectorAll(".tm").forEach((el) => {
      el.addEventListener("pointermove", (evt) => { const c = cells[+el.dataset.i];
        showTip(evt, `<div class="tt-title">${esc(c.label)}</div>${c.detail ? `<div style="color:var(--muted);font-size:12px;max-width:260px">${esc(c.detail)}</div>` : ""}<div class="tt-row"><span>${(c.amount / sum * 100).toFixed(1)}%</span><span>${tipVal(yen(c.amount))}</span></div>`); });
      el.addEventListener("pointerleave", hideTip);
    });
    }
    note.textContent = [
      b.unknown.length ? `1株配当が分からない${b.unknown.length}銘柄（${b.unknown.slice(0, 4).map((u) => u.name || u.code).join("・")}${b.unknown.length > 4 ? "…" : ""}）は含みません` : "",
      (b.trailing || []).length ? `${b.trailing.slice(0, 3).map((u) => u.name || u.code).join("・")}${b.trailing.length > 3 ? " ほか" : ""}は予想が無いため直近1年の実績の分配金で計算` : "",
      "予想配当×株数の見込み。投資信託の分配金は含みません",
    ].filter(Boolean).join("。");
  }

  // v34: 配当の円グラフ（ドーナツ）。輪の中に割合、外に名前（引き出し線つき）、真ん中に合計
  function renderDivDonut(el, cells, sum, W, H, taxLabel, tip) {
    labeledDonut(el, cells, sum, W, H, [["dc1", taxLabel], ["dc1", "配当金額"], ["dc2", tipVal(yen(sum))]], tip, "配当の内訳（円グラフ）");
  }

  // v38: 引き出し線つきの円グラフ（配当・支出の内訳で共通）。cells: [{label, amount, color}]
  // center: 真ん中に出す行 [[クラス, 文字], ...]。minLabelPct 未満の小さい部分は名前を出さない（なぞると出る）
  function labeledDonut(el, cells, sum, W, H, center, tip, aria, minLabelPct = 0) {
    const cx = W / 2, cy = H / 2, narrow = W < 460;
    const ro = Math.max(50, Math.min(H / 2 - 14, W / 2 - (narrow ? 108 : 135))), ri = ro * 0.58;
    const pt = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    let a0 = 0, s = "";
    const labels = [];
    cells.forEach((c, i) => {
      const frac = sum ? c.amount / sum : 0, a1 = a0 + frac * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0;
      const e = Math.min(a1, a0 + Math.PI * 2 - 1e-4);
      const [x0, y0] = pt(ro, a0), [x1, y1] = pt(ro, e), [x2, y2] = pt(ri, e), [x3, y3] = pt(ri, a0);
      s += `<path class="dseg" data-i="${i}" d="M${x0},${y0} A${ro},${ro} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${ri},${ri} 0 ${large} 0 ${x3},${y3} Z" fill="${c.color}" stroke="var(--card)" stroke-width="1.5"/>`;
      const mid = (a0 + a1) / 2, p = frac * 100;
      if (p >= 3) { const [tx, ty] = pt((ro + ri) / 2, mid); s += `<text class="dpct" x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central">${p.toFixed(1)}</text>`; }
      if (p >= minLabelPct) labels.push({ i, mid, right: Math.sin(mid) >= 0, y: pt(ro + 14, mid)[1], text: c.label });
      a0 = a1;
    });
    // 外の名前は、左右ごとに上から並べ、重ならないように少しずつずらす
    const gap = 13;
    [true, false].forEach((side) => {
      const ls = labels.filter((l) => l.right === side).sort((p, q) => p.y - q.y);
      let last = -Infinity;
      ls.forEach((l) => { l.y = Math.max(l.y, last + gap, 8); last = l.y; });
      for (let k = ls.length - 1, lim = H - 6; k >= 0; k--) { if (ls[k].y > lim) ls[k].y = lim; lim = ls[k].y - gap; }
      ls.forEach((l) => {
        const [ex, ey] = pt(ro + 2, l.mid), [bx, by] = pt(ro + 12, l.mid);
        const lx = cx + (side ? 1 : -1) * (ro + 22);
        const max = narrow ? 8 : 12, name = l.text.length > max ? l.text.slice(0, max) + "…" : l.text;
        s += `<polyline class="dline" points="${ex},${ey} ${bx},${by} ${lx},${l.y}" fill="none"/>`;
        s += `<text class="dname" data-i="${l.i}" x="${lx + (side ? 3 : -3)}" y="${l.y}" text-anchor="${side ? "start" : "end"}" dominant-baseline="central">${esc(name)}</text>`;
      });
    });
    const y0 = cy - (center.length - 1) * 9;
    center.forEach(([cls, text], k) => {
      s += `<text class="${cls}" x="${cx}" y="${y0 + k * 17 + (cls === "dc2" ? 3 : 0)}" text-anchor="middle" dominant-baseline="central">${esc(text)}</text>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(aria)}">${s}</svg>`;
    el.querySelectorAll(".dseg, .dname").forEach((node) => {
      node.addEventListener("pointermove", (evt) => tip(evt, cells[+node.dataset.i]));
      node.addEventListener("pointerleave", hideTip);
    });
  }

  // ---------- reminders ----------
  function renderReminders(d) {
    const el = $("reminders"), t = d.tasks;
    if (!t || !t.ok) { el.innerHTML = sectionError(t || {}, "タスク"); $("rem-sub").textContent = ""; return; }
    const r = t.data, err = r.last_error;
    $("rem-sub").textContent = `${r.total}件・${hoursAgo(r.age_hours)}取得` + (err ? (err.kind === "reauth_required" ? "・再認証が必要" : "・前回の取得に失敗") : "");
    const groups = [["overdue", "期限切れ"], ["today", "今日まで"], ["week", "1週間以内"], ["nodue", "期限なし"], ["later", "それ以降"]];
    const bucketLabel = Object.fromEntries(groups);
    const sel = $("rem-sort");
    let mode = "due";
    try { mode = localStorage.getItem("pcc-rem-sort") || "due"; } catch (e) { /* 既定 */ }
    if (![...sel.options].some((o) => o.value === mode)) mode = "due";
    sel.value = mode;
    sel.onchange = () => { try { localStorage.setItem("pcc-rem-sort", sel.value); } catch (e) { /* noop */ } renderReminders(d); };
    const item = (i, tag) => `
        <div class="rem ${i.flagged ? "flag" : ""}"><span>${i.flagged ? "⚑ " : ""}${esc(i.title)}${i.list ? `<span class="rl">${esc(i.list)}${i.priority ? "・優先度 " + esc(i.priority) : ""}${i.estimated_minutes ? "・" + i.estimated_minutes + "分" : ""}</span>` : ""}</span>
        <span class="rm">${tag ? `<span class="rem-tag ${i.bucket}">${esc(bucketLabel[i.bucket] || "")}</span>` : ""}${i.due ? md(i.due) + (i.due_time ? " " + esc(i.due_time) : "") : ""}</span></div>`;
    const dueKey = (i) => i.due ? i.due + " " + (i.due_time || "99:99") : null;
    let html;
    if (mode === "due") {
      html = groups.map(([k, label]) => {
        const its = r.items.filter((i) => i.bucket === k);
        if (!its.length) return "";
        return `<div class="rem-group"><h4 class="${k}">${label}<span class="count">${its.length}</span></h4>${its.map((i) => item(i, false)).join("")}</div>`;
      }).join("");
    } else {
      const PRI = { "高": 0, "中": 1, "低": 2 };
      const cmp = {
        due_desc: (a, b) => (dueKey(a) == null) - (dueKey(b) == null) || (dueKey(b) || "").localeCompare(dueKey(a) || ""),
        priority: (a, b) => (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0) || (PRI[a.priority] ?? 9) - (PRI[b.priority] ?? 9)
          || (dueKey(a) == null) - (dueKey(b) == null) || (dueKey(a) || "").localeCompare(dueKey(b) || ""),
        name: (a, b) => a.title.localeCompare(b.title, "ja"),
      }[mode];
      html = `<div class="rem-group">${[...r.items].sort(cmp).map((i) => item(i, true)).join("")}</div>`;
    }
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
    renderStocks, renderDividends, renderFunds, renderReminders, renderWeek, renderStatus, renderChecks, renderRetro];
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
  const rerenderCharts = () => { if (last) { try { renderPace(last); renderMonths(last); renderDonut(last); renderDividends(last); } catch (e) { console.error(e); } } };

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
    if (last) renderAll(last);   // title・ツールチップなど、描いた時点の文字にも反映する
  });
  $("refresh").addEventListener("click", () => load(true));

  // グラフは入れ物の大きさに合わせて描き直す
  let rt;
  const schedule = () => { clearTimeout(rt); rt = setTimeout(rerenderCharts, 120); };
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(schedule);
    ro.observe($("pace-card")); ro.observe($("months-card")); ro.observe($("div-card"));
  } else {
    window.addEventListener("resize", schedule);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(false); });
  setInterval(() => { if (!document.hidden) load(false); }, 5 * 60 * 1000);
  load(false);
})();
