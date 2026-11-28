/* 마음엠 공용 '오늘' 카드 (MToday): 오늘 날씨 + 이번 달 달력
   - 날씨: Open-Meteo (무료 · 열쇠 없음). 지역은 처음에 고르고(기본 서울), 30분 동안은 저장해 둔 값을 써요.
   - 달력: 앱이 넘겨준 일정(회기 · 출석 · 주문 · 기록 등)을 날짜마다 점 · 그림으로 보여 주고, 날짜를 누르면 그날 일정을 펼쳐요.
   MToday.mount(el, { app, color, weather:true, calendar:true, events:(y,m)=>({ 'YYYY-MM-DD':[{t:'글', e:'🍱', c:'#색'}] }), onDay:(ds)=>{}, note })
   MToday.refresh()  앱 자료가 바뀌었을 때 달력만 다시 그려요
*/
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const DAYS = '일월화수목금토';
  const PLACES = [['서울', 37.5665, 126.978], ['용인', 37.2411, 127.1776], ['수원', 37.2636, 127.0286], ['성남', 37.4201, 127.1265], ['인천', 37.4563, 126.7052], ['시흥', 37.38, 126.8029], ['남해', 34.8376, 127.8924], ['부산', 35.1796, 129.0756], ['대구', 35.8714, 128.6014], ['광주', 35.1595, 126.8526], ['대전', 36.3504, 127.3845], ['제주', 33.4996, 126.5312]];
  // WMO 날씨 코드 → 그림 · 말
  function wx(code) {
    const c = Number(code);
    if (c === 0) return ['☀️', '맑음']; if (c === 1) return ['🌤️', '대체로 맑음']; if (c === 2) return ['⛅', '구름 조금']; if (c === 3) return ['☁️', '흐림'];
    if (c === 45 || c === 48) return ['🌫️', '안개']; if (c >= 51 && c <= 57) return ['🌦️', '이슬비']; if (c >= 61 && c <= 67) return ['🌧️', '비'];
    if (c >= 71 && c <= 77) return ['🌨️', '눈']; if (c >= 80 && c <= 82) return ['🌦️', '소나기']; if (c === 85 || c === 86) return ['🌨️', '눈 소나기'];
    if (c >= 95) return ['⛈️', '뇌우']; return ['🌡️', '날씨'];
  }
  const LS = { get(k, d) { try { const v = localStorage.getItem('mtoday:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('mtoday:' + k, JSON.stringify(v)); } catch (e) { /* */ } } };
  const CSS = `.mt{border-radius:18px;padding:14px 14px 10px;margin:0 0 14px;background:var(--mt-bg,#fff);border:1px solid rgba(0,0,0,.08);box-shadow:0 2px 10px rgba(0,0,0,.04);color:inherit;font-family:inherit}
.mt-top{display:flex;align-items:center;gap:10px}.mt-date{flex:1;min-width:0}.mt-date b{display:block;font-size:18px;line-height:1.25}.mt-date span{font-size:13px;opacity:.7}
.mt-wx{display:flex;align-items:center;gap:8px;border:0;background:var(--mt-soft,#F1F5F3);border-radius:14px;padding:6px 10px;cursor:pointer;font:inherit;color:inherit;text-align:left}
.mt-wx i{font-style:normal;font-size:28px;line-height:1}.mt-wx b{font-size:18px}.mt-wx small{display:block;font-size:11.5px;opacity:.75;line-height:1.3}
.mt-fc{display:flex;gap:6px;margin-top:10px;overflow-x:auto}.mt-fc div{flex:1;min-width:58px;text-align:center;background:var(--mt-soft,#F1F5F3);border-radius:12px;padding:6px 2px;font-size:12px;line-height:1.35}.mt-fc div i{font-style:normal;font-size:19px;display:block}
.mt-cal{margin-top:12px}.mt-ch{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}.mt-ch b{font-size:15px}.mt-ch button,.mt-fold{border:0;background:transparent;font:inherit;color:inherit;cursor:pointer;padding:4px 8px;border-radius:10px;font-size:15px}
.mt-g{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center}.mt-g .h{font-size:11.5px;opacity:.6;padding:2px 0}.mt-g .h:first-child{color:#D9534F}.mt-g .h:last-child{color:#3B6FD8}
.mt-g button{border:0;background:transparent;border-radius:10px;min-height:44px;padding:3px 0 2px;font:inherit;color:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:1px}
.mt-g button .n{font-size:13.5px;line-height:1.2}.mt-g button .e{font-size:11px;line-height:1.1;min-height:12px;white-space:nowrap;overflow:hidden;max-width:100%}
.mt-g button.o{opacity:.3}.mt-g button.su .n{color:#D9534F}.mt-g button.sa .n{color:#3B6FD8}
.mt-g button.t{background:var(--mt-c,#2F6B5E);color:#fff}.mt-g button.t .n{color:#fff;font-weight:700}.mt-g button.sel{outline:2px solid var(--mt-c,#2F6B5E);outline-offset:-2px}
.mt-dots{display:flex;gap:2px;justify-content:center;min-height:6px}.mt-dots i{width:5px;height:5px;border-radius:50%;display:block}
.mt-day{margin-top:8px;background:var(--mt-soft,#F1F5F3);border-radius:12px;padding:8px 12px;font-size:14px}.mt-day p{margin:3px 0}
.mt-src{font-size:10.5px;opacity:.5;text-align:right;margin-top:6px}
.mt-sh{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;display:flex;align-items:flex-end;justify-content:center}.mt-sh>div{background:#fff;color:#1B2623;width:100%;max-width:520px;border-radius:20px 20px 0 0;padding:18px 16px 22px;max-height:85vh;overflow:auto}
@media(min-width:700px){.mt-sh{align-items:center}.mt-sh>div{border-radius:20px}}
.mt-sh h3{margin:0 0 10px;font-size:18px}.mt-sh input{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:10px 12px;border:1px solid #D3D9D2;border-radius:12px}
.mt-chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.mt-chips button{border:1px solid #D3D9D2;background:#fff;border-radius:999px;padding:7px 13px;font:inherit;font-size:14.5px;cursor:pointer}.mt-chips button.on{background:var(--mt-c,#2F6B5E);color:#fff;border-color:var(--mt-c,#2F6B5E)}`;
  const mounts = [];
  function css() { if (!document.getElementById('mt-css')) { const s = document.createElement('style'); s.id = 'mt-css'; s.textContent = CSS; document.head.appendChild(s); } }

  // ---- 날씨 ----
  async function getWeather(force) {
    const pl = LS.get('place', { n: '서울', la: 37.5665, lo: 126.978 });
    const c = LS.get('wx', null);
    if (!force && c && c.n === pl.n && Date.now() - c.at < 30 * 6e4) return c;
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${pl.la}&longitude=${pl.lo}&current=temperature_2m,weather_code,apparent_temperature&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=4`;
    const r = await fetch(u); if (!r.ok) throw new Error('날씨를 불러오지 못했어요');
    const j = await r.json();
    const v = { n: pl.n, at: Date.now(), t: j.current && j.current.temperature_2m, f: j.current && j.current.apparent_temperature, code: j.current && j.current.weather_code, d: (j.daily && j.daily.time || []).map((t, i) => ({ t, code: j.daily.weather_code[i], hi: j.daily.temperature_2m_max[i], lo: j.daily.temperature_2m_min[i], p: j.daily.precipitation_probability_max ? j.daily.precipitation_probability_max[i] : null })) };
    LS.set('wx', v); return v;
  }
  function placeSheet(after) {
    css(); const cur = LS.get('place', { n: '서울' });
    const bg = document.createElement('div'); bg.className = 'mt-sh';
    bg.innerHTML = `<div><h3>🌤️ 날씨 지역</h3><div class="mt-chips">${PLACES.map(([n]) => `<button data-p="${n}" class="${cur.n === n ? 'on' : ''}">${n}</button>`).join('')}<button data-here="1">📍 지금 위치</button></div>
      <input id="mt-q" placeholder="다른 지역 이름 (예: 처인구, 강릉)"><div id="mt-r" class="mt-chips"></div><p style="font-size:12.5px;opacity:.65;margin:8px 0 0">지역은 이 기기에만 저장돼요.</p>
      <div style="text-align:right;margin-top:10px"><button id="mt-x" style="border:0;background:#EDF2EF;border-radius:12px;padding:10px 16px;font:inherit;font-weight:700;cursor:pointer">닫기</button></div></div>`;
    document.body.appendChild(bg);
    const done = (p) => { if (p) { LS.set('place', p); LS.set('wx', null); } bg.remove(); if (p && after) after(); };
    bg.onclick = (e) => { if (e.target === bg) done(); };
    bg.querySelector('#mt-x').onclick = () => done();
    bg.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { const p = PLACES.find((x) => x[0] === b.dataset.p); done({ n: p[0], la: p[1], lo: p[2] }); }; });
    bg.querySelector('[data-here]').onclick = () => {
      if (!navigator.geolocation) { alert('이 기기에서는 위치를 쓸 수 없어요. 지역을 골라 주세요.'); return; }
      navigator.geolocation.getCurrentPosition((pos) => done({ n: '지금 위치', la: +pos.coords.latitude.toFixed(3), lo: +pos.coords.longitude.toFixed(3) }), () => alert('위치를 가져오지 못했어요. 지역을 골라 주세요.'), { timeout: 8000, maximumAge: 6e5 });
    };
    let t = null; const q = bg.querySelector('#mt-q'), res = bg.querySelector('#mt-r');
    q.oninput = () => { clearTimeout(t); const v = q.value.trim(); if (v.length < 2) { res.innerHTML = ''; return; } t = setTimeout(async () => {
      try { const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(v)}&count=6&language=ko&countryCode=KR`); const j = await r.json();
        res.innerHTML = (j.results || []).map((x, i) => `<button data-g="${i}">${esc(x.name)}${x.admin1 ? ' · ' + esc(x.admin1) : ''}</button>`).join('') || '<span style="opacity:.6">찾지 못했어요</span>';
        res.querySelectorAll('[data-g]').forEach((b) => { b.onclick = () => { const x = j.results[+b.dataset.g]; done({ n: x.name, la: x.latitude, lo: x.longitude }); }; });
      } catch (e) { res.innerHTML = '<span style="opacity:.6">검색하지 못했어요 — 인터넷 연결을 확인해 주세요</span>'; } }, 350); };
  }

  // ---- 그리기 ----
  function draw(M) {
    const o = M.o, el = M.el; css();
    el.style.setProperty('--mt-c', o.color || '#2F6B5E'); el.style.setProperty('--mt-soft', o.soft || 'rgba(0,0,0,.045)');
    const now = new Date(), y = M.y, m = M.m, ds = ymd(now);
    const fold = LS.get('fold:' + o.app, !!o.fold);
    const W = M.wx;
    const wxHtml = o.weather === false ? '' : W ? (() => { const [ic, tx] = wx(W.code), d0 = W.d[0] || {}; return `<button class="mt-wx" data-wx title="지역 바꾸기"><i>${ic}</i><span><b>${Math.round(W.t)}°</b> <small>${esc(W.n)} · ${tx}<br>${d0.lo != null ? `${Math.round(d0.lo)}° / ${Math.round(d0.hi)}°` : ''}${d0.p != null ? ` · ☔ ${d0.p}%` : ''}</small></span></button>`; })()
      : `<button class="mt-wx" data-wx><i>🌤️</i><span><small>${M.err ? esc(M.err) : '날씨 불러오는 중…'}<br>눌러서 지역 고르기</small></span></button>`;
    const fc = o.weather !== false && W && W.d.length > 1 ? `<div class="mt-fc">${W.d.slice(1, 4).map((d) => { const dt = new Date(d.t + 'T00:00'); return `<div>${['내일', '모레'][Math.round((dt - new Date(ds + 'T00:00')) / 864e5) - 1] || `${dt.getMonth() + 1}/${dt.getDate()}(${DAYS[dt.getDay()]})`}<i>${wx(d.code)[0]}</i>${Math.round(d.lo)}°/${Math.round(d.hi)}°${d.p != null && d.p >= 30 ? `<br>☔${d.p}%` : ''}</div>`; }).join('')}</div>` : '';
    let cal = '';
    if (o.calendar !== false) {
      let ev = {}; try { ev = (o.events && o.events(y, m)) || {}; } catch (e) { ev = {}; }
      const first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay()), cells = [];
      const weeks = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7);
      for (let i = 0; i < weeks * 7; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i); const k = ymd(d), L = ev[k] || [];
        const emo = L.filter((x) => x.e).slice(0, 2).map((x) => x.e).join('');
        cells.push(`<button data-d="${k}" class="${d.getMonth() !== m ? 'o' : ''} ${d.getDay() === 0 ? 'su' : d.getDay() === 6 ? 'sa' : ''} ${k === ds ? 't' : ''} ${k === M.sel ? 'sel' : ''}" aria-label="${d.getMonth() + 1}월 ${d.getDate()}일${L.length ? ' 일정 ' + L.length + '개' : ''}"><span class="n">${d.getDate()}</span><span class="e">${emo}</span><span class="mt-dots">${emo ? '' : L.slice(0, 3).map((x) => `<i style="background:${esc(x.c || o.color || '#2F6B5E')}"></i>`).join('')}</span></button>`);
      }
      const ti = cells.findIndex((c, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return ymd(d) === (M.sel || ds); });
      const wk = ti >= 0 ? Math.floor(ti / 7) : 0;
      const sel = M.sel && ev[M.sel] ? ev[M.sel] : M.sel ? [] : null;
      cal = `<div class="mt-cal"><div class="mt-ch"><button data-mv="-1" aria-label="지난달">‹</button><b>${y}년 ${m + 1}월</b><span><button data-mv="0" style="font-size:13px">오늘</button><button data-mv="1" aria-label="다음 달">›</button></span></div>
        <div class="mt-g">${[...DAYS].map((x) => `<span class="h">${x}</span>`).join('')}${fold ? cells.slice(wk * 7, wk * 7 + 7).join('') : cells.join('')}</div>
        ${sel ? `<div class="mt-day"><b>${Number(M.sel.slice(5, 7))}월 ${Number(M.sel.slice(8))}일 (${DAYS[new Date(M.sel + 'T00:00').getDay()]})</b>${sel.length ? sel.map((x) => `<p>${x.e || '•'} ${esc(x.t)}</p>`).join('') : '<p style="opacity:.6">일정이 없어요</p>'}${o.onDay ? `<p style="text-align:right;margin:6px 0 0"><button data-go style="border:0;background:var(--mt-c,#2F6B5E);color:#fff;border-radius:10px;padding:6px 12px;font:inherit;font-size:13.5px;cursor:pointer">${esc(o.dayLabel || '이 날로 가기')} ›</button></p>` : ''}</div>` : ''}
        <div style="text-align:center"><button class="mt-fold" data-fold>${fold ? '한 달 보기 ▾' : '이번 주만 보기 ▴'}</button></div></div>`;
    }
    el.innerHTML = `<div class="mt"><div class="mt-top"><div class="mt-date"><b>${now.getMonth() + 1}월 ${now.getDate()}일 ${DAYS[now.getDay()]}요일</b><span>${esc(o.note || '')}</span></div>${wxHtml}</div>${fc}${cal}${o.weather !== false && W ? '<div class="mt-src">날씨: Open-Meteo</div>' : ''}</div>`;
    const q = (s) => el.querySelectorAll(s);
    q('[data-wx]').forEach((b) => { b.onclick = () => placeSheet(() => loadWx(M, true)); });
    q('[data-mv]').forEach((b) => { b.onclick = () => { const v = +b.dataset.mv; if (!v) { M.y = now.getFullYear(); M.m = now.getMonth(); M.sel = null; } else { const d = new Date(M.y, M.m + v, 1); M.y = d.getFullYear(); M.m = d.getMonth(); M.sel = null; } draw(M); }; });
    q('[data-d]').forEach((b) => { b.onclick = () => { M.sel = M.sel === b.dataset.d ? null : b.dataset.d; draw(M); }; });
    q('[data-fold]').forEach((b) => { b.onclick = () => { LS.set('fold:' + o.app, !fold); draw(M); }; });
    q('[data-go]').forEach((b) => { b.onclick = () => o.onDay(M.sel); });
  }
  async function loadWx(M, force) {
    if (M.o.weather === false) return;
    try { M.wx = await getWeather(force); M.err = ''; } catch (e) { M.err = '날씨를 불러오지 못했어요'; const c = LS.get('wx', null); if (c) M.wx = c; }
    if (M.el.isConnected) draw(M);
  }
  function mount(el, o) {
    if (!el) return;
    let M = mounts.find((x) => x.o.app === o.app);
    const now = new Date();
    if (!M) { M = { o, el, y: now.getFullYear(), m: now.getMonth(), sel: null, wx: LS.get('wx', null) }; mounts.push(M); loadWx(M, false); }
    else { M.o = o; M.el = el; const c = LS.get('wx', null); if (c && (!M.wx || c.at > M.wx.at)) M.wx = c; if (!M.wx || Date.now() - M.wx.at > 30 * 6e4) loadWx(M, false); }
    draw(M);
  }
  function refresh() { mounts.forEach((M) => { if (M.el && M.el.isConnected) draw(M); }); }
  window.MToday = { mount, refresh, weather: getWeather, wx };
})();
