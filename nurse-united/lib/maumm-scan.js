/* 마음엠 공용 검사지 · 활동지 스캔 (MScan)
   종이 검사지 · 활동지를 사진으로 찍으면
   - 점수형(PHQ-9 · GAD-7 · 점검표 등): 문항마다 동그라미 · 체크한 칸을 찾아 점수를 채우고, 총점 · 해석 범위를 계산해요.
   - 글쓰기형(생각기록지 · 활동지 등): 칸 제목을 찾아 적힌 글을 칸별로 나눠 채워요.
   인식 결과는 항상 확인 화면에서 고친 뒤 저장해요 (노란 칸 = 확인이 필요한 문항).
   사진은 이 기기 안에서만 읽고, 어디에도 올리지 않아요.

   MScan.scan({ form, who, date, title, applyLabel, selfUse, onDone(rec) })  양식 하나 바로 스캔
   MScan.open({ app, forms, who:[{id,name}], whoLabel, selfUse, onSave(rec), history:{load,remove} })  양식 고르기부터
   MScan.history({ title, load:()=>recs, remove:(rec)=>{} })  저장한 기록 보기
   MScan.summary(rec)  보내기용 글
*/
(function () {
  'use strict';
  const BASE = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/[^/]*$/, '') : new URL('lib/', location.href).href;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const CRISIS_PRO = '9번 문항에 응답했어요. 오늘 안에 자살 · 자해 위험 평가를 하고, 필요하면 자살예방상담 109 · 정신건강위기상담 1577-0199로 연결하세요.';
  const CRISIS_SELF = '많이 힘드셨겠어요. 혼자 견디지 마세요. 지금 이야기 나눌 수 있는 곳이 있어요 — 자살예방상담 109 (24시간), 정신건강위기상담 1577-0199. 위급하면 119.';
  const F4 = ['전혀 아님', '여러 날', '일주일 이상', '거의 매일'];

  // ---- 기본 양식 ----
  const FORMS = {
    phq9: { id: 'phq9', name: 'PHQ-9 우울', icon: '🌧️', kind: 'scale', min: 0, max: 3, opts: F4, period: '지난 2주 동안', items: ['일에 흥미나 즐거움이 거의 없음', '기분이 가라앉거나 우울하거나 희망이 없음', '잠들기 어렵거나 자주 깸, 또는 너무 많이 잠', '피곤하고 기운이 거의 없음', '입맛이 없거나 너무 많이 먹음', '내가 실패했다거나 가족을 실망시켰다는 생각', '신문 · TV 등에 집중하기 어려움', '남이 알아챌 만큼 느리거나, 반대로 안절부절못함', '죽는 게 낫겠다거나 자해하고 싶은 생각'], bands: [[0, 4, '최소'], [5, 9, '경도'], [10, 14, '중등도'], [15, 19, '중등도-중증'], [20, 27, '중증']], flag: { item: 8, min: 1 }, note: '선별 검사예요. 진단은 전문가 면담으로 해요. 10점 이상이면 상담 · 진료 연계를 권해요.' },
    gad7: { id: 'gad7', name: 'GAD-7 불안', icon: '🌪️', kind: 'scale', min: 0, max: 3, opts: F4, period: '지난 2주 동안', items: ['초조하거나 불안하거나 조마조마함', '걱정을 멈추거나 조절할 수 없음', '여러 가지를 지나치게 걱정함', '편하게 쉬기 어려움', '너무 안절부절못해 가만히 있기 어려움', '쉽게 짜증 나거나 화가 남', '끔찍한 일이 생길 것 같아 두려움'], bands: [[0, 4, '최소'], [5, 9, '경도'], [10, 14, '중등도'], [15, 21, '중증']], note: '선별 검사예요. 10점 이상이면 상담 · 진료 연계를 권해요.' },
    thought: { id: 'thought', name: '생각 기록지', icon: '💭', kind: 'text', fields: [{ label: '상황', aliases: ['언제', '어디서', '사건'] }, { label: '떠오른 생각', aliases: ['자동적 사고', '자동적사고', '자동 사고'] }, { label: '감정 (0~100)', aliases: ['감정', '기분', '느낌'] }, { label: '그 생각의 근거', aliases: ['근거', '증거'] }, { label: '반대 근거', aliases: ['반대증거', '반대 증거', '다른 증거'] }, { label: '균형 잡힌 생각', aliases: ['대안적 사고', '대안', '다른 생각', '합리적 생각'] }, { label: '다시 느낀 감정 (0~100)', aliases: ['결과', '재평가', '지금 감정'] }] },
    free: { id: 'free', name: '활동지 (자유)', icon: '📝', kind: 'text', fields: [{ label: '내용', aliases: [] }], free: true },
  };
  const CUSTOM_KEY = (app) => 'mscan-forms:' + (app || 'app');
  function customs(app) { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY(app)) || '[]'); } catch (e) { return []; } }
  function saveCustoms(app, l) { try { localStorage.setItem(CUSTOM_KEY(app), JSON.stringify(l)); } catch (e) { /* */ } }
  const formOf = (f, app) => typeof f === 'string' ? (FORMS[f] || customs(app).find((x) => x.id === f)) : f;

  // ---- 공용 도구 ----
  function loadReader() {
    if (window.MReader) return Promise.resolve(window.MReader);
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = BASE + 'maumm-reader.js'; s.onload = () => res(window.MReader); s.onerror = () => rej(new Error('글자 인식 도구를 불러오지 못했어요 — 인터넷 연결을 확인해 주세요')); document.head.appendChild(s); });
  }
  const CSS = `.ms-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;display:flex;align-items:flex-end;justify-content:center;font-family:inherit}
.ms{background:#fff;color:#1B2623;width:100%;max-width:720px;max-height:93vh;overflow:auto;border-radius:20px 20px 0 0;padding:18px 16px 22px;font-size:15.5px;line-height:1.5}
@media(min-width:760px){.ms-bg{align-items:center}.ms{border-radius:20px}}
.ms h3{margin:0 0 4px;font-size:19px}.ms h4{margin:14px 0 6px;font-size:15px;color:#4E5B56}.ms .m{color:#5B6762;font-size:13.5px;margin:2px 0}
.ms button{font:inherit;cursor:pointer}.ms .b{background:var(--ms,#2F6B5E);color:#fff;border:0;border-radius:12px;padding:10px 15px;font-weight:700}.ms .b.g{background:#EDF2EF;color:#24433B}.ms .b.r{background:#FBE7E5;color:#A33A30}
.ms .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.ms .card{border:1px solid #E1E6DF;border-radius:16px;padding:12px;background:#FBFCFA;text-align:left}.ms .card b{display:block;font-size:15.5px}.ms .card span{font-size:12.5px;color:#5B6762}.ms .card .e{font-size:26px;line-height:1.2}
.ms .big{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:10px 0}.ms .big button{border:0;border-radius:16px;padding:16px 6px;font-weight:700;display:flex;flex-direction:column;align-items:center;gap:4px}.ms .big button i{font-style:normal;font-size:30px;line-height:1.1}
.ms select,.ms input[type=text],.ms input[type=date],.ms input[type=number],.ms textarea{font:inherit;font-size:15px;padding:8px 10px;border:1px solid #D3D9D2;border-radius:10px;background:#fff;max-width:100%;box-sizing:border-box}
.ms textarea{width:100%;min-height:64px;resize:vertical}.ms .f{display:block;font-size:13px;font-weight:700;color:#4E5B56;margin:10px 0 4px}
.ms .q{border-bottom:1px solid #EEF1EC;padding:8px 2px}.ms .q.u{background:#FFF7D6;border-radius:10px;padding:8px}.ms .q p{margin:0 0 6px;font-size:14.5px}.ms .q p small{color:#9A7B12;font-weight:700}
.ms .ch{display:flex;gap:5px;flex-wrap:wrap}.ms .ch button{min-width:44px;border:1px solid #D3D9D2;background:#fff;border-radius:10px;padding:6px 8px;font-weight:700;font-size:13.5px;color:#43514B;line-height:1.2}.ms .ch button.on{background:var(--ms,#2F6B5E);border-color:var(--ms,#2F6B5E);color:#fff}
.ms .tot{position:sticky;bottom:-22px;background:#fff;border-top:1px solid #E1E6DF;padding:10px 2px 4px;margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}.ms .tot b{font-size:22px}
.ms .alert{background:#FDE8E6;color:#8E2C22;border-radius:12px;padding:10px 12px;font-weight:700;margin:8px 0}.ms .note{background:#F3F6F2;border-radius:12px;padding:9px 12px;font-size:13.5px;color:#43514B;margin:8px 0}
.ms .ft{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:14px}.ms .img{max-width:100%;max-height:200px;border-radius:12px;border:1px solid #E1E6DF;display:block;margin:6px auto}
.ms .item{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #E3E7E1;border-radius:14px;margin:6px 0;background:#FBFCFA;cursor:pointer}.ms .item .t{flex:1;min-width:0}.ms .item .t span{display:block;font-size:13px;color:#5B6762}
.ms .bar{height:8px;background:#E7ECE6;border-radius:9px;overflow:hidden;margin:10px 0}.ms .bar i{display:block;height:100%;background:var(--ms,#2F6B5E);width:0;transition:width .3s}`;
  let COLOR = '#2F6B5E';
  function sheet(html) {
    if (!document.getElementById('ms-css')) { const s = document.createElement('style'); s.id = 'ms-css'; s.textContent = CSS; document.head.appendChild(s); }
    let bg = document.getElementById('ms-bg');
    if (!bg) { bg = document.createElement('div'); bg.id = 'ms-bg'; bg.className = 'ms-bg'; document.body.appendChild(bg); }
    bg.innerHTML = `<div class="ms" style="--ms:${esc(COLOR)}">${html}</div>`; return bg.firstChild;
  }
  function close() { const bg = document.getElementById('ms-bg'); if (bg) bg.remove(); }
  function toast(msg) { let t = document.getElementById('ms-toast'); if (!t) { t = document.createElement('div'); t.id = 'ms-toast'; t.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#1B2623;color:#fff;padding:10px 16px;border-radius:12px;z-index:10002;font-size:14.5px;max-width:86vw;text-align:center;font-family:inherit'; document.body.appendChild(t); } t.textContent = msg; t.style.display = 'block'; clearTimeout(t._t); t._t = setTimeout(() => { t.style.display = 'none'; }, 2600); }
  function pick(camera) {
    return new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = camera ? 'image/*' : 'image/*,.pdf'; if (camera) i.setAttribute('capture', 'environment'); i.style.display = 'none'; document.body.appendChild(i); i.onchange = () => { res(i.files[0] || null); i.remove(); }; i.click(); });
  }

  // ---- 사진 다듬기 ----
  async function toCanvas(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('사진을 열 수 없어요 (HEIC는 JPG로 바꿔 주세요)')); i.src = url; });
      const k = Math.min(3, Math.max(0.5, 2200 / Math.max(img.width, img.height)));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, cv.width, cv.height);
      // 그림자 · 조명 차이를 줄이려고 주변 밝기에 맞춰 흑백으로 바꿔요 (펜 색은 검게)
      const d = g.getImageData(0, 0, cv.width, cv.height), a = d.data, W = cv.width, H = cv.height;
      const gray = new Float32Array(W * H);
      for (let i = 0, p = 0; i < a.length; i += 4, p++) { const r = a[i], gg = a[i + 1], b = a[i + 2]; const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); gray[p] = (mx - mn > 60 && mx < 235) ? Math.min(0.299 * r + 0.587 * gg + 0.114 * b, 70) : 0.299 * r + 0.587 * gg + 0.114 * b; }
      const cs = 32, cw = Math.ceil(W / cs), chh = Math.ceil(H / cs), bgv = new Float32Array(cw * chh);
      for (let cy = 0; cy < chh; cy++) for (let cx = 0; cx < cw; cx++) { let mx = 0; for (let y = cy * cs; y < Math.min(H, cy * cs + cs); y += 4) for (let x = cx * cs; x < Math.min(W, cx * cs + cs); x += 4) { const v = gray[y * W + x]; if (v > mx) mx = v; } bgv[cy * cw + cx] = Math.max(mx, 90); }
      const bin = new Uint8Array(W * H);
      for (let y = 0, p = 0; y < H; y++) for (let x = 0; x < W; x++, p++) { const v = gray[p] / bgv[Math.floor(y / cs) * cw + Math.floor(x / cs)]; const o = v < 0.62 ? 0 : v > 0.82 ? 255 : Math.round((v - 0.62) / 0.2 * 255); a[p * 4] = a[p * 4 + 1] = a[p * 4 + 2] = o; bin[p] = o < 128 ? 1 : 0; }
      g.putImageData(d, 0, 0);
      const th = document.createElement('canvas'), tk = Math.min(1, 520 / Math.max(img.width, img.height)); th.width = Math.round(img.width * tk); th.height = Math.round(img.height * tk); th.getContext('2d').drawImage(img, 0, 0, th.width, th.height);
      return { cv, bin, W, H, thumb: th.toDataURL('image/jpeg', 0.6) };
    } finally { URL.revokeObjectURL(url); }
  }
  function ink(P, x0, y0, x1, y1) {
    x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0)); x1 = Math.min(P.W - 1, Math.round(x1)); y1 = Math.min(P.H - 1, Math.round(y1));
    let n = 0, t = 0; for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) { t++; n += P.bin[y * P.W + x]; } return t ? n / t : 0;
  }
  const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  function numOf(s) { s = String(s || '').trim(); const c = CIRC.indexOf(s[0]); if (c >= 0) return c + 1; const m = s.match(/^[(\[]?(\d{1,2})[.)．,\]]?(?!\d)/); return m ? Number(m[1]) : null; }
  function median(l) { const s = l.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; }

  // ---- 점수형 인식 ----
  function readScale(form, items, P) {
    const n = form.items.length, k = form.max - form.min + 1, M = window.MReader;
    const its = items.map((i) => ({ s: i.s, x: i.x, w: i.w, cy: -i.y, h: i.h }));
    // 1) 문항 줄 찾기: 번호(1. ① 1) 등)나 문항 글과 닮은 줄
    const rows = Array(n).fill(null);
    for (let q = 1; q <= n; q++) {
      const c = its.filter((i) => numOf(i.s) === q && i.x < P.W * 0.4).sort((a, b) => a.x - b.x);
      if (c.length) rows[q - 1] = { cy: c[0].cy, h: c[0].h, x: c[0].x };
    }
    const lines = []; its.slice().sort((a, b) => a.cy - b.cy).forEach((i) => { const l = lines.find((L) => Math.abs(L.cy - i.cy) < Math.max(L.h, i.h) * 0.6); if (l) { l.s += ' ' + i.s; l.items.push(i); } else lines.push({ cy: i.cy, h: i.h, s: i.s, items: [i] }); });
    form.items.forEach((t, q) => { if (rows[q]) return; let best = null, bs = 0.42; lines.forEach((L) => { const v = M.similar(L.s.replace(/^[\d①-⑳().\s]+/, '').slice(0, t.length + 6), t); if (v > bs) { bs = v; best = L; } }); if (best) rows[q] = { cy: best.cy, h: best.h, x: best.items[0].x }; });
    // 비어 있는 줄은 앞뒤 줄 간격으로 채워요
    const known = rows.map((r, q) => r ? q : -1).filter((q) => q >= 0);
    if (known.length >= 2) { const q0 = known[0], q1 = known[known.length - 1], step = (rows[q1].cy - rows[q0].cy) / (q1 - q0 || 1); rows.forEach((r, q) => { if (!r) rows[q] = { cy: rows[q0].cy + step * (q - q0), h: rows[q0].h, guess: true }; }); }
    const lh = median(rows.filter(Boolean).map((r) => r.h)) || 30;
    // 2) 선택지 칸 찾기: 칸마다 인쇄된 숫자(0 1 2 3)나 선택지 이름(전혀 아님 …)
    const vals = Array.from({ length: k }, (_, j) => form.min + j), colX = Array(k).fill(null);
    const byVal = vals.map(() => []);
    const keys = (form.keys || vals.map(String)).map((x) => String(x).toUpperCase());
    const top = Math.min(...rows.filter(Boolean).map((r) => r.cy)) - lh * 6;
    rows.forEach((r) => { if (!r) return; its.filter((i) => Math.abs(i.cy - r.cy) < lh * 0.9 && i.x > P.W * 0.3).forEach((i) => { const j = keys.indexOf(i.s.trim().toUpperCase()); if (j >= 0) byVal[j].push(i.x + i.w / 2); }); });
    byVal.forEach((l, j) => { if (l.length >= 2) colX[j] = median(l); });
    if (form.keys) its.filter((i) => i.cy > top && i.cy < (rows.find(Boolean) || { cy: 0 }).cy && i.x > P.W * 0.3).forEach((i) => { const j = keys.indexOf(i.s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')); if (j >= 0 && colX[j] == null) colX[j] = i.x + i.w / 2; });
    if (colX.filter((x) => x != null).length < k && form.opts) {
      form.opts.forEach((o, j) => { if (colX[j] != null) return; let best = null, bs = 0.55; its.forEach((i) => { const v = M.similar(i.s, o); if (v > bs && i.x > P.W * 0.25) { bs = v; best = i; } }); if (best) colX[j] = best.x + best.w / 2; });
    }
    if (colX.filter((x) => x != null).length < 2) {
      // 글자를 못 읽어도, 칸마다 인쇄된 표시(숫자 · 동그라미 · 네모)가 줄마다 같은 자리에 있으니 그 자리를 모아요
      const xs = [], nr = rows.filter(Boolean).length;
      rows.forEach((r) => { if (!r) return; its.filter((i) => Math.abs(i.cy - r.cy) < lh * 0.9 && i.x > P.W * 0.3 && i.s.trim().length <= 2).forEach((i) => xs.push(i.x + i.w / 2)); });
      xs.sort((a, b) => a - b); const cl = [];
      xs.forEach((x) => { const c = cl[cl.length - 1]; if (c && x - c[c.length - 1] < lh * 1.1) c.push(x); else cl.push([x]); });
      const good = cl.filter((c) => c.length >= Math.max(2, nr * 0.3)).map(median);
      if (good.length >= k) good.slice(-k).forEach((x, j) => { colX[j] = x; });
    }
    const got = colX.map((x, j) => x != null ? j : -1).filter((j) => j >= 0);
    if (got.length >= 2) { const j0 = got[0], j1 = got[got.length - 1], step = (colX[j1] - colX[j0]) / (j1 - j0); colX.forEach((x, j) => { if (x == null) colX[j] = colX[j0] + step * (j - j0); }); }
    else {
      // 칸을 못 찾으면 문항 글 오른쪽 끝부터 종이 오른쪽까지를 똑같이 나눠요
      const right = median(rows.filter(Boolean).map((r) => { const l = lines.find((L) => Math.abs(L.cy - r.cy) < lh * 0.6); return l ? Math.max(...l.items.filter((i) => !/^\d$/.test(i.s.trim())).map((i) => i.x + i.w)) : null; }).filter((x) => x != null && isFinite(x))) || P.W * 0.55;
      const span = (P.W * 0.96 - right) / k; colX.forEach((_, j) => { colX[j] = right + span * (j + 0.5); });
    }
    const gap = k > 1 ? Math.abs(colX[k - 1] - colX[0]) / (k - 1) : lh * 3;
    // 3) 줄 × 칸마다 펜 자국(잉크 양)을 재서, 가장 진한 칸을 고르기
    return rows.map((r) => {
      if (!r) return { v: null, u: true };
      const sc = colX.map((x) => ink(P, x - gap * 0.42, r.cy - lh * 0.95, x + gap * 0.42, r.cy + lh * 0.95));
      const order = sc.map((v, j) => [v, j]).sort((a, b) => b[0] - a[0]);
      const [top, j] = order[0], second = order[1] ? order[1][0] : 0, base = median(sc) || 0;
      const sure = top > 0.035 && top - second > Math.max(0.018, second * 0.35) && !r.guess;
      const some = top > base * 1.25 && top > 0.02;
      return { v: some ? vals[j] : null, u: !sure };
    });
  }
  // 글자만 있는 경우 (PDF · 숫자로 적은 답): 줄 끝 숫자를 점수로
  function readScaleText(form, text) {
    const n = form.items.length, ls = String(text).split('\n');
    return form.items.map((t, q) => { const l = ls.find((x) => numOf(x) === q + 1); if (!l) return { v: null, u: true }; const m = l.replace(/^[(\[]?\d{1,2}[.)．\]]?/, '').match(/(\d)\s*점?\s*$/); const v = m ? Number(m[1]) : null; return { v: v != null && v >= form.min && v <= form.max ? v : null, u: true }; }).slice(0, n);
  }
  // ---- 글쓰기형 인식 ----
  function readText(form, text) {
    const M = window.MReader, ls = String(text).split('\n').map((s) => s.trim()).filter(Boolean), out = {};
    if (form.free || form.fields.length === 1) { out[form.fields[0].label] = ls.join('\n'); return out; }
    const heads = [];
    ls.forEach((l, i) => {
      if (i < 3 && M.similar(l, form.name) > 0.6) return;
      const head = l.split(/[:：]/)[0].replace(/^[\d①-⑳().\s]+/, '').slice(0, 14);
      form.fields.forEach((f, j) => { const names = [f.label.replace(/\s*\(.*\)/, ''), ...(f.aliases || [])]; const v = Math.max(...names.map((x) => (head.startsWith(x) ? 1 : M.similar(head.slice(0, x.length + 2), x)))); if (v > 0.62 && !heads.some((h) => h.j === j)) heads.push({ i, j, v, rest: l.includes(':') || l.includes('：') ? l.split(/[:：]/).slice(1).join(':').trim() : l.slice(names.find((x) => head.startsWith(x)) ? names.find((x) => head.startsWith(x)).length : head.length).replace(/^[\s:：)-]+/, '').replace(/^[(（][^)）]*[)）]\s*/, '') }); });
    });
    heads.sort((a, b) => a.i - b.i);
    form.fields.forEach((f) => { out[f.label] = ''; });
    heads.forEach((h, x) => { const end = x + 1 < heads.length ? heads[x + 1].i : ls.length; out[form.fields[h.j].label] = [h.rest, ...ls.slice(h.i + 1, end)].filter(Boolean).join('\n'); });
    if (!heads.length) out[form.fields[0].label] = ls.join('\n');
    return out;
  }
  const bandOf = (form, t) => { const b = (form.bands || []).find(([a, z]) => t >= a && t <= z); return b ? b[2] : ''; };

  async function recognize(form, file, progress) {
    const M = await loadReader();
    if (/pdf$/i.test(file.name) || file.type === 'application/pdf') {
      progress('PDF를 읽는 중…'); const R = await M.read(file, progress);
      return { text: R.text, ans: form.kind === 'scale' ? readScaleText(form, R.text) : null, fields: form.kind === 'text' ? readText(form, R.text) : null };
    }
    progress('사진을 다듬는 중…'); const P = await toCanvas(file);
    progress('글자를 읽는 중… (처음에는 30초쯤 걸려요)');
    const items = await M.ocrCanvas(P.cv, (m) => progress(typeof m === 'string' ? m : '글자를 읽는 중…'));
    const text = (M.rowsFromItems(items) || []).map((r) => r.filter(Boolean).join(' ')).join('\n');
    return { text, thumb: P.thumb, ans: form.kind === 'scale' ? readScale(form, items, P) : null, fields: form.kind === 'text' ? readText(form, text) : null };
  }

  // ---- 화면: 사진 고르기 → 인식 → 확인 ----
  function scan(opt) {
    opt = Object.assign({}, opt); if (opt.color) COLOR = opt.color;
    const form = formOf(opt.form, opt.app); if (!form) { toast('양식을 찾지 못했어요'); return; }
    const sh = sheet(`<h3>${form.icon || '📷'} ${esc(opt.title || form.name)} 스캔</h3>
      <p class="m">${form.kind === 'scale' ? '동그라미 · 체크한 칸을 찾아 점수를 채워요.' : '칸 제목을 찾아 적힌 글을 칸별로 나눠요.'} 인식한 뒤 꼭 확인해 주세요.</p>
      <div class="big"><button id="ms-cam" style="background:#E3F2EC;color:#1E4A3F"><i>📷</i>사진 찍기</button><button id="ms-file" style="background:#E8EEFB;color:#253B6E"><i>🖼️</i>사진 · PDF</button><button id="ms-man" style="background:#F4F1EA;color:#5A4A2A"><i>✍️</i>직접 입력</button></div>
      <div class="note">📌 잘 읽히는 사진: 종이를 평평하게 · 그림자 없이 · 검사지가 화면에 꽉 차게 · 똑바로 위에서. 사진은 이 기기 안에서만 읽어요.</div>
      <div class="ft"><button class="b g" id="ms-x">닫기</button></div>`);
    sh.querySelector('#ms-x').onclick = () => { close(); opt.onCancel && opt.onCancel(); };
    const go = async (camera) => {
      const f = await pick(camera); if (!f) return;
      const s2 = sheet(`<h3>${form.icon || '📷'} 읽는 중…</h3><p class="m" id="ms-p">준비하는 중…</p><div class="bar"><i id="ms-bar"></i></div>`);
      let n = 0; const bar = s2.querySelector('#ms-bar'), p = s2.querySelector('#ms-p');
      const prog = (m) => { n = Math.min(95, n + 9); bar.style.width = n + '%'; if (m) p.textContent = typeof m === 'string' ? m : (m.status || '읽는 중…'); };
      try { const r = await recognize(form, f, prog); review(opt, form, r); }
      catch (e) { sheet(`<h3>읽지 못했어요</h3><div class="alert">${esc(e.message || e)}</div><div class="ft"><button class="b g" id="ms-m2">직접 입력</button><button class="b" id="ms-r">다시 하기</button></div>`); document.getElementById('ms-r').onclick = () => scan(opt); document.getElementById('ms-m2').onclick = () => review(opt, form, { manual: true }); }
    };
    sh.querySelector('#ms-cam').onclick = () => go(true);
    sh.querySelector('#ms-file').onclick = () => go(false);
    sh.querySelector('#ms-man').onclick = () => review(opt, form, { manual: true });
  }

  function review(opt, form, r) {
    const ans = form.kind === 'scale' ? (r.ans || form.items.map(() => ({ v: null, u: false }))).map((a) => ({ v: a.v, u: !!a.u && !r.manual })) : null;
    const fields = form.kind === 'text' ? Object.assign(Object.fromEntries(form.fields.map((f) => [f.label, ''])), r.fields || {}) : null;
    const st = { date: opt.date || today(), who: opt.who && opt.who.length === 1 ? opt.who[0].id : (opt.whoId || ''), memo: '' };
    const vals = Array.from({ length: form.kind === 'scale' ? form.max - form.min + 1 : 0 }, (_, j) => form.min + j);
    const draw = () => {
      const filled = ans ? ans.filter((a) => a.v != null).length : 0, total = ans ? ans.reduce((s, a) => s + (a.v || 0), 0) : 0;
      const unsure = ans ? ans.filter((a) => a.u).length : 0;
      const flag = form.flag && ans && ans[form.flag.item] && ans[form.flag.item].v >= form.flag.min;
      const who = opt.who && opt.who.length > 1 ? `<label class="f">${esc(opt.whoLabel || '대상')}<select id="ms-who"><option value="">고르기</option>${opt.who.map((w) => `<option value="${esc(w.id)}"${st.who === w.id ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</select></label>` : '';
      const sh = sheet(`<h3>${form.icon || '📋'} ${esc(form.name)} 확인</h3>
        ${r.manual ? '<p class="m">점수를 눌러 넣어 주세요.</p>' : `<p class="m">${ans ? (unsure ? `<b style="color:#9A7B12">노란 문항 ${unsure}개</b>는 사진과 비교해 확인해 주세요.` : '인식이 끝났어요. 사진과 한 번 비교해 주세요.') : '칸별로 나눴어요. 틀린 글자는 고쳐 주세요.'}</p>`}
        ${r.thumb ? `<details><summary class="m" style="cursor:pointer">📷 찍은 사진 보기</summary><img class="img" src="${r.thumb}" alt=""></details>` : ''}
        ${opt.bare ? '' : `<div style="display:flex;gap:8px;flex-wrap:wrap">${who}<label class="f">날짜<input type="date" id="ms-d" value="${esc(st.date)}"></label></div>`}
        ${ans ? `${form.period && !form.keys ? `<p class="m">${esc(form.period)} · ${vals.map((v, j) => `${v} ${esc((form.opts || [])[j] || '')}`).join(' · ')}</p>` : ''}${form.items.map((t, q) => `<div class="q${ans[q].u ? ' u' : ''}"><p>${q + 1}. ${esc(t)}${ans[q].u ? ' <small>확인</small>' : ''}</p><div class="ch">${vals.map((v, j) => `<button data-q="${q}" data-v="${v}" class="${ans[q].v === v ? 'on' : ''}">${form.keys ? esc(form.keys[j]) : v}${form.opts && form.opts[j] && vals.length <= 5 ? `<br><span style="font-weight:500;font-size:11px">${esc(form.opts[j])}</span>` : ''}</button>`).join('')}</div></div>`).join('')}
          ${flag ? `<div class="alert">⚠️ ${esc(opt.selfUse ? CRISIS_SELF : CRISIS_PRO)}</div>` : ''}
          ${form.note ? `<div class="note">${esc(form.note)}</div>` : ''}` : ''}
        ${fields ? form.fields.map((f, j) => `<label class="f">${esc(f.label)}<textarea data-fl="${j}" rows="${form.free ? 8 : 3}">${esc(fields[f.label])}</textarea></label>`).join('') : ''}
        ${r.text && ans ? `<details><summary class="m" style="cursor:pointer">읽은 글자 전체</summary><pre style="white-space:pre-wrap;font-size:12.5px;background:#F7F8F5;padding:8px;border-radius:10px">${esc(r.text)}</pre></details>` : ''}
        ${opt.bare ? '' : `<label class="f">메모 (안 써도 돼요)<input type="text" id="ms-memo" value="${esc(st.memo)}" maxlength="200"></label>`}
        <div class="tot">${ans && form.noTotal ? `<span class="m">${filled}/${form.items.length} 문항</span>` : ''}${ans && !form.noTotal ? `<span>총점</span><b>${total}</b><span class="m">${filled < form.items.length ? `${form.items.length - filled}문항 남음` : esc(bandOf(form, total) || (form.items.length ? '평균 ' + (total / form.items.length).toFixed(1) : ''))}</span>` : ''}<span style="flex:1"></span><button class="b g" id="ms-again">다시 찍기</button><button class="b" id="ms-ok">${esc(opt.applyLabel || '저장')}</button></div>`);
      const keep = () => { const dd = sh.querySelector('#ms-d'); if (dd) st.date = dd.value || st.date; const w = sh.querySelector('#ms-who'); if (w) st.who = w.value; const mm = sh.querySelector('#ms-memo'); if (mm) st.memo = mm.value; sh.querySelectorAll('[data-fl]').forEach((t) => { fields[form.fields[t.dataset.fl].label] = t.value; }); };
      sh.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { keep(); const q = Number(b.dataset.q), v = Number(b.dataset.v); ans[q].v = ans[q].v === v ? null : v; ans[q].u = false; const top = sh.scrollTop; draw(); document.querySelector('#ms-bg .ms').scrollTop = top; }; });
      sh.querySelector('#ms-again').onclick = () => scan(opt);
      sh.querySelector('#ms-ok').onclick = async () => {
        keep();
        if (ans && ans.some((a) => a.v == null)) { toast('모든 문항에 점수를 넣어 주세요'); return; }
        if (opt.who && opt.who.length > 1 && !st.who) { toast((opt.whoLabel || '대상') + '을 골라 주세요'); return; }
        if (fields && !Object.values(fields).some((v) => v.trim())) { toast('내용이 비어 있어요'); return; }
        const w = (opt.who || []).find((x) => x.id === st.who);
        const total = ans ? ans.reduce((s, a) => s + a.v, 0) : null;
        const rec = { id: 's' + Date.now().toString(36), form: form.id, name: form.name, kind: form.kind, date: st.date, who: w ? { id: w.id, name: w.name } : null, items: ans ? ans.map((a) => a.v) : null, total, band: ans ? bandOf(form, total) : '', flag: !!(form.flag && ans && ans[form.flag.item].v >= form.flag.min), fields: fields || null, memo: st.memo.trim(), src: r.manual ? 'manual' : 'scan', at: new Date().toISOString() };
        try { const b = sh.querySelector('#ms-ok'); b.disabled = true; await (opt.onDone || opt.onSave || (() => {}))(rec); close(); toast(opt.doneMsg || '저장했어요'); } catch (e) { toast('저장하지 못했어요 — ' + (e.message || e)); sh.querySelector('#ms-ok').disabled = false; }
      };
    };
    draw();
  }

  // ---- 양식 고르기 (+ 직접 만들기) ----
  function open(opt) {
    opt = Object.assign({ forms: ['phq9', 'gad7', 'thought', 'free'] }, opt); if (opt.color) COLOR = opt.color;
    const list = [...opt.forms.map((f) => formOf(f, opt.app)).filter(Boolean), ...customs(opt.app)];
    const sh = sheet(`<h3>📷 검사지 · 활동지 스캔</h3><p class="m">종이에 적은 검사지 · 활동지를 사진으로 찍으면 점수와 글을 채워 드려요.</p>
      <div class="grid" style="margin-top:10px">${list.map((f) => `<button class="card" data-f="${esc(f.id)}"><div class="e">${f.icon || (f.kind === 'scale' ? '📊' : '📝')}</div><b>${esc(f.name)}</b><span>${f.kind === 'scale' ? `${f.items.length}문항 · ${f.min}~${f.max}점` : f.fields.length > 1 ? f.fields.map((x) => x.label.replace(/\s*\(.*\)/, '')).slice(0, 3).join(' · ') + (f.fields.length > 3 ? ' …' : '') : '자유롭게 적은 글'}</span>${f.custom ? '<span style="color:#2F6B5E">직접 만든 양식</span>' : ''}</button>`).join('')}
      <button class="card" id="ms-new" style="border-style:dashed"><div class="e">＋</div><b>양식 만들기</b><span>우리 기관 검사지 · 활동지</span></button></div>
      <div class="ft">${opt.history ? '<button class="b g" id="ms-h">🗂️ 저장한 기록</button>' : ''}<button class="b g" id="ms-x">닫기</button></div>`);
    sh.querySelector('#ms-x').onclick = close;
    const h = sh.querySelector('#ms-h'); if (h) h.onclick = () => history(Object.assign({ back: () => open(opt) }, opt.history));
    sh.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { const f = list.find((x) => x.id === b.dataset.f); scan(Object.assign({}, opt, { form: f, onDone: opt.onSave })); }; b.oncontextmenu = (e) => { const f = list.find((x) => x.id === b.dataset.f); if (f.custom) { e.preventDefault(); maker(opt, f); } }; });
    sh.querySelector('#ms-new').onclick = () => maker(opt);
  }
  function maker(opt, f, cur) {
    const ed = cur || (f ? JSON.parse(JSON.stringify(f)) : { id: 'c' + Date.now().toString(36), name: '', kind: 'scale', min: 0, max: 3, items: [], opts: [], fields: [], custom: true, icon: '📋' });
    const sh = sheet(`<h3>${f ? '✏️ 양식 고치기' : '＋ 양식 만들기'}</h3><p class="m">종이 검사지 · 활동지와 똑같이 적으면 더 잘 읽어요.</p>
      <label class="f">양식 이름<input type="text" id="mk-n" value="${esc(ed.name)}" placeholder="예) 주간 기분 점검표" style="width:100%"></label>
      <span class="f">종류</span><div class="ch"><button data-k="scale" class="${ed.kind === 'scale' ? 'on' : ''}">📊 점수형 (동그라미 · 체크)</button><button data-k="text" class="${ed.kind === 'text' ? 'on' : ''}">📝 글쓰기형 (칸에 적기)</button></div>
      ${ed.kind === 'scale' ? `<label class="f">문항 (한 줄에 하나씩)<textarea id="mk-i" rows="7" placeholder="잠을 잘 잤다&#10;식사를 제때 했다">${esc((ed.items || []).join('\n'))}</textarea></label>
        <div style="display:flex;gap:8px"><label class="f">가장 낮은 점수<input type="number" id="mk-min" value="${ed.min}" min="0" max="9" style="width:90px"></label><label class="f">가장 높은 점수<input type="number" id="mk-max" value="${ed.max}" min="1" max="10" style="width:90px"></label></div>
        <label class="f">선택지 이름 (쉼표로, 안 써도 돼요)<input type="text" id="mk-o" value="${esc((ed.opts || []).join(', '))}" placeholder="전혀 아님, 가끔, 자주, 항상" style="width:100%"></label>
        <label class="f">해석 범위 (안 써도 돼요 · 한 줄에 하나)<textarea id="mk-b" rows="3" placeholder="0-5 낮음&#10;6-10 보통&#10;11-15 높음">${esc((ed.bands || []).map((b) => `${b[0]}-${b[1]} ${b[2]}`).join('\n'))}</textarea></label>`
        : `<label class="f">칸 제목 (한 줄에 하나씩)<textarea id="mk-f" rows="6" placeholder="오늘 한 활동&#10;느낀 점&#10;다음 목표">${esc((ed.fields || []).map((x) => x.label).join('\n'))}</textarea></label>`}
      <div class="ft">${f ? '<button class="b r" id="mk-del" style="margin-right:auto">지우기</button>' : ''}<button class="b g" id="mk-c">취소</button><button class="b" id="mk-s">저장</button></div>`);
    const keep = () => {
      ed.name = sh.querySelector('#mk-n').value.trim();
      if (ed.kind === 'scale') { ed.items = sh.querySelector('#mk-i').value.split('\n').map((s) => s.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean); ed.min = Math.max(0, parseInt(sh.querySelector('#mk-min').value, 10) || 0); ed.max = Math.max(ed.min + 1, parseInt(sh.querySelector('#mk-max').value, 10) || ed.min + 1); ed.opts = sh.querySelector('#mk-o').value.split(/[,，]/).map((s) => s.trim()).filter(Boolean); ed.bands = sh.querySelector('#mk-b').value.split('\n').map((l) => l.match(/^\s*(\d+)\s*[-~]\s*(\d+)\s*(.*)$/)).filter(Boolean).map((m) => [Number(m[1]), Number(m[2]), m[3].trim()]); }
      else ed.fields = sh.querySelector('#mk-f').value.split('\n').map((s) => s.trim()).filter(Boolean).map((label) => ({ label, aliases: [] }));
    };
    sh.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => { keep(); ed.kind = b.dataset.k; ed.icon = ed.kind === 'scale' ? '📋' : '🗒️'; maker(opt, f, ed); }; });
    sh.querySelector('#mk-c').onclick = () => open(opt);
    const del = sh.querySelector('#mk-del'); if (del) del.onclick = () => { saveCustoms(opt.app, customs(opt.app).filter((x) => x.id !== ed.id)); open(opt); };
    sh.querySelector('#mk-s').onclick = () => {
      keep();
      if (!ed.name) { toast('양식 이름을 적어 주세요'); return; }
      if (ed.kind === 'scale' && !ed.items.length) { toast('문항을 한 줄에 하나씩 적어 주세요'); return; }
      if (ed.kind === 'text' && !ed.fields.length) { toast('칸 제목을 적어 주세요'); return; }
      if (ed.kind === 'text' && ed.fields.length === 1) ed.free = true; else delete ed.free;
      const l = customs(opt.app).filter((x) => x.id !== ed.id); l.push(ed); saveCustoms(opt.app, l); toast('양식을 저장했어요 — 길게 누르면 고칠 수 있어요'); open(opt);
    };
  }

  // ---- 저장한 기록 ----
  function summary(rec) {
    const L = [`[${rec.name}] ${rec.date}${rec.who ? ' · ' + rec.who.name : ''}`];
    if (rec.items) { L.push(`총점 ${rec.total}${rec.band ? ' (' + rec.band + ')' : ''}`); L.push('문항: ' + rec.items.map((v, i) => `${i + 1})${v}`).join(' ')); if (rec.flag) L.push('※ 안전 확인 필요 문항 응답'); }
    if (rec.fields) Object.entries(rec.fields).forEach(([k, v]) => { if (String(v).trim()) L.push(`■ ${k}\n${v}`); });
    if (rec.memo) L.push('메모: ' + rec.memo);
    return L.join('\n');
  }
  async function history(opt) {
    opt = opt || {}; let recs = []; try { recs = (await opt.load()) || []; } catch (e) { recs = []; }
    recs = recs.slice().sort((a, b) => String(b.date + b.at).localeCompare(String(a.date + a.at)));
    const sh = sheet(`<h3>🗂️ ${esc(opt.title || '저장한 스캔 기록')}</h3>${recs.length ? recs.map((r, i) => `<div class="item" data-r="${i}"><div style="font-size:24px">${r.kind === 'scale' ? '📊' : '📝'}</div><div class="t"><b>${esc(r.name)}</b><span>${esc(r.date)}${r.who ? ' · ' + esc(r.who.name) : ''}${r.items ? ` · ${r.total}점${r.band ? ' ' + esc(r.band) : ''}` : ''}${r.flag ? ' · <b style="color:#B03A3A">안전 확인</b>' : ''}</span></div><span>›</span></div>`).join('') : '<p class="m">아직 저장한 기록이 없어요.</p>'}
      <div class="ft">${opt.back ? '<button class="b g" id="ms-bk">‹ 뒤로</button>' : ''}<button class="b" id="ms-x">닫기</button></div>`);
    sh.querySelector('#ms-x').onclick = close; const bk = sh.querySelector('#ms-bk'); if (bk) bk.onclick = opt.back;
    sh.querySelectorAll('[data-r]').forEach((d) => { d.onclick = () => { const r = recs[d.dataset.r]; const s2 = sheet(`<h3>${r.kind === 'scale' ? '📊' : '📝'} ${esc(r.name)}</h3><pre style="white-space:pre-wrap;font:inherit;font-size:14.5px;background:#F7F8F5;padding:10px 12px;border-radius:12px">${esc(summary(r))}</pre>
      <div class="ft">${opt.remove ? '<button class="b r" id="ms-del" style="margin-right:auto">지우기</button>' : ''}<button class="b g" id="ms-send">📤 보내기</button><button class="b g" id="ms-bk2">‹ 목록</button></div>`);
      s2.querySelector('#ms-bk2').onclick = () => history(opt);
      s2.querySelector('#ms-send').onclick = async () => { const M = await loadReader(); M.send({ title: r.name, text: summary(r), subject: r.name + ' ' + r.date }); };
      const del = s2.querySelector('#ms-del'); if (del) del.onclick = async () => { if (!confirm('이 기록을 지울까요?')) return; await opt.remove(r); toast('지웠어요'); history(opt); };
    }; });
  }

  window.MScan = { FORMS, scan, open, history, summary, close, recognize, forms: (app) => [...Object.values(FORMS), ...customs(app)] };
})();
