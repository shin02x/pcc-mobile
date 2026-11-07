"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const yen = (v) => (v === null || v === undefined) ? "—" : "¥" + Math.round(Math.abs(v)).toLocaleString("ja-JP");
  const signedYen = (v) => (v === null || v === undefined) ? "—" : (v < 0 ? "−" : v > 0 ? "+" : "") + yen(v);
  const money = (html, cls = "") => `<span class="money ${cls}">${html}</span>`;
  // v46: ほかのツールから来る説明文の中の金額（「固定費の残り（130,000円のうち）」など）も、金額を隠す設定でぼかす
  // v48・v49: ほかのツールから来る文・自分で書いた文の中の金額と数量を、金額を隠す設定でぼかす（その部分だけ money で包む）。
  // 拾うもの：「¥123,456」「−¥5,000」「¥-5,000」「JPY 5000」「123,456 円」「1.2万円」「12万3千円」「1億2,000万円」、全角数字（「５００円」「￥１２３」）、
  // 株数・口数（「100株」「100口」）。拾わないもの：日付（11/27）・割合（3.5%）・銘柄コード（8058）・「25日」「1年」など単位の違う数
  const MONEY_RE = (() => {
    const n = "[0-9０-９][0-9０-９,，]*(?:[.．][0-9０-９]+)?";
    const big = `${n}(?:\\s*[億万千](?:${n})?)*`;   // 12万3千・1億2,000万
    return new RegExp([
      `[-−＋+]?\\s?[¥￥]\\s?[-−]?${big}`,           // ¥123,456・−¥5,000・￥１２３・¥12万
      `(?:JPY|ＪＰＹ)\\s?[-−]?${n}`,                   // JPY 5000
      `[-−]?${big}\\s*円`,                            // 123,456 円・12万3千円・５００円
      `${n}\\s*(?:株|口(?!座))`,                       // 100株・100口（「2口座」は数量ではない）
    ].join("|"), "g");
  })();
  const escMoney = (text) => esc(text).replace(MONEY_RE, (m) => money(m));
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
    return `<span class="chip money ${flat ? "flat" : good ? "up" : "down"}">${flat ? "→" : p >= 0 ? "▲" : "▼"} ${Math.abs(p).toFixed(1)}%</span>`;
  }

  // ---------- v54: 各タブの上の主な数字（アイコン付きのカード4枚） ----------
  const ICON = {
    wallet: '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1z"/><path d="M4 7l11-3v3M16 13.5h2"/>',
    cart: '<path d="M3 4h2l2.2 10.5h10.6L20 7H7"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
    bars: '<path d="M5 20V12M10 20V8M15 20v-6M20 20V5"/>',
    coins: '<ellipse cx="9" cy="7" rx="5" ry="2.4"/><path d="M4 7v4c0 1.3 2.2 2.4 5 2.4s5-1.1 5-2.4V7"/><path d="M10 15.6c.9 1 2.6 1.6 5 1.6 2.8 0 5-1.1 5-2.4v-4c0-1.3-2.2-2.4-5-2.4"/>',
    income: '<path d="M12 19V5M6 11l6-6 6 6"/><path d="M5 20h14"/>',
    piggy: '<path d="M5 11a6 5 0 0 1 11-2.5h2l1 2.5v3l-2 .5-1 3h-2.5l-.5-1.5h-3l-.5 1.5H7l-.8-2.6A5 5 0 0 1 5 11z"/><circle cx="14.5" cy="10.5" r=".6"/>',
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    trend: '<path d="M4 17l5-5 4 3 7-8"/><path d="M15 7h5v5"/>',
    pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    week: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 14h2M12 14h2M16 14h0"/>',
    check: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
    data: '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6"/>',
    run: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    card: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>',
    note: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h5"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name] || ICON.bars}</svg>`;
  // 増減の行（↑ +¥52,000 前回比 +4.4%）。金額・割合は自分の成績なので money で包む（隠す設定でぼかす）
  function deltaLine(cur, prev, goodWhenUp, label, withPct = true) {
    if (cur == null || prev == null) return label ? `<span class="kc-note">${label}</span>` : "";
    const diff = cur - prev, p = prev ? diff / Math.abs(prev) * 100 : null;
    const flat = diff === 0, good = (diff > 0) === goodWhenUp;
    const tone = flat ? "flat" : good ? "up" : "down";
    return `<span class="kc-delta ${tone}"><b>${flat ? "→" : diff > 0 ? "↑" : "↓"}</b>${money(signedYen(diff))}</span>`
      + `<span class="kc-note">${label}${withPct && p != null && isFinite(p) ? " " + money((p > 0 ? "+" : p < 0 ? "−" : "±") + Math.abs(p).toFixed(1) + "%") : ""}</span>`;
  }
  // 1枚のカード。value・sub はHTML（呼ぶ側でエスケープ・money 済み）
  const kpiCard = (o) => `<article class="kc tone-${o.tone || "blue"}"${o.go ? ` data-goto="${o.go}" role="link" tabindex="0" aria-label="${esc(o.label.replace(/<[^>]+>/g, ""))}（${esc(VIEW_TITLE[o.go] || "")}を開く）"` : ""}>
      <span class="kc-ic">${icon(o.icon)}</span>
      <div class="kc-body"><div class="kc-l"><span>${o.label}</span>${o.asof ? `<small>${esc(o.asof)}</small>` : ""}</div>
        <div class="kc-v">${o.value}</div><div class="kc-s">${o.sub || ""}</div>${o.sub2 ? `<div class="kc-s">${o.sub2}</div>` : ""}</div>
      ${o.go ? `<span class="kc-go" aria-hidden="true">›</span>` : ""}</article>`;
  const naCard = (o, why) => kpiCard({ ...o, value: `<span class="stale-tag">${esc(why)}</span>`, sub: "" });

  // 家計の数字（ホーム・家計で共通に使う）
  function moneyFacts(d) {
    const fin = d.finance;
    if (!fin.ok) return null;
    const f = fin.data, banks = f.banks || { items: [] };
    const cut = new Date(toDate(d.today) - 30 * 864e5).toISOString().slice(0, 10);
    const before = (f.balance_series || []).filter((p) => p.date <= cut);
    const months = f.months || [], cur = months[months.length - 1] || {}, prevM = months[months.length - 2] || {};
    const pace = f.pace || { this_month: [], last_month: [] };
    const dayIdx = pace.this_month.length - 1;
    // v33（外部レビューMEDIUM-04）: 前の区切りに同じ日数が無ければ比べない（短い区切りの最終日と比べていた）
    const lastSameDay = dayIdx >= 0 && dayIdx < pace.last_month.length ? pace.last_month[dayIdx] : null;
    const pf = f.portfolio || {};
    return { f, banks, prev30: before.length ? before[before.length - 1].amount_jpy : null, cur, prevM, lastSameDay,
      payday: f.month_basis === "payday", lt: pf.latest || {}, pv: pf.previous || {},
      acc: ((f.charge_check || {}).accounts || [])[0] };
  }
  const sameDayLabel = (m) => m.payday ? "前の区切りの同じ日数まで比" : "先月の同じ日まで比";
  function expenseCard(m, go) {
    const e = m.cur.expense_jpy || 0;
    return kpiCard({ icon: "cart", tone: "red", label: `今月の支出${checkMark(m.f, "spending")}`, asof: m.cur.label || "", go,
      value: money(e < 0 ? "−" + yen(e) : yen(e)),
      sub: deltaLine(e, m.lastSameDay, false, sameDayLabel(m)),
      // v55: 明細がどこまでそろっているかを、数字のすぐ下に出す
      sub2: [m.cur.pending_expense_jpy ? `<span class="kc-note">うち速報（未確定）${money(yen(m.cur.pending_expense_jpy))}</span>` : "",
        m.f.spending && m.f.spending.card_through ? `<span class="kc-note">カードは${md(m.f.spending.card_through)}利用分まで</span>` : ""].join("") });
  }
  function balanceCard(m, go) {
    const t = m.banks.total_jpy, n = m.banks.items.length;
    const o = { icon: "wallet", tone: "blue", label: `現金（銀行）${checkMark(m.f, "balance")}`,
      asof: m.banks.oldest_as_of ? md(m.banks.oldest_as_of) + "時点" : "", go };
    if (t == null) return naCard(o, n ? "要確認" : "データなし");
    const after = m.acc ? (m.acc.after_jpy == null ? `<span class="kc-note">次の引き落とし後は判定できません</span>`
      : `<span class="kc-note">引き落とし後（${esc(m.acc.label)}）${money(yen(m.acc.after_jpy), m.acc.after_jpy < 0 ? "neg" : "")}</span>`) : "";
    return kpiCard({ ...o, value: money(yen(t)), sub: deltaLine(t, m.prev30, true, "30日前比" + (m.banks.complete ? "" : "（一部要確認）")), sub2: after });
  }
  function investCard(m, go, label = "投資資産") {
    const o = { icon: "bars", tone: "violet", label: `${label}${checkMark(m.f, "assets")}`, asof: m.lt.date ? md(m.lt.date) + "時点" : "", go };
    if (m.lt.total_assets_jpy == null) return naCard(o, m.lt.date ? "要確認" : "データなし");
    const up = m.lt.unrealized_profit_jpy;
    return kpiCard({ ...o, value: money(yen(m.lt.total_assets_jpy)), sub: deltaLine(m.lt.total_assets_jpy, m.pv.total_assets_jpy, true, "前回比"),
      sub2: up != null ? `<span class="kc-note">含み損益 ${money(signedYen(up), up >= 0 ? "pos" : "neg")}</span>` : "" });
  }
  // 配当の目標の判定（優待目的を除いた配当株・取得額ベース。stock-watchlistと同じ決まり）
  function dividendGoalText(sd) {
    const g = sd.goal;
    const tip = "優待目的の銘柄を除いた配当株の、予想年間配当の合計÷取得額の合計（stock-watchlistの目標の判定と同じ）。時価は今の株価での利回り（参考）";
    if (!g) return sd.all && sd.all.yield_pct != null ? `<span class="kc-note">配当利回り（時価）${money(sd.all.yield_pct.toFixed(2) + "%")}</span>` : "";
    const ref = sd.ex_yutai && sd.ex_yutai.yield_pct != null ? sd.ex_yutai.yield_pct : sd.all && sd.all.yield_pct;
    const refTxt = ref != null ? `・時価 ${money(ref.toFixed(2) + "%")}` : "";
    if (g.verdict === "hold") {
      const names = g.unknown.slice(0, 2).map((u) => u.name || u.code).join("・") + (g.unknown.length > 2 ? " ほか" : "");
      return `<span class="kc-note" title="${esc(tip)}">配当利回り（取得額）${g.yield_pct != null ? money(g.yield_pct.toFixed(2) + "%") : "—"}・目標${sd.target_pct}%は判定保留（${esc(names)}の配当が不明）${refTxt}</span>`;
    }
    if (g.verdict === "none") return "";
    return `<span class="kc-note" title="${esc(tip)}">配当利回り（取得額）${money(g.yield_pct.toFixed(2) + "%", g.verdict === "met" ? "pos" : "low")}・目標${sd.target_pct}%${g.verdict === "met" ? "達成" : "未達"}${refTxt}</span>`;
  }
  function dividendCard(d, go) {
    const o = { icon: "coins", tone: "gold", label: "配当見込み（年額）", go };
    const sd = d.stocks && d.stocks.ok ? d.stocks.data.dividend_summary : null;
    if (!sd || !sd.all) return naCard(o, d.stocks && d.stocks.ok ? "データなし" : "株の情報なし");
    return kpiCard({ ...o, asof: "税引前", value: money(yen(sd.all.annual_jpy)), sub: dividendGoalText(sd),
      sub2: sd.all.unknown ? `<span class="kc-note">配当が分からない銘柄 ${Number(sd.all.unknown)}件は含まず</span>` : "" });
  }

  function renderKpiRow(d) {
    const row = $("kpi-row"), v = document.body.dataset.view;
    if (!row || !d) return;
    let cards = [];
    const m = moneyFacts(d);
    const finErr = () => [kpiCard({ icon: "alert", tone: "red", label: "家計", value: `<span class="stale-tag">表示できません</span>`, sub: `<span class="kc-note">${esc(d.finance.error || "")}</span>` })];
    if (v === "overview") {
      cards = m ? [balanceCard(m, "money"), expenseCard(m, "money"), investCard(m, "stocks"), dividendCard(d, "stocks")] : finErr().concat([dividendCard(d, "stocks")]);
    } else if (v === "money") {
      if (!m) cards = finErr();
      else {
        const inc = m.cur.income_jpy || 0, net = m.cur.net_jpy != null ? m.cur.net_jpy : inc - (m.cur.expense_jpy || 0);
        const prevNet = m.prevM.net_jpy != null ? m.prevM.net_jpy : (m.prevM.income_jpy != null ? m.prevM.income_jpy - (m.prevM.expense_jpy || 0) : null);
        const inv = m.f.investable || {};
        cards = [
          kpiCard({ icon: "income", tone: "blue", label: `今月の収入${checkMark(m.f, "spending")}`, asof: m.cur.label || "", value: money(yen(inc)),
            sub: deltaLine(inc, m.prevM.income_jpy, true, m.payday ? "前の区切り比" : "先月比") }),
          expenseCard(m),
          kpiCard({ icon: "piggy", tone: "green", label: "今月の収支", asof: m.cur.label || "", value: money(signedYen(net), net >= 0 ? "pos" : "neg"),
            sub: `<span class="kc-note">収入−支出・前の区切り ${prevNet == null ? "—" : money(signedYen(prevNet))}</span>` }),
          inv.status === "ok"
            ? kpiCard({ icon: "shield", tone: "teal", label: "投資余力", asof: inv.next_payday ? `次の給料日 ${md(inv.next_payday)}` : "",
              value: money(yen(inv.investable_jpy)), sub: `<span class="kc-note">生活防衛資金を残した場合</span>` })
            : kpiCard({ icon: "shield", tone: "teal", label: "投資余力", value: `<span class="stale-tag">出せません</span>`, sub: `<span class="kc-note">${esc(inv.reason || "")}</span>` }),
        ];
      }
    } else if (v === "stocks") {
      if (!m) cards = finErr().concat([dividendCard(d)]);
      else {
        const up = m.lt.unrealized_profit_jpy, tot = m.lt.total_assets_jpy, bank = m.banks.total_jpy;
        const upPct = up != null && tot != null && tot - up > 0 ? up / (tot - up) * 100 : null;
        const share = tot != null && bank != null && tot + bank > 0 ? tot / (tot + bank) * 100 : null;
        cards = [
          investCard(m, null, "評価額"),
          up == null ? naCard({ icon: "trend", tone: "red", label: "含み損益" }, "データなし")
            : kpiCard({ icon: "trend", tone: up >= 0 ? "green" : "red", label: "含み損益", asof: m.lt.date ? md(m.lt.date) + "時点" : "",
              value: money(signedYen(up), up >= 0 ? "pos" : "neg"),
              sub: upPct != null ? `<span class="kc-note">取得額に対して ${money((upPct >= 0 ? "+" : "−") + Math.abs(upPct).toFixed(1) + "%", upPct >= 0 ? "pos" : "neg")}</span>` : "",
              sub2: m.pv.unrealized_profit_jpy != null ? deltaLine(up, m.pv.unrealized_profit_jpy, true, "前回比", false) : "" }),
          dividendCard(d),
          share == null ? naCard({ icon: "pie", tone: "blue", label: "投資の割合" }, "要確認")
            : kpiCard({ icon: "pie", tone: "blue", label: "投資の割合", value: money(share.toFixed(0) + "%"),
              sub: `<span class="kc-note">現金＋評価額 ${money(yen(tot + bank))} のうち</span>` }),
        ];
      }
    } else if (v === "plan") {
      const sc = d.schedule && d.schedule.ok ? d.schedule.data : null, tk = d.tasks && d.tasks.ok ? d.tasks.data : null;
      const now = new Date(d.generated_at), hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const todayEv = sc ? ((sc.days || []).find((x) => x.is_today) || { events: [] }).events : [];
      const done = todayEv.filter((e) => !e.all_day && e.end && e.end <= hhmm).length;
      const cl = tk && tk.checklist;
      cards = [
        sc ? kpiCard({ icon: "cal", tone: "blue", label: "今日の予定", value: `${todayEv.length}<small>件</small>`,
          sub: `<span class="kc-note">終了時刻を過ぎた ${done}件・これから ${todayEv.length - done}件</span>` }) : naCard({ icon: "cal", tone: "blue", label: "今日の予定" }, "予定の情報なし"),
        sc ? kpiCard({ icon: "week", tone: "violet", label: "今週の予定", asof: `${md(sc.week_start)}〜${md(sc.week_end)}`, value: `${sc.counts.week_events}<small>件</small>`,
          sub: `<span class="kc-note">自分 ${sc.counts.own_events}件・AIが入れた予定 ${sc.counts.bot_tasks}件</span>` }) : naCard({ icon: "week", tone: "violet", label: "今週の予定" }, "予定の情報なし"),
        tk ? kpiCard({ icon: "check", tone: (tk.counts.overdue || 0) ? "red" : "teal", label: "未完了のタスク", value: `${tk.total}<small>件</small>`,
          sub: `<span class="kc-note">期限切れ ${tk.counts.overdue || 0}件・今日まで ${tk.counts.today || 0}件</span>` }) : naCard({ icon: "check", tone: "teal", label: "未完了のタスク" }, "タスクの情報なし"),
        cl && cl.total ? kpiCard({ icon: "target", tone: "gold", label: "今週のチェック", value: `${cl.done}<small>/ ${cl.total}</small>`,
          sub: `<span class="kc-note">${Math.round(cl.done / cl.total * 100)}%できた${cl.previous ? `・先週 ${cl.previous.done}/${cl.previous.total}` : ""}</span>` })
          : naCard({ icon: "target", tone: "gold", label: "今週のチェック" }, "まだありません"),
      ];
    } else if (v === "status") {
      const al = d.alerts || [], errs = al.filter((a) => a.severity === "error").length, warns = al.filter((a) => a.severity === "warn").length;
      const chk = d.finance.ok ? (d.finance.data.data_checks || {}) : {};
      const jobs = d.jobs || [], conns = d.connections || [];
      const okJobs = jobs.filter((j) => j.state === "ok").length, okConn = conns.filter((c) => c.state === "ok").length;
      const CHK = { ok: ["問題なし", "green"], needs_review: ["要確認", "gold"], failed: ["検証失敗", "red"] };
      const c = CHK[chk.overall] || ["不明", "blue"];
      cards = [
        kpiCard({ icon: "alert", tone: errs ? "red" : warns ? "gold" : "green", label: "警告", value: `${errs + warns}<small>件</small>`, sub: `<span class="kc-note">エラー ${errs}・注意 ${warns}</span>` }),
        kpiCard({ icon: "data", tone: c[1], label: "データの検証", value: `<span class="kc-word">${c[0]}</span>`, sub: `<span class="kc-note">${(chk.checks || []).length}項目を検査</span>` }),
        // v55（0ベースのレビューMEDIUM-02）: 1件も無いときは「正常」ではなく「情報なし」
        jobs.length ? kpiCard({ icon: "run", tone: okJobs === jobs.length ? "green" : "gold", label: "自動実行", value: `${okJobs}<small>/ ${jobs.length}</small>`, sub: `<span class="kc-note">正常に動いている数</span>` })
          : naCard({ icon: "run", tone: "gold", label: "自動実行" }, "情報なし"),
        conns.length ? kpiCard({ icon: "link", tone: okConn === conns.length ? "green" : "gold", label: "接続", value: `${okConn}<small>/ ${conns.length}</small>`, sub: `<span class="kc-note">つながっている数</span>` })
          : naCard({ icon: "link", tone: "gold", label: "接続" }, "情報なし"),
      ];
    }
    row.innerHTML = cards.join("");
    row.hidden = !cards.length;
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
    niceTicks(max, H > 200 ? 4 : 3).forEach((t) => { s += `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="ytick" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${compact(t)}</text>`; });
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
    // v54: 収入と支出は線、収支（収入−支出）は棒
    const CI = "#34c38f", CE = "#4c8dff", CN = "rgba(76,141,255,.35)";
    $("months-legend").innerHTML = `<span><i style="background:${CI}"></i>収入</span><span><i style="background:${CE}"></i>支出</span><span><i style="background:${CN}"></i>収支（収入−支出）</span>`;
    el.innerHTML = "";
    const [W, H] = boxSize(el, 260, 90, 220), L = 40, R = 8, T = 10, B = 22;
    const max = Math.max(1, ...ms.map((m) => Math.max(m.income_jpy, m.expense_jpy, m.net_jpy || 0))) * 1.12;
    const min = Math.min(0, ...ms.map((m) => m.net_jpy || 0)) * 1.12;
    const y = (v) => T + (max - v) / (max - min) * (H - T - B);
    const band = (W - L - R) / ms.length, bw = Math.min(26, band / 2.4);
    const cx = (i) => L + band * (i + .5);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="月別の収入・支出・収支">`;
    niceTicks(max, 3).forEach((t) => { s += `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="ytick" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${compact(t)}</text>`; });
    if (min < 0) s += `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>`;
    ms.forEach((m, i) => {
      const n = m.net_jpy || 0, top = Math.min(y(n), y(0)), h = Math.abs(y(n) - y(0));
      s += `<rect x="${cx(i) - bw / 2}" y="${top}" width="${bw}" height="${Math.max(1, h)}" rx="3" fill="${n < 0 ? "rgba(240,106,106,.45)" : CN}"/>`;
    });
    const line = (key, color) => {
      const pts = ms.map((m, i) => `${cx(i).toFixed(1)},${y(m[key] || 0).toFixed(1)}`);
      return `<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>`
        + ms.map((m, i) => `<circle cx="${cx(i)}" cy="${y(m[key] || 0)}" r="3.4" fill="${color}"/>`).join("");
    };
    s += line("income_jpy", CI) + line("expense_jpy", CE);
    ms.forEach((m, i) => {
      s += `<text x="${cx(i)}" y="${H - 5}" text-anchor="middle">${esc(m.short || Number(m.month.slice(5)) + "月")}</text>`;
      s += `<rect x="${cx(i) - band / 2}" y="${T}" width="${band}" height="${H - T - B}" fill="transparent" data-i="${i}" class="mhit"/>`;
    });
    el.innerHTML = s + "</svg>";
    el.querySelectorAll(".mhit").forEach((r) => {
      r.addEventListener("pointermove", (evt) => {
        const m = ms[+r.dataset.i];
        showTip(evt, `<div class="tt-title">${esc(m.label || m.month)}</div>
          <div class="tt-row"><span><i style="background:${CI}"></i>収入</span><span>${tipVal(yen(m.income_jpy))}</span></div>
          <div class="tt-row"><span><i style="background:${CE}"></i>支出</span><span>${tipVal(yen(m.expense_jpy))}</span></div>
          <div class="tt-row"><span><i style="background:${CN}"></i>収支</span><span>${tipVal(signedYen(m.net_jpy))}</span></div>
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
        // v41: 金額を隠す設定でも漏れないよう、説明（なぞったとき・一覧のtitle）には名前だけを入れる
        detail: g.children.length > 1 ? g.children.map((c) => c.label).join("・") : "",
        children: g.children.length > 1 ? g.children : [],
        // v43: タップで出す明細（大分類では、どの中分類かも出す）
        items: withCat(g.children, g.children.length > 1) }));
    } else {
      segs = [];
      ranked.forEach((g) => g.children.forEach((c, k) => segs.push({ ...c, color: k ? lighten(g.color, Math.min(0.6, k * 0.22)) : g.color,
        detail: g.children.length > 1 ? `大分類：${g.label}` : "", items: withCat([c], false) })));
    }
    if (segs.length > DONUT_MAX) {
      // 金額の小さい項目を、並び（大分類ごと）を崩さずに「その他（少額）」へまとめる
      const keep = new Set([...segs].sort((a, b) => b.amount_jpy - a.amount_jpy).slice(0, DONUT_MAX - 1));
      const rest = segs.filter((x) => !keep.has(x));
      segs = segs.filter((x) => keep.has(x));
      segs.push({ label: "その他（少額）", amount_jpy: rest.reduce((a, c) => a + c.amount_jpy, 0), count: rest.reduce((a, c) => a + c.count, 0),
        pending_jpy: rest.reduce((a, c) => a + (c.pending_jpy || 0), 0), color: "#8a8796", detail: rest.map((c) => c.label).join("・"),
        items: rest.flatMap((x) => x.items || []).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)) });
    }
    const unc = cats.find((c) => c.category === "uncategorized");
    if (unc) segs.push({ ...unc, label: "未分類", color: "#5f5d6b", detail: "PFIの add_category_keyword.py で分類すると内訳に入ります",
      items: withCat([unc], false) });
    return segs;
  }
  // v43: 分野の明細をまとめる（新しい日付が先）。showCatなら各行に中分類の名前を付ける
  function withCat(cats, showCat) {
    return cats.flatMap((c) => (c.items || []).map((it) => ({ ...it, cat: showCat ? c.label : "" })))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }
  const donutOpen = new Set();   // 明細を開いている項目（名前で覚える。月・分類の切り替え後も同じ名前なら開いたまま）
  function catDetailHtml(g) {
    const items = g.items || [];
    if (!items.length) return `<div class="cat-items-empty">明細はありません</div>`;
    // v43: 店名も金額と同じく、金額を隠す設定のときはぼかす（class="money"）
    return `<ol class="cat-items">${items.map((it) => `<li>
      <span class="ci-date">${md(it.date)}</span>
      <span class="ci-desc"><span class="money">${it.pending ? "速報（店名は請求の確定後に出ます）" : esc(it.desc || "（摘要なし）")}</span>
        <small>${[it.cat, it.source].filter(Boolean).map(esc).join("・")}</small></span>
      <span class="ci-amt money">${it.amount_jpy < 0 ? "返金 −" : ""}${yen(it.amount_jpy)}</span></li>`).join("")}</ol>
      ${items.length < g.count ? `<div class="cat-items-empty">ほかに${g.count - items.length}件（多いため省略）</div>` : ""}`;
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
    // v41: 金額は money() で包み、金額を隠す設定のときにぼかす（以前は文字のままで隠れなかった）
    note.innerHTML = [
      mo.card === "none" ? "この月のカード利用はまだ入っていません（翌月の請求が確定して明細を取り込むと反映されます）"
        : mo.card === "partial" && sp.card_through ? `カードは${md(sp.card_through)}利用分まで` : "",
      mo.pending_jpy ? `うち未確定の速報 ${money(yen(mo.pending_jpy))}（請求の確定後に確定値へ置き換わります）` : "",
      // v33（外部レビューMEDIUM-02）: 返金の方が多かった分野は円グラフに入らないので、別に書く
      (mo.refunds || []).length ? "返金の方が多かった分野: " + mo.refunds.map((r) => `${esc(r.label)} ${money(yen(r.amount_jpy))}の戻り`).join("、") : "",
    ].filter(Boolean).join("・");
    const cats = mo.categories;
    const total = cats.reduce((a, c) => a + c.amount_jpy, 0);
    const segs = donutSegments(cats, level);
    if (!total) {
      el.innerHTML = `<div class="empty">${mLabel(mo.month)}の支出データはまだありません</div>`;
    } else {
      const [W, H] = [Math.max(260, el.clientWidth || 420), window.innerWidth <= 760 ? 230 : 250];
      labeledDonut(el, segs.map((g) => ({ ...g, amount: g.amount_jpy })), total, W, H,
        [["dc1", W < 460 ? "支出" : `${mLabel(mo.month)}の支出`], ["dc2", tipVal("¥" + compact(total))]],
        (evt, g) => showTip(evt, `<div class="tt-title">${esc(g.label)}</div>${(g.children || []).length
          ? g.children.map((c) => `<div class="tt-row"><span>${esc(c.label)}</span><span>${tipVal(yen(c.amount_jpy))}</span></div>`).join("")
          : g.detail ? `<div style="color:var(--muted);font-size:12px;max-width:260px">${esc(g.detail)}</div>` : ""}
          <div class="tt-row"><span>${g.count}件・${(g.amount_jpy / total * 100).toFixed(1)}%</span><span>${tipVal(yen(g.amount_jpy))}</span></div>`),
        "支出の内訳（円グラフ）", 2);
    }
    // v43: 項目をタップ（クリック・Enter）すると、その月の明細（日付・店名・金額）を下に開く
    list.innerHTML = segs.map((g, i) => {
      const open = donutOpen.has(g.label);
      return `<li class="cat-row" data-i="${i}" role="button" tabindex="0" aria-expanded="${open}" title="${esc(g.detail || "")}"><span class="sw" style="background:${g.color}"></span>
      <span>${esc(g.label)} <small style="color:var(--muted)">${g.count}件${g.pending_jpy ? "・速報含む" : ""}</small><span class="cat-caret" aria-hidden="true">${open ? "▾" : "▸"}</span>${(g.children || []).length
        ? `<small class="cat-sub">${g.children.map((c) => `${esc(c.label)} <span class="money">${yen(c.amount_jpy)}</span>`).join("・")}</small>` : ""}</span>
      <span class="amt money">${yen(g.amount_jpy)}</span><span class="pct">${total ? Math.round(g.amount_jpy / total * 100) : 0}%</span></li>
      ${open ? `<li class="cat-detail">${catDetailHtml(g)}</li>` : ""}`;
    }).join("");
    list.querySelectorAll("li.cat-row").forEach((row) => {
      const toggle = () => {
        const g = segs[Number(row.dataset.i)];
        if (donutOpen.has(g.label)) donutOpen.delete(g.label); else donutOpen.add(g.label);
        renderDonut(d);
      };
      row.addEventListener("click", (e) => { if (!(window.getSelection && String(window.getSelection()))) toggle(); });
      row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
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
        return `防衛資金${money(compact(t.target_jpy) + "円")}を残すなら ${money(yen(inv))}`
          + (short ? `（あと${money(yen(short))}${t.months_to_reach && !capExtra ? `・今のペースで約${Number(t.months_to_reach)}か月` : ""}）` : "");
      }).join("<br>");
      const short0 = t0 ? Math.max(0, t0.target_jpy - avail) : 0;
      $("cap-main").innerHTML = `<div class="cap-big"><span class="v ${inv0 ? "" : "zero"}">${money(yen(inv0))}</span>
          <small>${t0 ? `防衛資金${money(compact(t0.target_jpy) + "円")}を残した場合` : ""}${short0 ? `・あと${money(yen(short0))}で${money(compact(t0.target_jpy) + "円")}` : ""}</small></div>
        <div class="cap-alt">${alt}</div>`;
      $("cap-sum").innerHTML = `<span>＝ 防衛資金に数えられる額</span><span>${money(avail < 0 ? signedYen(avail) : yen(avail), avail < 0 ? "neg" : "")}</span>`;
    };
    const rows = (r.deductions || []).filter((x) => x.amount_jpy).map((x) => `<li><span>− ${escMoney(x.label)}</span><span>${money(yen(x.amount_jpy))}</span>
      ${x.key === "fixed_costs" && x.paid_jpy ? `<span class="m">今の期間（${md(r.last_payday)}〜）に三菱UFJから出た ${money(yen(x.paid_jpy))} を差し引いた残り</span>` : ""}</li>`).join("");
    const tl = (r.timeline || []).map((e) => `<li><span class="muted">${e.date ? md(e.date) : "未定"}</span><span>${escMoney(e.label)}${e.amount_jpy ? ` <span class="neg">${money("−" + yen(e.amount_jpy))}</span>` : ""}</span>
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
        <span class="meta"><span>${esc(f.account_type || "")}</span><span class="${updown(f.unrealized_profit_jpy)}">${f.unrealized_profit_jpy == null ? "" : money(signedYen(f.unrealized_profit_jpy))}${f.profit_pct == null ? "" : `（${money(pct(f.profit_pct))}）`}</span></span></div>`).join("");
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
        ${def.targets.map((t) => `<div class="rv-target">${money(compact(t.target_jpy) + "円")} ${t.reached ? "✅ 到達" : t.progress_pct == null ? "" : `${t.progress_pct}%`}
          <div class="rv-bar"><span style="width:${t.progress_pct || 0}%"></span></div></div>`).join("")}</div>
    </div>`;

    // --- 判断
    const decFmt = (p) => escMoney(p.reason) + (p.outcome_note ? `（その後：${escMoney(p.outcome_note)}）` : "");
    const decForm = (key, cur, trade, cycle) => {
      if (!w) return "";
      if (cur && !dr.decEdit[key]) return `<button type="button" class="rv-btn ghost" data-dec-edit="${esc(key)}">直す</button>`;
      const v = dr.dec[key] ?? (cur ? cur.payload.reason : "");
      return `<div class="rv-form"><textarea data-dec="${esc(key)}" placeholder="なぜ買った・売った・見送ったか（根拠・そのときの利回りや条件）">${esc(v)}</textarea>
        <button type="button" class="rv-btn ${cur ? "ghost" : ""}" data-dec-save="${esc(key)}">${cur ? "直して記録" : "根拠を記録"}</button><div class="rv-err" id="rv-err-${esc(key.replace(/[^A-Za-z0-9]/g, ""))}"></div></div>`;
    };
    const SIDE = { buy: "買い", sell: "売り" };
    let decH = (c.trades || []).map((t) => `<div class="rv-item"><div class="rv-top"><b>${esc(t.name || "")} ${esc(t.ticker)}　${SIDE[t.side]}</b>
        <span class="meta">${md(t.date)}・${money(Number(t.shares) + "株")} @ ${money(yen(t.price))}</span></div>
        <div class="meta">今 ${t.current_price == null ? "—（株価なし）" : money(yen(t.current_price))}${t.change_pct == null ? "" : `（約定から ${money(pct(t.change_pct), updown(t.side === "buy" ? t.change_pct : -t.change_pct))}）`}</div>
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
    const recFmt = (p) => `改善点：${escMoney(p.improve)}${p.next_actions ? `／翌月：${escMoney(p.next_actions)}` : ""}`;
    const nums = () => ({ income_jpy: a.income_jpy, spending_jpy: a.spending_jpy, net_jpy: a.net_jpy,
      expected_income_jpy: fp ? fp.expected_income_jpy : null, expected_spending_jpy: fp ? fp.expected_spending_jpy : null,
      invested_jpy: inv.actual_jpy, investable_planned_jpy: inv.planned_jpy, mufg_end_jpy: def.end ? def.end.amount_jpy : null,
      data_complete: a.complete ? "yes" : "no", card_known_through: a.card_known_through || "" });
    let rec;
    const editing = dr.editing;
    if (done && !editing) {
      const p = done.payload, RD = { keep: "継続", change: "変更", stop: "やめる" };
      rec = `<div class="rv-rec-grid"><div><h3 class="mini-title">良かったこと</h3><p>${escMoney(p.good) || "—"}</p></div>
          <div><h3 class="mini-title">改善点</h3><p>${escMoney(p.improve)}</p></div><div><h3 class="mini-title">翌月の行動</h3><p>${escMoney(p.next_actions) || "—"}</p></div></div>
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
        <div><div class="t-title">${it.time ? `<span class="time">${esc(it.time)}</span> ` : ""}${escMoney(it.title)}</div>
        <div class="t-meta"><span class="tag">${esc(it.source)}</span>${it.detail && !(it.time && (it.kind === "task" || it.kind === "event")) ? `<span>${escMoney(it.detail)}</span>` : ""}</div></div></li>`;
    }).join("") : `<li><span class="prio p3">—</span><div class="t-title">今日やることはありません</div></li>`;
  }

  // ---------- alerts ----------
  function renderAlerts(d) {
    const al = d.alerts || [];
    const errs = al.filter((a) => a.severity === "error").length, warns = al.filter((a) => a.severity === "warn").length;
    $("alert-count").textContent = errs || warns ? `エラー${errs}・注意${warns}` : "問題なし";
    const badge = $("status-badge");
    for (const b of [badge, $("status-badge-m"), $("status-badge-b")]) {
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
    // v42: 目標の色は投資資産の欄と同じ決まり（優待目的を除く配当株・取得額ベース。配当不明があれば色を付けない）
    const g = ds.goal;
    const yTxt = g && g.yield_pct != null
      ? `・利回り（取得額）${money(g.yield_pct.toFixed(2) + "%", g.verdict === "met" ? "pos" : g.verdict === "short" ? "low" : "")}${g.verdict === "hold" ? "（判定保留）" : ""}`
      : all.yield_pct != null ? `・利回り（時価）${money(all.yield_pct.toFixed(2) + "%")}` : "";
    $("hold-sub").innerHTML = `${s.counts.held}銘柄・要確認${s.counts.holdings_attention}` + (div ? `・年間配当(見込) ${money(yen(div))}` : "") + yTxt;
    const pc = ((s.positions_check || {}).items || []).filter((i) => i.kind !== "unverifiable");
    if (pc.length) $("hold-sub").innerHTML += ` <span class="chk-mark failed" title="${esc(pc.map((i) => `${i.name}（${i.code}）: ${i.detail}`).join(" / "))}">⚠ 楽天証券と${pc.length}銘柄違います（状態タブ）</span>`;
    // v42: 楽天証券の保有一覧と同じ項目（保有数・平均取得単価・前日比・評価損益・評価損益率）も並べる。
    // 損益率は、今の株価があればそれで、無ければ楽天証券の評価損益÷取得額で出す
    const profitOf = (h) => h.profit_now_jpy ?? h.unrealized_profit_jpy;
    const rateOf = (h) => {
      if (h.vs_cost_pct != null) return h.vs_cost_pct;
      const p = profitOf(h), cost = h.avg_cost && h.shares ? h.avg_cost * h.shares : null;
      return p != null && cost ? Math.round(p / cost * 10000) / 100 : null;
    };
    const holdRows = sortRows("hold", s.holdings, {
      name: (h) => h.name || h.code, code: (h) => h.code, shares: (h) => h.shares, cost: (h) => h.avg_cost,
      price: (h) => h.change_pct ?? null, value: (h) => h.value_now_jpy ?? h.market_value_jpy,
      day: (h) => h.day_change_jpy, profit: profitOf, rate: rateOf,
      yield: (h) => h.yield_pct, safety: (h) => SAFETY_ORDER[h.dividend_safety] ?? null, signal: (h) => alertTime(h.latest_alert),
    });
    const sgn = (v) => v == null ? "—" : money(signedYen(v), v > 0 ? "pos" : v < 0 ? "neg" : "");
    $("hold-table").innerHTML = `<thead><tr>${sortHead("hold", "name", "銘柄")}${sortHead("hold", "shares", "保有数", "num hide-sm")}${sortHead("hold", "cost", "取得単価", "num hide-sm", "平均取得単価")}${sortHead("hold", "price", "株価", "num", "前日比（%）で並び替え")}${sortHead("hold", "value", "評価額", "num")}${sortHead("hold", "day", "前日比", "num hide-sm", "評価額の前日比（株価の前日比×株数）")}${sortHead("hold", "profit", "評価損益", "num")}${sortHead("hold", "rate", "損益率", "num hide-sm", "評価損益÷取得額")}${sortHead("hold", "yield", "利回り", "num", "予想年間配当÷今の株価")}${sortHead("hold", "safety", "配当", "hide-sm", "安全→要注意の順（降順は要注意から）")}${sortHead("hold", "signal", "直近の通知", "", "通知の新しさで並び替え")}</tr></thead><tbody>` +
      (holdRows.length ? holdRows.map((h) => {
        const value = h.value_now_jpy ?? h.market_value_jpy, profit = profitOf(h), rate = rateOf(h);
        return `<tr class="${h.attention ? "attn" : ""}">
        <td class="name">${esc(h.name)}<span class="code">${esc(h.code)}</span>${h.yutai ? `<span class="cat">優待</span>` : ""}</td>
        <td class="num hide-sm">${h.shares != null ? money(Number(h.shares).toLocaleString("ja-JP")) : "—"}</td>
        <td class="num hide-sm">${h.avg_cost != null ? money(Number(h.avg_cost).toLocaleString("ja-JP", { maximumFractionDigits: 2 })) : "—"}</td>
        <td class="num">${priceCell(h)}</td>
        <td class="num">${value != null ? money(yen(value)) : `${money((h.shares ?? "—") + "株")}`}</td>
        <td class="num hide-sm">${sgn(h.day_change_jpy)}</td>
        <td class="num">${sgn(profit)}<small class="only-sm" style="color:var(--muted)">${rate != null ? money(pct(rate)) : ""}</small></td>
        <td class="num hide-sm">${rate != null ? money(pct(rate), rate > 0 ? "pos" : rate < 0 ? "neg" : "") : "—"}</td>
        <td class="num">${yieldCell(h.yield_pct, null, null)}</td>
        <td class="hide-sm">${safetyBadge(h.dividend_safety)}${h.yoc ? `<small style="display:block;color:var(--muted)">YOC ${money(esc(h.yoc) + "%")}</small>` : ""}</td>
        <td class="sig">${sigCell(h.latest_alert, d.today)}</td></tr>`;
      }).join("") : `<tr><td colspan="11" class="empty">保有銘柄はありません</td></tr>`) + "</tbody>";

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
        <small style="display:block;color:var(--muted)">${money(esc(o.shares ?? "—") + "株")} @ ${money(yen(o.price))}${o.memo ? "・" + esc(o.memo) : ""}</small></span>
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

  // v58: 配当の月ごとの見込み。年間の見込み（予想配当×株数）を、直近1年の権利落ちの約3か月後の月に分けたもの（サーバーで計算）
  function renderDivMonths(d) {
    const el = $("divmonth-chart"), note = $("divmonth-note"), sub = $("divmonth-sub");
    if (!el) return;
    const st = d.stocks, b = st && st.ok ? st.data.dividend_breakdown : null, bm = b && b.by_month;
    if (!bm) { el.innerHTML = st && !st.ok ? sectionError(st, "配当") : `<p class="empty">配当の見込みがありません</p>`; note.textContent = ""; sub.textContent = ""; return; }
    const key = divState.tax === "pre" ? "pre_tax_jpy" : "after_tax_jpy";
    const ms = bm.months, total = ms.reduce((a, m) => a + m[key], 0);
    sub.textContent = divState.tax === "pre" ? "税引前" : "税引後";
    const [W, H] = boxSize(el, 260, 150, 200), L = 8, R = 8, T = 18, B = 22;
    const max = Math.max(1, ...ms.map((m) => m[key]));
    const band = (W - L - R) / 12, bw = Math.min(30, band * 0.62);
    const now = new Date(d.generated_at).getMonth() + 1;
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="月ごとの配当の見込み">`;
    ms.forEach((m, i) => {
      const cx = L + band * (i + .5), h = (H - T - B) * m[key] / max, y = H - B - h;
      svg += `<rect x="${cx - bw / 2}" y="${y}" width="${bw}" height="${Math.max(m[key] ? 2 : 0, h)}" rx="3" fill="${m.month === now ? "var(--accent)" : "var(--s1)"}" opacity="${m[key] ? 1 : .25}"/>`;
      svg += `<text x="${cx}" y="${H - 6}" text-anchor="middle"${m.month === now ? ' class="cur"' : ""}>${m.month}月</text>`;
      if (m[key] && band >= 44) svg += `<text x="${cx}" y="${y - 5}" text-anchor="middle" class="val money">${esc(compact(m[key]))}</text>`;
      svg += `<rect x="${cx - band / 2}" y="${T}" width="${band}" height="${H - T - B}" fill="transparent" data-i="${i}" class="dmhit"/>`;
    });
    el.innerHTML = svg + "</svg>";
    el.querySelectorAll(".dmhit").forEach((r) => {
      r.addEventListener("pointermove", (evt) => {
        const m = ms[+r.dataset.i];
        showTip(evt, `<div class="tt-title">${m.month}月（受取の目安）</div><div class="tt-row"><span>合計</span><span>${tipVal(yen(m[key]))}</span></div>`
          + (m.items || []).slice(0, 6).map((it) => `<div class="tt-row"><span>${esc(it.name || it.code)}</span><span>${tipVal(yen(it[key]))}</span></div>`).join("")
          + ((m.items || []).length > 6 ? `<div class="tt-row"><span>ほか${m.items.length - 6}銘柄</span><span></span></div>` : ""));
      });
      r.addEventListener("pointerleave", hideTip);
    });
    const none = ms.filter((m) => !m[key]).map((m) => m.month);
    const best = ms.reduce((a, m) => (m[key] > a[key] ? m : a), ms[0]);
    const unk = bm.unknown || [], unkAmt = divState.tax === "pre" ? bm.unknown_pre_tax_jpy : bm.unknown_after_tax_jpy;
    note.innerHTML = [
      total ? `12か月で ${money(yen(total))}・一番多いのは${best.month}月（${money(yen(best[key]))}）` : "",
      none.length && none.length < 12 ? `受け取りの無い月：${none.join("・")}月` : "",
      unk.length ? `受取の月が分からない銘柄 ${unk.length}件（${money(yen(unkAmt))}。${unk.slice(0, 3).map((u) => esc(u.name || u.code)).join("・")}${unk.length > 3 ? " ほか" : ""}）は入れていません` : "",
      `年間の見込み（予想配当×株数）を、直近1年の権利落ちのおよそ${bm.lag_months}か月後の月に分けた目安です。投資信託の分配金は入りません`,
    ].filter(Boolean).join("<br>");
  }

  function renderDividends(d) {
    const top = $("div-top"), map = $("div-map"), note = $("div-note");
    const st = d.stocks, b = st && st.ok ? st.data.dividend_breakdown : null;
    const seg = (id, opts, key, prefKey) => {
      $(id).innerHTML = opts.map(([v, label]) => `<button type="button" data-v="${v}" aria-pressed="${divState[key] === v}">${label}</button>`).join("");
      $(id).querySelectorAll("button").forEach((btn) => btn.onclick = () => { divState[key] = btn.dataset.v; savePref(prefKey, btn.dataset.v); renderDividends(d); });
    };
    seg("div-tax", [["pre", "税引前"], ["after", "税引後"]], "tax", "pcc-div-tax");
    try { renderDivMonths(d); } catch (e) { console.error(e); }
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
      <span class="yl">利回り ${yl == null ? "—" : money("<b>" + yl.toFixed(2) + "%</b>")}
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
    // v44: カレンダーと同じ色で見せる（AIが入れた予定は既定で灰色。自分で入れた予定は目立つ色）
    const AI_DEFAULT = "#616161";
    const botColor = (w.days.flatMap((x) => x.events).find((e) => e.is_bot_task && e.color) || {}).color || AI_DEFAULT;
    const c = w.counts || {};
    $("week-sub").innerHTML = `<span class="week-legend"><span><i class="mine"></i>自分の予定 ${c.own_events ?? ""}</span><span><i class="bot" style="background:${esc(botColor)}"></i>AIが入れた予定 ${c.bot_tasks ?? 0}</span>${c.shared_events ? `<span><i class="shared"></i>共有カレンダー ${c.shared_events}</span>` : ""}</span>`;
    const evHtml = (e) => {
      const kind = e.is_bot_task ? "bot" : e.shared ? "shared" : "mine";
      const color = e.color || (e.is_bot_task ? AI_DEFAULT : "");
      return `<div class="ev ${kind}"${color && kind !== "shared" ? ` style="border-left-color:${esc(color)}"` : ""}><span class="et">${e.all_day ? "終日" : esc(e.start) + (e.end ? "–" + esc(e.end) : "")}${e.is_bot_task ? `<span class="ev-ai">AI</span>` : ""}</span>${esc(e.title)}</div>`;
    };
    el.innerHTML = w.days.map((day) => {
      const dt = toDate(day.date), past = day.date < d.today;
      const cls = day.weekday === "土" ? "sat" : day.weekday === "日" ? "sun" : "";
      return `<div class="day ${day.is_today ? "today-col" : ""} ${past ? "past-day" : ""}">
        <div class="day-head"><b>${dt.getDate()}</b><span class="${cls}">${day.weekday}${day.is_today ? "・今日" : ""}</span></div>
        <div>${day.events.length ? day.events.map(evHtml).join("") : `<div class="empty" style="font-size:12px">予定なし</div>`}</div></div>`;
    }).join("");
    // v54: スマホでは横にずらして見るので、今日の列を先頭に見せる
    const tc = el.querySelector(".today-col");
    if (tc && el.scrollWidth > el.clientWidth) el.scrollLeft = Math.max(0, tc.offsetLeft - el.offsetLeft - 4);
  }

  // ---------- weekly checklist（v44: WSTの週のチェックリスト） ----------
  function renderChecklist(d) {
    const el = $("goal"), sub = $("goal-sub"), t = d.tasks;
    if (!t || !t.ok) { el.innerHTML = sectionError(t || {}, "チェックリスト"); sub.textContent = ""; return; }
    const c = t.data.checklist;
    if (!c) {
      sub.textContent = "";
      el.innerHTML = `<div class="empty">まだありません。WSTを更新すると、土曜の予定作りで今週の目標をチェック項目にして、iPhoneのリマインダー「今週のチェック」に入れます</div>`;
      return;
    }
    if (c.error) {
      sub.textContent = "";
      el.innerHTML = `<div class="section-error"><b>チェックリストを読めません</b>${esc(c.error)}（iPhoneのリマインダーで「${esc(c.list)}」というリストを作ってください）</div>`;
      return;
    }
    if (!c.total) {
      sub.textContent = "";
      el.innerHTML = `<div class="empty">今週の項目はまだありません（次の土曜の予定作りで作られます）</div>`;
      return;
    }
    const pct = Math.round(c.done / c.total * 100);
    // v46: WSTが「そろっていない週」（作成が途中で止まった）と判定したら、進み具合は出さない
    const partial = c.state === "incomplete";
    sub.textContent = `${md(c.week_start)}〜${md(c.week_end)}・` + (partial ? "確認が必要" : `${c.done}/${c.total}できた`);
    const LEVEL = { up: "よくできたので、今週は少しだけ上げています", keep: "今週も同じくらいの量で続けています", down: "今週は小さく分けて量を減らしています",
      unknown: "作成が途中で止まった週のため、量は変えていません" };
    const p = c.previous;
    el.innerHTML = (partial
      ? `<div class="section-error"><b>今週のチェックリストは作成が途中で止まっています</b>項目がそろっていないため、進み具合は出していません（WSTの週次実行の記録・Discordの知らせを確かめてください）</div>`
      : `<div class="goal-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`) + `
      <ul class="goal-list">${c.items.map((i) => `<li class="${i.completed ? "done" : ""}"><span class="gk" aria-label="${i.completed ? "できた" : "まだ"}">${i.completed ? "✓" : ""}</span>${esc(i.title)}</li>`).join("")}</ul>
      ${p ? `<p class="goal-prev">先週 ${p.level === "unknown" ? "（評価なし）" : `${p.done}/${p.total}`}${p.level ? "・" + LEVEL[p.level] : ""}</p>` : ""}
      <p class="goal-note">チェックはiPhoneのリマインダー「${esc(c.list)}」で付けます。${hoursAgo(t.data.age_hours)}取得の内容です</p>`;
  }

  // ---------- v50: Claudeからのフィードバック（月次・年次） ----------
  const advState = { kind: "monthly", key: null, tab: "household" };
  try { advState.kind = localStorage.getItem("pcc-adv-kind") === "annual" ? "annual" : "monthly"; } catch (e) { /* 既定 */ }
  let advPoll = null;
  function renderAdvice(d) {
    const el = $("adv-body"), a = d.advice;
    if (!el) return;
    if (!a || !a.ok) { el.innerHTML = sectionError(a || {}, "フィードバック"); return; }
    const A = a.data, KIND = { monthly: "月次フィードバック", annual: "年次フィードバック" };
    $("adv-kind").innerHTML = Object.entries(KIND).map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${advState.kind === k}">${l}</button>`).join("");
    $("adv-kind").querySelectorAll("button").forEach((b) => b.onclick = () => {
      advState.kind = b.dataset.k; advState.key = null;
      try { localStorage.setItem("pcc-adv-kind", advState.kind); } catch (e) { /* noop */ }
      renderAdvice(d);
    });
    const items = (A.items || []).filter((i) => i.kind === advState.kind);
    const latest = (A.latest_periods || {})[advState.kind] || {};
    if (!items.some((i) => i.key === advState.key)) advState.key = items.length ? items[0].key : null;
    const cur = items.find((i) => i.key === advState.key);
    const st = (A.status || {})[`${advState.kind}-${latest.key}`] || {};
    const stCur = cur ? (A.status || {})[`${advState.kind}-${cur.key}`] || {} : {};
    const running = st.state === "running" || stCur.state === "running";
    const canAsk = A.available && !!(last && last.write_token) && !window.PCCSource;
    const sel = items.length ? `<select id="adv-sel" aria-label="区切り">${items.map((i) => `<option value="${esc(i.key)}" ${i.key === advState.key ? "selected" : ""}>${esc(i.label)}</option>`).join("")}</select>` : "";
    const hasLatest = items.some((i) => i.key === latest.key);
    const btns = canAsk ? [
      !hasLatest && latest.key ? `<button type="button" class="rv-btn" data-adv-ask="${esc(latest.key)}" ${running ? "disabled" : ""}>${esc(latest.label || "")}を見てもらう</button>` : "",
      cur ? `<button type="button" class="rv-btn ghost" data-adv-ask="${esc(cur.key)}" ${running ? "disabled" : ""}>作り直す</button>` : "",
    ].join("") : "";
    // v51: 状態は1か所にまとめて出す（作成中・途中で終わった・作れなかった・作成済み）
    const stOf = (x) => x.state === "running" ? "running" : x.state === "interrupted" ? "interrupted" : x.state === "failed" ? "failed" : "";
    const shown = stOf(st) ? st : stCur;
    const hm2 = (iso) => { const t = String(iso || ""); return t.length >= 16 ? `${+t.slice(5, 7)}/${+t.slice(8, 10)} ${t.slice(11, 16)}` : ""; };
    let chip = "";
    if (running) chip = `<span class="adv-chip run"><span class="dot"></span>Claudeが作成中です（1〜3分）</span>`;
    else if (stOf(shown) === "interrupted") chip = `<span class="adv-chip warn">${esc(shown.reason || "途中で終わりました")}</span>`;
    else if (stOf(shown) === "failed" && (!hasLatest || shown === stCur)) chip = `<span class="adv-chip bad">${esc(shown.reason || "作れませんでした")}</span>`;
    else if (cur) chip = `<span class="adv-chip ok">✓ 作成済み<small>${esc(hm2(cur.generated_at))}</small></span>`;
    else if (!A.available) chip = `<span class="adv-chip">${esc(A.unavailable_reason || "")}</span>`;
    const badge = cur ? (cur.data_complete ? `<span class="adv-badge ok">明細がそろった数字</span>` : `<span class="adv-badge warn">明細が途中の数字</span>`) : "";
    const top = `<div class="adv-caution" role="note"><span class="ic" aria-hidden="true">!</span>Claude（FP・高配当投資家の視点）による参考意見です。数字は元の欄で確かめ、最終的な判断はご自身で。</div>
      <div class="adv-top">${sel}${badge}<span class="adv-spacer"></span>${btns}${chip}</div><p class="rv-err" id="adv-err"></p>`;
    if (!cur) {
      el.innerHTML = top + `<div class="empty">${advState.kind === "monthly" ? "前の区切りが終わり、明細がそろうと、ここにClaudeのフィードバックが届きます（PCCを開いたときに自動で作ります）"
        : "年が明けたら（1〜2月）、前の年の総括がここに届きます。ボタンでいつでも作れます"}</div>`;
    } else {
      const r = cur.result || {};
      const annual = cur.kind === "annual";
      const list = (xs, cls) => (xs || []).length ? `<ul class="${cls}">${xs.map((x) => `<li>${escMoney(x)}</li>`).join("")}</ul>` : `<p class="adv-none">特になし</p>`;
      // 主な数字：Claudeの文からは取らず、作ったときにClaudeへ渡した元の数字（PFI）を出す
      const N = cur.numbers || {}, T = N.this || {}, P = N.prev, AV = N.avg;
      const KPI = [["income_jpy", "収入", 1, "in", "wallet", "blue"], ["spending_jpy", "支出", -1, "out", "cart", "red"],
        ["invested_jpy", "投資に回した額", 1, "inv", "bars", "violet"], ["net_jpy", "収支（収入−支出）", 1, "net", "coins", "gold"]];
      // v53（再レビューMEDIUM-01）: 比べる両方の明細がそろっているときだけ、増減に色を付ける（そろっていなければ「暫定」で色なし）
      const firm = N.complete !== false && (!P || P.complete !== false);
      const kpiNote = N.complete === false ? "この区切りは明細がそろう前の数字です（支出が少なく見えている可能性があります）"
        : P && P.complete === false ? "前の区切りは明細がそろう前の数字のため、前回比は暫定です"
          : (N.incomplete_periods || 0) > 0 ? `明細がそろう前の区切りが${N.incomplete_periods}つ含まれています` : "";
      const kpis = Object.keys(T).length ? `${kpiNote ? `<p class="adv-kpi-note" role="note">⚠ ${esc(kpiNote)}</p>` : ""}<div class="adv-kpis">${KPI.map(([k, l, good, cls, ic, tone]) => {
        const v = T[k];
        let sub = "";
        if (P && P[k] != null && v != null) {
          const dlt = v - P[k], tone = !firm || dlt === 0 ? "" : (dlt * good > 0 ? "pos" : "neg");
          sub = `<span class="${tone}">${firm ? "前回比" : "前回比（暫定）"} ${money(signedYen(dlt))}</span>`;
        } else if (AV && AV[k] != null) sub = `月平均（1年÷12） ${money(k === "net_jpy" ? signedYen(AV[k]) : yen(AV[k]))}`;
        return `<div class="adv-kpi ${cls}"><span class="kc-ic sm tone-${tone}">${icon(ic)}</span><div class="adv-kpi-b"><div class="l">${l}${cur.kind === "annual" ? "（1年）" : ""}</div><div class="v">${money(v == null ? "—" : k === "net_jpy" ? signedYen(v) : yen(v))}</div><div class="s">${sub}</div></div></div>`;
      }).join("")}</div>` : "";
      const TABS = { household: `家計の評価`, investing: `投資の評価`, targets: `目安・注意点` };
      if (!TABS[advState.tab]) advState.tab = "household";
      const panel = advState.tab === "household"
        ? `<div class="adv-two"><div><h4 class="good">良かった点</h4>${list(r.household_good, "good")}</div><div><h4 class="bad">気になる点</h4>${list(r.household_concerns, "bad")}</div></div>`
        : advState.tab === "investing"
          ? `<div class="adv-two"><div><h4 class="good">良かった点</h4>${list(r.investing_good, "good")}</div><div><h4 class="bad">気になる点</h4>${list(r.investing_concerns, "bad")}</div></div>`
          : `<div class="adv-two"><div><h4>${annual ? "これからの1年の目安" : "次の区切りの目安"}</h4>${list(r.targets, "adv-targets")}</div><div><h4>見るときの注意</h4>${list(r.caveats, "adv-targets")}</div></div>`;
      el.innerHTML = top + `<div class="adv-hero">
          <section class="adv-summary"><h3>${icon("bulb")}総評</h3><p>${escMoney(r.headline || "")}</p></section>
          <section class="adv-next"><h3>${icon("check")}${annual ? "これからの1年にすること" : "次の区切りにすること"}</h3>
            <ol>${(r.next_actions || []).map((x) => `<li><b>${escMoney(x.title)}</b>${x.why ? `<span class="why">${escMoney(x.why)}</span>` : ""}</li>`).join("")}</ol></section>
        </div>
        ${kpis}
        <div class="adv-tabs" role="tablist" aria-label="評価の種類">${Object.entries(TABS).map(([k, l]) => `<button type="button" role="tab" id="adv-tab-${k}" aria-controls="adv-panel" data-adv-tab="${k}" aria-selected="${advState.tab === k}" tabindex="${advState.tab === k ? 0 : -1}">${l}</button>`).join("")}</div>
        <div class="adv-panel" id="adv-panel" role="tabpanel" aria-labelledby="adv-tab-${advState.tab}" tabindex="0">${panel}</div>
        <p class="adv-note">${esc(cur.label)}・${esc(hm2(cur.generated_at))}にClaudeが作成${cur.data_complete ? "" : "・<b>作ったときは明細がそろっていませんでした</b>"}</p>`;
      const tabKeys = Object.keys(TABS);
      const selectTab = (k, focus) => { advState.tab = k; renderAdvice(d); if (focus) { const t = $(`adv-tab-${k}`); if (t) t.focus(); } };
      el.querySelectorAll("[data-adv-tab]").forEach((b) => {
        b.onclick = () => selectTab(b.dataset.advTab, false);
        // v53（再レビューLOW-01）: 左右の矢印・Home・Endでタブを移る
        b.onkeydown = (ev) => {
          const i = tabKeys.indexOf(b.dataset.advTab);
          const j = ev.key === "ArrowRight" ? (i + 1) % tabKeys.length : ev.key === "ArrowLeft" ? (i - 1 + tabKeys.length) % tabKeys.length
            : ev.key === "Home" ? 0 : ev.key === "End" ? tabKeys.length - 1 : -1;
          if (j >= 0) { ev.preventDefault(); selectTab(tabKeys[j], true); }
        };
      });
    }
    const s2 = $("adv-sel");
    if (s2) s2.onchange = () => { advState.key = s2.value; renderAdvice(d); };
    el.querySelectorAll("[data-adv-ask]").forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try {
        const res = await fetch("/api/advice", { method: "POST", cache: "no-store",
          headers: { "Content-Type": "application/json", "X-PCC-Token": last.write_token },
          body: JSON.stringify({ kind: advState.kind, key: b.dataset.advAsk }) });
        let j = {};
        try { j = await res.json(); } catch (e) { /* noop */ }
        if (!res.ok) throw new Error(j.error || ("HTTP " + res.status));
        startAdvicePoll();
        load(false);
      } catch (e) {
        $("adv-err").textContent = e.message; b.disabled = false;
      }
    });
    if (running) startAdvicePoll(); else stopAdvicePoll();
  }
  // 作成中は15秒ごとに読み直す（最長6分）
  function startAdvicePoll() {
    if (advPoll) return;
    let n = 0;
    advPoll = setInterval(() => { if (++n > 24) stopAdvicePoll(); load(false); }, 15000);
  }
  function stopAdvicePoll() { if (advPoll) { clearInterval(advPoll); advPoll = null; } }

  // ---------- status ----------
  const FRESH = { fresh: ["新しい", "ok"], aging: ["そろそろ古い", "warn"], stale: ["古い", "error"], unknown: ["不明", "unknown"] };
  const PROVIDER = { mufg_bank: "三菱UFJ銀行", rakuten_card: "楽天カード", rakuten_securities: "楽天証券", mizuho_bank: "みずほ銀行", rakuten_bank: "楽天銀行", jre_bank: "JRE BANK" };
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

  // ---------- v54: 新しいカード ----------
  const hmNow = (d) => { const n = new Date(d.generated_at); return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`; };
  const todayEvents = (d) => d.schedule && d.schedule.ok ? (((d.schedule.data.days || []).find((x) => x.is_today) || {}).events || []) : null;
  const evKind = (e) => e.is_bot_task ? "AI" : e.shared ? "共有" : "自分";
  const evColor = (e) => e.color || (e.is_bot_task ? "#616161" : "var(--accent)");
  // 輪のグラフ（割合）。真ん中の文字は呼ぶ側で money 済み
  function ring(pctVal, color, center, label) {
    const r = 40, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pctVal || 0));
    return `<svg class="ring" viewBox="0 0 100 100" role="img" aria-label="${esc(label)}"><circle cx="50" cy="50" r="${r}" class="ring-bg"/>
      <circle cx="50" cy="50" r="${r}" class="ring-fg money-ring" stroke="${color}" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/></svg>
      <div class="ring-c">${center}</div>`;
  }
  const sumHead = (ic, tone, title, go, link) => `<header class="sum-head"><span class="kc-ic sm tone-${tone}">${icon(ic)}</span><h2>${title}</h2>
    <button type="button" class="link-btn" data-goto="${go}">${link} ›</button></header>`;

  // ホーム：今日の予定
  function renderSchedToday(d) {
    const el = $("sched-today"), ev = todayEvents(d);
    if (!el) return;
    if (ev == null) { el.innerHTML = `<li>${sectionError(d.schedule, "予定")}</li>`; return; }
    const now = hmNow(d);
    el.innerHTML = ev.length ? ev.map((e) => {
      const past = !e.all_day && e.end && e.end <= now;
      return `<li class="${past ? "past" : ""}"><span class="s-time">${e.all_day ? "終日" : esc(e.start)}</span><i class="s-bar" style="background:${esc(evColor(e))}"></i>
        <span class="s-title">${past ? `<span class="s-done" aria-label="終わった">✓</span>` : ""}${esc(e.title)}</span><span class="s-kind">${evKind(e)}</span></li>`;
    }).join("") : `<li class="empty">今日の予定はありません</li>`;
  }

  // ホーム：家計・投資・予定・振り返りのまとめ
  function renderSummaries(d) {
    if (!$("sum-money")) return;
    const m = moneyFacts(d);
    // 家計：今月の支出が、前の区切りの支出全体の何%か（予算の代わりに前の区切りと比べる）
    if (m) {
      const e = Math.max(0, m.cur.expense_jpy || 0), base = m.prevM.expense_jpy;
      const p = base > 0 ? e / base * 100 : null;
      $("sum-money").innerHTML = sumHead("wallet", "blue", "家計", "money", "今月の状況") + `<div class="sum-body">
        <div class="ring-wrap">${ring(p, "var(--s1)", money(p == null ? "—" : Math.round(p) + "%"), "前の区切りの支出に対する今月の支出の割合")}</div>
        <div class="sum-txt"><div class="sum-l">今月の支出</div><div class="sum-v">${money(yen(e))}</div>
          <div class="sum-s">前の区切りの支出 ${base == null ? "—" : money(yen(base))}</div>
          ${m.f.investable && m.f.investable.status === "ok" ? `<div class="sum-s pos">投資余力 ${money(yen(m.f.investable.investable_jpy))}</div>` : ""}</div></div>`;
      const up = m.lt.unrealized_profit_jpy, tot = m.lt.total_assets_jpy;
      const upPct = up != null && tot != null && tot - up > 0 ? up / (tot - up) * 100 : null;
      $("sum-invest").innerHTML = sumHead("bars", "violet", "投資", "stocks", "資産サマリー") + `<div class="sum-body">
        <div class="ring-wrap">${ring(upPct == null ? 0 : Math.min(100, Math.abs(upPct) * 2), upPct != null && upPct < 0 ? "var(--bad)" : "var(--good)",
          money(upPct == null ? "—" : (upPct >= 0 ? "+" : "−") + Math.abs(upPct).toFixed(1) + "%") + "<small>含み損益率</small>", "含み損益率")}</div>
        <div class="sum-txt"><div class="sum-l">評価額</div><div class="sum-v">${tot == null ? "—" : money(yen(tot))}</div>
          <div class="sum-s">含み損益 ${up == null ? "—" : money(signedYen(up), up >= 0 ? "pos" : "neg")}</div>
          ${m.pv.total_assets_jpy != null && tot != null ? `<div class="sum-s">前回比 ${money(signedYen(tot - m.pv.total_assets_jpy))}</div>` : ""}</div></div>`;
    } else {
      $("sum-money").innerHTML = sumHead("wallet", "blue", "家計", "money", "今月の状況") + sectionError(d.finance, "家計");
      $("sum-invest").innerHTML = sumHead("bars", "violet", "投資", "stocks", "資産サマリー") + sectionError(d.finance, "投資");
    }
    // 予定：今週の予定の数と内訳
    const sc = d.schedule && d.schedule.ok ? d.schedule.data : null, tk = d.tasks && d.tasks.ok ? d.tasks.data : null;
    const cl = tk && tk.checklist;
    const rows = [
      sc && ["var(--accent)", "自分の予定", sc.counts.own_events],
      sc && ["#8a8a8a", "AIの予定", sc.counts.bot_tasks],
      tk && ["var(--bad)", "期限切れ", tk.counts.overdue || 0],
      cl && cl.total && ["var(--warn)", "週のチェック", `${cl.done}/${cl.total}`],
    ].filter(Boolean);
    $("sum-plan").innerHTML = sumHead("cal", "red", "予定", "plan", "今週の予定") + (sc ? `<div class="sum-body">
      <div class="big-count"><div><b>${sc.counts.week_events}</b><span>件</span></div><small>今週の予定</small></div>
      <ul class="sum-legend">${rows.map(([c, l, n]) => `<li><i style="background:${c}"></i>${l}<b>${esc(n)}</b></li>`).join("")}</ul></div>` : sectionError(d.schedule, "予定"));
    // 振り返り：Claudeの総評（あれば）と、振り返りの記録の期限
    const adv = d.advice && d.advice.ok ? (d.advice.data.items || []).filter((i) => i.kind === "monthly")[0] : null;
    const rv = d.review && d.review.ok ? d.review.data : null;
    const lastRec = rv ? (rv.cycles || []).find((c) => c.review) : null;
    $("sum-review").innerHTML = sumHead("note", "violet", "振り返り", "review", "振り返りを開く") + `<div class="sum-review">
      ${adv ? `<div class="sr-item"><span class="sr-ic">${icon("bulb")}</span><div><div class="sr-l">Claudeの総評（${esc(adv.label)}）</div><p>${escMoney(adv.result.headline || "")}</p></div></div>` : ""}
      ${rv && rv.due ? `<div class="sr-item warn"><span class="sr-ic">${icon("alert")}</span><div><div class="sr-l">振り返りがまだです</div><p>${esc(md(rv.due.start))}〜${esc(md(rv.due.end))}の区切りを記録しましょう</p></div></div>` : ""}
      ${lastRec ? `<div class="sr-item"><span class="sr-ic">${icon("ok")}</span><div><div class="sr-l">最近の記録（${esc(md(lastRec.start))}〜）</div><p>${escMoney(((lastRec.review.payload || {}).improve) || "")}</p></div></div>` : ""}
      ${!adv && !(rv && rv.due) && !lastRec ? `<p class="empty">まだ記録がありません</p>` : ""}</div>`;
  }

  // 投資：資産配分。v55（0ベースのレビューHIGH-01・02）: 株・投資信託は楽天証券の同じ保有明細（PFI）の種別ごとの合計から作り、
  // 現金は銀行の残高。どれか1つでも分からない（明細が無い・要確認・評価額が空欄の銘柄がある・銀行の残高が要確認）ときは、
  // 取れた分だけで100%にすると配分を誤って見せるので、円グラフを出さずに理由を出す
  function allocFacts(d) {
    const fin = d.finance.ok ? d.finance.data : null;
    if (!fin) return { why: ["家計のデータを読めません"] };
    const pf = fin.portfolio || {}, lt = pf.latest || {}, groups = pf.groups || [], banks = fin.banks || {};
    const why = [];
    if (!lt.date) why.push("楽天証券の保有明細がありません");
    else if (lt.needs_review) why.push("楽天証券の保有明細が要確認です");
    for (const g of groups) if (!g.complete) why.push(`${g.label}に評価額が空欄の銘柄があります`);
    if (banks.total_jpy == null || !banks.complete) why.push("銀行の残高に要確認のものがあります");
    if (why.length) return { why };
    const segs = groups.filter((g) => g.market_value_jpy > 0).map((g, i) => [g.label, g.market_value_jpy, ["var(--s1)", "var(--s7)", "var(--s4)", "var(--s5)", "var(--s6)"][i % 5]]);
    const pos = groups.reduce((a, g) => a + (g.market_value_jpy || 0), 0);
    // 証券口座の評価額の合計と、銘柄の合計の差（預り金など）。差がある時だけ出す
    if (lt.total_assets_jpy != null && lt.total_assets_jpy - pos >= 1) segs.push(["預り金など", lt.total_assets_jpy - pos, "var(--s-other)"]);
    if (banks.total_jpy > 0) segs.push(["現金（銀行）", banks.total_jpy, "var(--s3)"]);
    return { segs, asof: `楽天証券 ${md(lt.date)}時点・銀行 ${md(banks.oldest_as_of)}時点` };
  }
  function renderAlloc(d) {
    const el = $("alloc");
    if (!el) return;
    const A = allocFacts(d);
    const segs = A.segs || [], total = segs.reduce((a, x) => a + x[1], 0);
    $("alloc-sub").textContent = A.asof || "";
    if (A.why || !total) {
      el.innerHTML = `<div class="section-error"><b>資産配分を出せません（そろわない数字で配分を見せないため）</b>${(A.why || ["数字がありません"]).map(esc).join("・")}</div>`;
      return;
    }
    const r = 42, c = 2 * Math.PI * r;
    let acc = 0;
    const arcs = segs.map(([l, v, col]) => {
      const len = c * v / total, out = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${col}" stroke-width="16" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 60 60)"/>`;
      acc += len; return out;
    }).join("");
    el.innerHTML = `<div class="alloc-chart"><svg viewBox="0 0 120 120" role="img" aria-label="資産配分の円グラフ">${arcs}</svg>
      <div class="alloc-c"><small>合計</small>${money(yen(total))}</div></div>
      <ul class="alloc-list">${segs.map(([l, v, col]) => `<li><i style="background:${col}"></i><span${l === "預り金など" ? ' title="証券口座の評価額のうち、銘柄・投資信託以外（預り金など）"' : ""}>${esc(l)}</span><b>${money(yen(v))}</b><em>${money((v / total * 100).toFixed(0) + "%")}</em></li>`).join("")}</ul>`;
  }

  // 投資：今日のチェックポイント（株の「今日やること」と、注意の付いた保有銘柄）
  function renderCheckpoints(d) {
    const el = $("checkpt");
    if (!el) return;
    const items = (d.today_items || []).filter((i) => i.kind === "stock");
    const st = d.stocks && d.stocks.ok ? d.stocks.data : null;
    const seen = new Set(items.map((i) => i.title));
    const extra = st ? (st.holdings || []).filter((h) => h.attention && h.latest_alert && ![...seen].some((t) => t.includes(h.code)))
      .map((h) => ({ title: `${h.name}（${h.code}）${h.latest_alert.level}`, detail: `${md(h.latest_alert.date)}の通知` })) : [];
    // v59（stock-watchlist 76回目）: 保有銘柄の予想配当の変化（直近35日）。1株配当は公開の値なので隠さない
    const divc = st ? (st.holdings || []).filter((h) => h.dividend_change).map((h) => {
      // v62（第3回レビューHIGH-STOCK-02・MEDIUM-STOCK-03）: Yahooのデータの変化で、会社の発表とは限らない。「増配・減配」と言い切らない。
      // 直近1年の実績は、時間がたつだけでも変わる（前年の特別配当が外れるなど）。株式分割はstock-watchlist（77回目）が直してから記録する
      const c = h.dividend_change, up = c.new > c.prev, fc = c.source !== "trailing";
      // v64（stock-watchlist 78回目）: 比がほぼ株式分割・併合の比なら、分割の情報が遅れて載っただけかもしれないので要確認
      const r = c.prev > 0 && c.new > 0 ? Math.max(c.prev, c.new) / Math.min(c.prev, c.new) : 0;
      const splitLike = [1.5, 2, 3, 4, 5, 10].some((k) => Math.abs(r - k) / k <= 0.02);
      const word = splitLike ? "1株配当が大きく変わりました（株式分割の可能性・要確認）"
        : fc ? `Yahooの予想配当が${up ? "上がりました" : "下がりました"}` : `直近1年の配当の合計（実績）が${up ? "増えました" : "減りました"}`;
      return { title: `${h.name}（${h.code}）${word}`, kind: splitLike ? "" : up ? "up" : "down",
        detail: `1株あたり：${c.prev.toLocaleString("ja-JP")} → ${c.new.toLocaleString("ja-JP")}${c.pct != null ? `（${c.pct > 0 ? "+" : ""}${c.pct}%）` : ""}・${md(c.date)}の週次レビュー`
          + (splitLike ? "・分割なら配当の総額は変わりません" : fc ? "・会社の発表かは適時開示で確認" : "") };
    }) : [];
    const all = items.concat(divc, extra);
    $("checkpt-sub").textContent = all.length ? `${all.length}件` : "";
    const ic = (t, kind) => kind === "up" ? ["trend", "green"] : kind === "down" ? ["alert", "red"]
      : /目標|利回り|買/.test(t) ? ["target", "green"] : /下落|減配|注意|⚠/.test(t) ? ["alert", "red"] : /指値|期限/.test(t) ? ["clock", "gold"] : ["bars", "blue"];
    el.innerHTML = all.length ? all.map((i) => { const [n, tone] = ic(i.title, i.kind);
      return `<li><span class="kc-ic sm tone-${tone}">${icon(n)}</span><div><b>${escMoney(i.title)}</b><span>${escMoney(i.detail || "")}</span></div></li>`; }).join("")
      : `<li class="empty">今日確認することはありません</li>`;
  }

  // 家計：気をつけたいポイント（引き落とし・支出のペース・確認タスク・データの検証）
  function renderPoints(d) {
    const el = $("points");
    if (!el) return;
    const m = moneyFacts(d);
    if (!m) { el.innerHTML = `<li>${sectionError(d.finance, "家計")}</li>`; return; }
    const out = [];
    for (const a of (m.f.charge_check || {}).accounts || []) {
      if (a.after_jpy == null) out.push(["alert", "gold", `次の引き落とし（${esc(md(m.f.charge_check.expected_payment_date))}）を判定できません`, esc(a.reason || a.label)]);
      else out.push(a.after_jpy < 0 ? ["alert", "red", `${esc(a.label)}の残高が足りない見込み`, `請求 ${money(yen(a.charge_jpy))}・引き落とし後 ${money(yen(a.after_jpy), "neg")}（${esc(md(m.f.charge_check.expected_payment_date))}）`]
        : ["card", "blue", `次のカードの引き落とし ${esc(md(m.f.charge_check.expected_payment_date))}`, `${esc(a.label)}から ${money(yen(a.charge_jpy))}・引き落とし後 ${money(yen(a.after_jpy))}`]);
    }
    if (m.lastSameDay != null && m.cur.expense_jpy != null) {
      const diff = m.cur.expense_jpy - m.lastSameDay;
      out.push(diff > 0 ? ["income", "red", "支出のペースが前の区切りより速め", `同じ日数で比べて ${money(yen(diff))} 多い`]
        : ["ok", "green", "支出のペースは前の区切り以下", `同じ日数で比べて ${money(yen(-diff))} 少ない`]);
    }
    const rc = m.f.review_counts || {}, rt = (m.f.review_tasks || []).length;
    if (rt) out.push(["check", "gold", `家計の確認タスク ${rt}件`, "保有数・取得単価の変化などを確認（下の「家計の確認」）"]);
    if ((m.f.unconfirmed_bank_flows || {}).count) out.push(["note", "gold", `種類の決まっていない銀行の入出金 ${Number(m.f.unconfirmed_bank_flows.count)}件`, "今月の収入・支出には入れていません"]);
    for (const c of ((m.f.data_checks || {}).checks || []).filter((c) => c.status === "failed" || c.status === "needs_review").slice(0, 3))
      out.push(["data", c.status === "failed" ? "red" : "gold", esc(c.title), esc(c.source_label || "")]);
    void rc;
    $("points-sub").textContent = out.length ? `${out.length}件` : "";
    el.innerHTML = out.length ? out.map(([n, tone, t, s]) => `<li><span class="kc-ic sm tone-${tone}">${icon(n)}</span><div><b>${t}</b><span>${s}</span></div></li>`).join("")
      : `<li class="empty">気をつけることはありません</li>`;
  }

  // 予定：今日のタイムライン
  function renderTimeline(d) {
    const el = $("timeline"), ev = todayEvents(d);
    if (!el) return;
    if (ev == null) { el.innerHTML = `<li>${sectionError(d.schedule, "予定")}</li>`; $("timeline-sub").textContent = ""; return; }
    const now = hmNow(d);
    $("timeline-sub").textContent = new Date(d.generated_at).toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
    const nextIdx = ev.findIndex((e) => !e.all_day && e.end && e.end > now);
    el.innerHTML = ev.length ? ev.map((e, i) => {
      const past = !e.all_day && e.end && e.end <= now, curr = i === nextIdx && e.start <= now;
      return `<li class="${past ? "past" : ""} ${curr ? "now" : ""}"><span class="tl-time">${e.all_day ? "終日" : esc(e.start) + (e.end ? `<small>〜${esc(e.end)}</small>` : "")}</span>
        <span class="tl-dot" style="border-color:${esc(evColor(e))}"></span>
        <div class="tl-box" style="border-left-color:${esc(evColor(e))}"><b>${esc(e.title)}</b><span class="tl-tag ${e.is_bot_task ? "ai" : e.shared ? "shared" : "mine"}">${evKind(e) === "AI" ? "AIが入れた予定" : evKind(e) === "共有" ? "共有" : "自分の予定"}</span>
        ${curr ? `<span class="tl-now">いま</span>` : past ? `<span class="tl-done">終わった</span>` : ""}</div></li>`;
    }).join("") : `<li class="empty">今日の予定はありません</li>`;
  }

  // 予定：注意・重なり（重なった予定・予定の多い日・期限切れのタスク・今週のチェックの遅れ）
  function renderNotice(d) {
    const el = $("notice");
    if (!el) return;
    const out = [];
    const sc = d.schedule && d.schedule.ok ? d.schedule.data : null, tk = d.tasks && d.tasks.ok ? d.tasks.data : null;
    if (sc) {
      for (const day of sc.days || []) {
        if (day.date < d.today) continue;
        const tv = day.events.filter((e) => !e.all_day && e.start && e.end).sort((a, b) => a.start.localeCompare(b.start));
        for (let i = 0; i < tv.length; i++) for (let j = i + 1; j < tv.length; j++) {
          if (tv[j].start < tv[i].end) out.push(["clock", "red", `予定が重なっています（${md(day.date)}）`, `${esc(tv[i].start)} ${esc(tv[i].title)} と ${esc(tv[j].start)} ${esc(tv[j].title)}`]);
        }
        if (tv.length >= 5) out.push(["cal", "gold", `${md(day.date)}は予定が多めです`, `時間の決まった予定が${tv.length}件`]);
      }
    }
    if (tk) {
      if (tk.counts.overdue) out.push(["alert", "red", `期限切れのタスク ${tk.counts.overdue}件`, "下の「タスク（iCloud）」で確認"]);
      if (tk.stale) out.push(["data", "gold", "タスクの一覧が古くなっています", `${esc(hoursAgo(tk.age_hours))}に取得`]);
      const cl = tk.checklist, wd = new Date(d.generated_at).getDay();
      if (cl && cl.total && (wd === 0 || wd >= 4) && cl.done / cl.total < 0.5)
        out.push(["target", "gold", "今週のチェックが半分まで届いていません", `${cl.done}/${cl.total}できた・週末までに見直しを`]);
    }
    $("notice-sub").textContent = out.length ? `${out.length}件` : "";
    el.innerHTML = out.length ? out.slice(0, 8).map(([n, tone, t, s]) => `<li><span class="kc-ic sm tone-${tone}">${icon(n)}</span><div><b>${t}</b><span>${s}</span></div></li>`).join("")
      : `<li class="empty"><span class="kc-ic sm tone-green">${icon("ok")}</span>気になる重なりはありません</li>`;
  }

  // v60: データの時点（どの数字が、いつの元データか）。タブに関係するものだけ並べる。古ければ色を付ける
  const FRESH_TONE = { fresh: "ok", aging: "warn", stale: "bad" };
  function renderFreshRow(d) {
    const el = $("fresh-row"), v = document.body.dataset.view;
    if (!el) return;
    const chips = [];
    const add = (views, label, text, tone, title) => { if (views.includes(v)) chips.push(`<span class="fchip ${tone || ""}"${title ? ` title="${esc(title)}"` : ""}><b>${esc(label)}</b>${esc(text)}</span>`); };
    const genAt = new Date(d.generated_at), ageH = (Date.now() - genAt.getTime()) / 36e5;
    // スマホ用ページは、PCが作った時点のもの（PCが閉じていると古いまま）
    if (window.PCCSource) add(["overview", "money", "stocks", "plan", "review", "status"], "この画面", `PCが${hm(d.generated_at)}に作成`, ageH > 24 ? "bad" : ageH > 6 ? "warn" : "ok",
      "スマホ用ページは、PCが送った時点の内容です");
    if (d.finance.ok) {
      const f = d.finance.data, fr = (f.summary || {}).data_freshness || {}, tone = (k) => FRESH_TONE[(fr[k] || {}).freshness_status] || "";
      if ((f.banks || {}).oldest_as_of) add(["overview", "money"], "銀行", `${md(f.banks.oldest_as_of)}時点`, tone("mufg_bank"), "銀行の明細（CSV）の最後の日");
      if ((f.spending || {}).card_through) add(["overview", "money"], "カード", `${md(f.spending.card_through)}利用分まで`, tone("rakuten_card"), "カードの明細・速報がそろっている日");
      if (((f.portfolio || {}).latest || {}).date) add(["overview", "stocks"], "楽天証券", `${md(f.portfolio.latest.date)}時点`, tone("rakuten_securities"), "楽天証券の保有明細の日");
    } else add(["overview", "money", "stocks"], "家計", "読めません", "bad");
    if (d.stocks && d.stocks.ok) {
      const sd = d.stocks.data;
      add(["overview", "stocks"], "株価", sd.prices_error ? "取得できません" : sd.prices_as_of ? hm(sd.prices_as_of) : "—", sd.prices_error ? "warn" : "", "Yahoo Finance（遅れがあります）");
      if (sd.fetched_at) add(["stocks"], "株の監視", `${hm(sd.fetched_at)}に取得`, "", "stock-watchlist（GitHub）から読んだ時刻");
    }
    if (d.tasks && d.tasks.ok) add(["overview", "plan"], "タスク", hoursAgo(d.tasks.data.age_hours), d.tasks.data.stale ? "warn" : "", "iCloudのタスクの一覧を取った時刻");
    el.innerHTML = chips.length ? `<span class="fr-l">データの時点</span>${chips.join("")}` : "";
    el.hidden = !chips.length;
    renderSinceRow(d);
  }

  // v60: 前回見たときからの変化（ホームだけ）。
  // v62（第3回レビューHIGH-PCC-01・MEDIUM-PCC-02）: 前回の数字をブラウザに平文で置かない。
  //   PC：PCの data フォルダ（POST /api/seen。画面を開いたときに d.seen_base で受け取る）
  //   スマホ：前回見たときの暗号文だけを端末に置き、開いたときに鍵で復号する（mobile.js）
  //   比べる元は「前回この画面を離れたとき」。開いたまま30分以上離れて戻ったら、その離れたときに置き換える
  function seenSnapshot(d) {
    const m = moneyFacts(d), sd = d.stocks && d.stocks.ok ? d.stocks.data.dividend_summary : null;
    return { at: d.generated_at, cash: m ? m.banks.total_jpy : null, invest: m ? m.lt.total_assets_jpy : null,
      expense: m ? m.cur.expense_jpy : null, cycle: m ? m.cur.label || m.cur.month || null : null,
      dividend: sd && sd.all ? sd.all.annual_jpy : null,
      alerts: (d.alerts || []).filter((a) => a.severity !== "info").map((a) => String(a.title).slice(0, 200)).slice(0, 30) };
  }
  try { localStorage.removeItem("pcc-last-seen"); } catch (e) { /* v60 の平文の保存を消す */ }
  const SEEN_REBASE_MS = 30 * 60 * 1000;
  let seenBase, seenLoading = false, leftAt = null, leftSnap = null;   // seenBase: undefined＝まだ読んでいない
  function loadSeen(d) {
    if (seenBase !== undefined || seenLoading) return;
    const src = window.PCCSource;
    if (src && src.seenLoad) {
      seenLoading = true;
      src.seenLoad().then((prev) => { seenBase = prev ? seenSnapshot(prev) : null; })
        .catch(() => { seenBase = null; })
        .finally(() => { seenLoading = false; if (last) renderSinceRow(last); });
    } else seenBase = d.seen_base || null;
  }
  function saveSeen() {
    if (!last) return;
    leftAt = Date.now();
    leftSnap = seenSnapshot(last);
    const src = window.PCCSource;
    if (src && src.seenSave) { src.seenSave(); return; }
    if (!last.write_token) return;
    try {
      fetch("/api/seen", { method: "POST", keepalive: true, credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-PCC-Token": last.write_token }, body: JSON.stringify(leftSnap) }).catch(() => {});
    } catch (e) { /* 保存できなくても表示はできる */ }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { saveSeen(); return; }
    if (leftAt && Date.now() - leftAt >= SEEN_REBASE_MS && leftSnap) {
      seenBase = leftSnap;
      if (last) renderSinceRow(last);
    }
  });
  window.addEventListener("pagehide", saveSeen);
  function renderSinceRow(d) {
    const el = $("since-row");
    if (!el) return;
    loadSeen(d);
    const b = seenBase, v = document.body.dataset.view;
    if (v !== "overview" || !b || !b.at || b.at === d.generated_at) { el.hidden = true; return; }
    const now = seenSnapshot(d), parts = [];
    const diff = (label, a, c) => {
      if (a == null || c == null || a === c) return;
      parts.push(`${label} ${money(signedYen(c - a), c > a ? "pos" : "neg")}`);
    };
    diff("現金", b.cash, now.cash);
    diff("投資資産", b.invest, now.invest);
    if (b.cycle && b.cycle === now.cycle) diff("今月の支出", b.expense, now.expense);
    else if (b.cycle && now.cycle) parts.push("給料日の区切りが変わりました");
    diff("配当見込み", b.dividend, now.dividend);
    const newAlerts = now.alerts.filter((t) => !(b.alerts || []).includes(t));
    if (newAlerts.length) parts.push(`新しい警告 ${newAlerts.length}件`);
    const gone = (b.alerts || []).filter((t) => !now.alerts.includes(t));
    if (gone.length) parts.push(`解決した警告 ${gone.length}件`);
    el.hidden = false;
    el.innerHTML = `<span class="fr-l" title="前回この画面を離れたときの数字と比べています（PCとスマホは別々）">前回（${esc(hm(b.at))}）${window.PCCSource ? "この端末" : "このPC"}で見たときから</span>${parts.length ? parts.map((x) => `<span class="schip">${x}</span>`).join("") : `<span class="schip">大きな変化はありません</span>`}`;
  }

  // 見出しの説明・右上の小さな表示
  const PAGE_SUB = {
    overview: "今日やることと、お金・予定の今をひと目で。",
    money: "収入・支出・残高の流れを確認。",
    stocks: "保有・配当・資産配分をまとめて確認。",
    plan: "今日の予定と今週の流れを確認。",
    review: "結論 → 元の数字 → 詳しい評価 の順で確認。",
    status: "データと自動実行が正しく動いているかを確認。",
  };
  function renderPageHead(d) {
    const v = document.body.dataset.view;
    $("page-sub").textContent = PAGE_SUB[v] || "";
    const pill = $("page-pill");
    if (!d || v !== "overview") { pill.hidden = true; return; }
    const al = d.alerts || [], n = al.filter((a) => a.severity !== "info").length;
    pill.hidden = false;
    pill.innerHTML = `<span class="kc-ic sm tone-blue">${icon("check")}</span><div><small>今日やること</small><b>${(d.today_items || []).length}件</b></div>`
      + `<button type="button" class="pill-alert ${n ? "has" : ""}" data-goto="status"><small>警告</small><b>${n}件</b></button>`;
  }

  // ---------- main ----------
  let last = null, greeting = "こんにちは";
  const VIEW_TITLE = { overview: "ホーム", money: "家計", stocks: "投資", plan: "予定", review: "振り返り", status: "状態" };
  const updateTitle = () => {
    const v = document.body.dataset.view;
    $("greeting").textContent = v === "overview" ? greeting : VIEW_TITLE[v] || greeting;
  };
  const renderers = [renderKpiRow, renderPageHead, renderFreshRow, renderSchedToday, renderSummaries, renderAlloc, renderCheckpoints, renderPoints,
    renderTimeline, renderNotice, renderToday, renderPace, renderMonths, renderDonut, renderBanks, renderCapacity, renderReview, renderAlerts,
    renderStocks, renderDividends, renderFunds, renderReminders, renderChecklist, renderWeek, renderStatus, renderChecks, renderRetro, renderAdvice];
  function renderAll(d) {
    last = d;
    $("demo").hidden = !d.demo;
    document.body.classList.toggle("has-banner", !!d.demo);
    const now = new Date(d.generated_at), h = now.getHours();
    greeting = h < 11 ? "おはようございます" : h < 18 ? "こんにちは" : "こんばんは";
    updateTitle();
    $("date").textContent = now.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
    // スマホの上の帯は狭いので、年を省く（320px幅でもはみ出さないように）
    if ($("m-date")) $("m-date").textContent = now.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
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
    // v54: 主な数字と見出しの説明はタブごとに違うので、切り替えたら描き直す
    if (last) { try { renderKpiRow(last); renderPageHead(last); renderFreshRow(last); } catch (e) { console.error(e); } }
    if (push) {
      try { history.replaceState(null, "", "#" + v); } catch (e) { /* noop */ }
      if (window.innerWidth <= 1180) window.scrollTo(0, 0);  // スマホ: 切り替えたら先頭から
    }
    try { localStorage.setItem("pcc-view", v); } catch (e) { /* noop */ }
    requestAnimationFrame(rerenderCharts);
  }
  tabs.forEach((t) => t.addEventListener("click", () => setView(t.dataset.tab, true)));
  // v54: カード・「すべて見る」からほかのタブへ
  document.addEventListener("click", (e) => {
    const g = e.target.closest("[data-goto]");
    if (g && VIEWS.includes(g.dataset.goto)) setView(g.dataset.goto, true);
  });
  document.addEventListener("keydown", (e) => {
    const g = e.target.closest && e.target.closest("[data-goto][role=link]");
    if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setView(g.dataset.goto, true); }
  });
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
    ro.observe($("pace-card")); ro.observe($("months-card")); ro.observe($("div-card")); ro.observe($("divmonth-card"));
  } else {
    window.addEventListener("resize", schedule);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(false); });
  setInterval(() => { if (!document.hidden) load(false); }, 5 * 60 * 1000);
  load(false);
})();
