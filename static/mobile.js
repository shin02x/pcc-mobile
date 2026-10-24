"use strict";
// スマホ用ページ（GitHub Pages）専用。PCが置いた暗号化データ（data.enc.json）を取得し、
// このブラウザの中だけで復号して app.js に渡す。パスフレーズ・復号した中身はどこにも送らない。
// 復号の手順は pcc/mobile_crypto.py の暗号化と対になっている。
(() => {
  // ほかのサイトの枠（iframe）の中では表示しない（GitHub Pages では frame-ancestors を指定できないため）
  if (window.top !== window.self) {
    document.documentElement.style.display = "none";
    throw new Error("このページは枠の中では表示しません");
  }
  const AAD = new TextEncoder().encode("pcc-mobile-v1");
  const DB_NAME = "pcc-mobile", STORE = "keys", BLOB_CACHE = "pcc-mobile-blob";
  const STALE_HOURS = 24;
  const $ = (id) => document.getElementById(id);
  const normalize = (s) => String(s || "").normalize("NFKC").toLowerCase().replace(/[\s-]/g, "");
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  // ---------- 鍵の保存（IndexedDB。取り出し不可の鍵として保存し、パスフレーズ自体は保存しない） ----------
  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction(STORE, mode);
          const r = fn(tx.objectStore(STORE));
          tx.oncomplete = () => { db.close(); resolve(r && r.result); };
          tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
        } catch (e) { db.close(); reject(e); }
      };
    });
  }
  const savedKey = (id) => idb("readonly", (s) => s.get(id)).catch(() => null);
  const saveKey = (id, key) => idb("readwrite", (s) => { s.clear(); return s.put(key, id); }).catch(() => null);
  const forgetKeys = () => idb("readwrite", (s) => s.clear()).catch(() => null);

  // ---------- データの取得 ----------
  // 想定と違うデータ（壊れた・書き換えられたもの）で端末に重い処理をさせないよう、形と大きさを厳しく確かめる
  const ITERATIONS = 600000, MAX_RESPONSE_CHARS = 4 * 1024 * 1024, MAX_CT_CHARS = 3 * 1024 * 1024;
  const b64len = (s) => { try { return atob(s).length; } catch (e) { return -1; } };
  function validEnvelope(env) {
    return !!env && env.format === "pcc-mobile" && env.v === 1 && env.kdf === "PBKDF2-SHA256" && env.iter === ITERATIONS
      && typeof env.salt === "string" && b64len(env.salt) === 16
      && typeof env.iv === "string" && b64len(env.iv) === 12
      && typeof env.ct === "string" && env.ct.length <= MAX_CT_CHARS && b64len(env.ct) > 16;
  }
  async function fetchOnline() {
    const res = await fetch("data.enc.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const declared = Number(res.headers.get("Content-Length") || 0);
    if (declared > MAX_RESPONSE_CHARS) throw new Error("データが大きすぎます");
    // v21（外部レビューMEDIUM-06）: Content-Lengthが無い・正しくない場合に備え、読みながら量を数え、
    // 上限を超えたらその場で読むのをやめる（全部を読み込んでから確かめない）
    let text;
    if (res.body && res.body.getReader && window.TextDecoder) {
      const reader = res.body.getReader(), dec = new TextDecoder("utf-8", { fatal: true });
      let size = 0, parts = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_CHARS) {
          try { await reader.cancel(); } catch (e) { /* noop */ }
          throw new Error("データが大きすぎます");
        }
        parts.push(dec.decode(value, { stream: true }));
      }
      parts.push(dec.decode());
      text = parts.join("");
    } else {
      text = await res.text();   // 読みながら数えられない古いブラウザ
    }
    if (text.length > MAX_RESPONSE_CHARS) throw new Error("データが大きすぎます");
    const env = JSON.parse(text);
    if (!validEnvelope(env)) throw new Error("データの形式が違います");
    return env;
  }
  // 前回の暗号文は「この端末で次から入力を省く」を選んだときだけ保存する（オフラインでも見られるようにするため）
  function cachedEnvelope() {
    try {
      const env = JSON.parse(localStorage.getItem(BLOB_CACHE) || "null");
      return validEnvelope(env) ? env : null;
    } catch (e) { return null; }
  }
  function cacheEnvelope(env) {
    try { localStorage.setItem(BLOB_CACHE, JSON.stringify(env)); } catch (e) { /* 保存できなくても表示はできる */ }
  }
  function dropCache() {
    try { localStorage.removeItem(BLOB_CACHE); } catch (e) { /* noop */ }
  }

  async function deriveKey(passphrase, env) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normalize(passphrase)), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: b64(env.salt), iterations: env.iter },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  }
  async function decrypt(key, env) {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(env.iv), additionalData: AAD }, key, b64(env.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  const keyId = (env) => env.salt + ":" + env.iter;

  // ---------- パスフレーズ入力画面 ----------
  let pending = null;
  function ask(env, message) {
    if (pending) return pending;
    const lock = $("lock"), form = $("lock-form"), input = $("lock-pass"), err = $("lock-error"), btn = $("lock-submit");
    lock.hidden = false;
    document.body.classList.add("locked");
    err.textContent = message || "";
    input.value = "";
    setTimeout(() => input.focus(), 50);
    pending = new Promise((resolve) => {
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (!normalize(input.value)) { err.textContent = "パスフレーズを入力してください"; return; }
        btn.disabled = true; err.textContent = "確認しています…";
        try {
          const key = await deriveKey(input.value, env);
          const data = await decrypt(key, env);
          if ($("lock-remember").checked) {
            await saveKey(keyId(env), key);
            cacheEnvelope(env);
          } else {
            await forgetKeys();
            dropCache();
          }
          memo = { id: keyId(env), key };
          input.value = "";
          lock.hidden = true;
          document.body.classList.remove("locked");
          pending = null;
          resolve(data);
        } catch (e2) {
          err.textContent = "パスフレーズが違います（PCの setup_mobile で表示されたものを入力してください）";
        } finally {
          btn.disabled = false;
        }
      };
    });
    return pending;
  }

  // ---------- app.js から呼ばれる ----------
  let memo = null, lastOffline = false;
  async function load() {
    if (!window.crypto || !crypto.subtle) throw new Error("このブラウザでは暗号化データを開けません（https で開いてください）");
    let env = null, offline = false, fetchError = null;
    try { env = await fetchOnline(); } catch (e) { fetchError = e; }
    if (!env) {
      // 通信できないときだけ、前回保存した暗号文を使う（鍵も保存してあるときだけ開ける）
      env = cachedEnvelope();
      if (!env) {
        const why = fetchError && /^HTTP|形式|大きすぎ/.test(fetchError.message) ? fetchError.message : "通信できません";
        throw new Error(why + "（オフラインで見られるのは、この端末に鍵を保存しているときの前回の内容だけです）");
      }
      offline = true;
    }
    lastOffline = offline;
    const id = keyId(env);
    let key = memo && memo.id === id ? memo.key : null;
    if (!key) {
      key = await savedKey(id);
      if (key) memo = { id, key };
    }
    if (!key && !offline) {
      // PCでパスフレーズが作り直された（鍵の材料が変わった）: 古い鍵と古い暗号文はすぐに消す
      memo = null;
      await forgetKeys();
      dropCache();
    }
    if (key) {
      try {
        const data = await decrypt(key, env);
        if (!offline && (await savedKey(id))) cacheEnvelope(env);
        return data;
      } catch (e) {
        memo = null;
        await forgetKeys();
        dropCache();
        if (offline) throw new Error("保存していた内容を開けませんでした。通信できる場所で開き直してください");
        return ask(env, "パスフレーズが変わったようです。新しいパスフレーズを入力してください");
      }
    }
    if (offline) throw new Error("通信できません（この端末には鍵を保存していないため、オフラインでは開けません）");
    return ask(env, "");
  }

  function afterRender(d) {
    const at = new Date(d.generated_at);
    const hours = (Date.now() - at.getTime()) / 36e5;
    const when = at.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    $("updated").textContent = "PCで作成 " + when + (lastOffline ? "（オフライン）" : "");
    // スマホでは右上の更新時刻が隠れるので、日付の横に「いつの内容か」を出す
    $("date").textContent = when + " 時点" + (lastOffline ? "（オフライン）" : "");
    const banner = $("mobile-banner");
    const msgs = [];
    if (hours >= STALE_HOURS) {
      const ago = hours < 48 ? Math.round(hours) + "時間" : Math.round(hours / 24) + "日";
      msgs.push(`この内容は${ago}前にPCで作られたものです。PCを起動すると自動で新しくなります。`);
    }
    if (lastOffline) msgs.push("通信できないため、前回読み込んだ内容を表示しています。");
    banner.textContent = msgs.join(" ");
    banner.hidden = msgs.length === 0;
    if (msgs.length) document.body.classList.add("has-banner");
  }

  // ---------- 鍵を消す（この端末で見られないようにする） ----------
  function setupLockButton() {
    const b = $("forget");
    if (!b) return;
    b.addEventListener("click", async () => {
      if (!window.confirm("この端末に保存したパスフレーズを消します。次に開くときは入力が必要です。よろしいですか？")) return;
      memo = null;
      await forgetKeys();
      dropCache();
      location.reload();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupLockButton);
  else setupLockButton();

  // スマホでは右上の表示が隠れるので、失敗したことを画面の上のお知らせに出す
  function onError(e) {
    const banner = $("mobile-banner");
    banner.textContent = "読み込めませんでした：" + (e && e.message ? e.message : "不明なエラー");
    banner.hidden = false;
    document.body.classList.add("has-banner");
  }

  window.PCCSource = { load, afterRender, onError };
})();
