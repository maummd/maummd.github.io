/* 마음엠 공용 알림 도구 (MRemind)
   - 앱마다 '내 알림'(매일 · 매주 · 매월 · 한 번)과 '자동 알림'(회기 · 출석 · 마감처럼 앱 자료에서 나오는 일정)을 켜고 끄고 시간을 바꿀 수 있어요.
   - 안드로이드 앱: 휴대폰 알림으로 예약해요 (앱을 닫아도, 휴대폰을 다시 켜도 와요).
   - 웹(아이폰 · PC): 화면이 열려 있을 때 알림을 띄우고, '캘린더에 넣기'(.ics)로 휴대폰 캘린더 알림을 받을 수 있어요.
   설정은 이 기기에만 저장돼요 (사람마다 받고 싶은 알림이 달라서요).

   MRemind.init({ app, name, color, presets:[{id,title,body,time,rep,days,dom,date,on}], sources:[{key,label,hint,leads:[분],lead,on,get:()=>[{id,title,body,at}]}] })
   MRemind.open()   설정 화면
   MRemind.sync()   다시 예약 (앱 자료가 바뀌었을 때 불러 주세요)
*/
(function () {
  'use strict';
  const DAYS = '일월화수목금토';
  const HORIZON = 35 * 864e5, MAX = 60;
  const bridge = () => ['NativeDoc', 'NUAndroid', 'DiaryAndroid', 'IeumAndroid', 'PPAndroid', 'AdminAndroid'].map((k) => window[k]).find((b) => b && b.setReminders);
  let O = null, S = null, timers = [], syncT = null, bound = false;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const key = () => 'mremind:' + O.app;
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function load() {
    try { S = JSON.parse(localStorage.getItem(key()) || 'null'); } catch (e) { S = null; }
    if (!S || !Array.isArray(S.items)) S = { on: true, items: [], src: {}, seen: [] };
    S.src = S.src || {}; S.seen = S.seen || [];
    (O.presets || []).forEach((p) => { if (!S.seen.includes(p.id)) { S.items.push(Object.assign({ on: false, rep: 'weekly', days: [1, 2, 3, 4, 5], time: '09:00' }, p, { preset: true })); S.seen.push(p.id); } });
    (O.sources || []).forEach((s) => { if (!S.src[s.key]) S.src[s.key] = { on: !!s.on, lead: s.lead != null ? s.lead : (s.leads || [60])[0] }; });
  }
  function save() { try { localStorage.setItem(key(), JSON.stringify(S)); } catch (e) { /* 저장 공간 부족 */ } }

  // ---- 언제 울리는지 계산 ----
  function at(dateStr, time) { const [h, m] = String(time || '09:00').split(':').map(Number); const d = new Date(dateStr + 'T00:00:00'); d.setHours(h || 0, m || 0, 0, 0); return d.getTime(); }
  function occurs(it, from, to) {
    const out = [];
    if (it.rep === 'once') { if (it.date) { const t = at(it.date, it.time); if (t > from && t <= to) out.push(t); } return out; }
    const d = new Date(from); d.setHours(0, 0, 0, 0);
    for (let i = 0; i < 40; i++, d.setDate(d.getDate() + 1)) {
      const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const ok = it.rep === 'daily' || (it.rep === 'weekly' && (it.days || []).includes(d.getDay())) || (it.rep === 'monthly' && d.getDate() === Math.min(Number(it.dom) || 1, dim));
      if (!ok) continue;
      const t = at(ymd(d), it.time); if (t > from && t <= to) out.push(t);
    }
    return out;
  }
  function leadText(m) { m = Number(m) || 0; if (!m) return '정시에'; if (m < 60) return m + '분 전'; if (m % 1440 === 0) return m / 1440 + '일 전'; return m / 60 + '시간 전'; }
  function plan() {
    if (!S.on) return [];
    const now = Date.now(), to = now + HORIZON, list = [];
    S.items.filter((i) => i.on).forEach((it) => occurs(it, now, to).forEach((t) => list.push({ id: it.id + '@' + t, title: it.title || '알림', body: it.body || '', at: t })));
    (O.sources || []).forEach((s) => {
      const st = S.src[s.key]; if (!st || !st.on) return;
      let ev = []; try { ev = s.get() || []; } catch (e) { ev = []; }
      ev.forEach((e) => { const t = Number(e.at) - (Number(st.lead) || 0) * 6e4; if (t > now && t <= to) list.push({ id: s.key + ':' + e.id + '@' + t, title: e.title, body: (st.lead ? leadText(st.lead) + ' · ' : '') + (e.body || ''), at: t }); });
    });
    return list.sort((a, b) => a.at - b.at).slice(0, MAX);
  }

  // ---- 예약 ----
  function sync() {
    if (!O) return;
    const list = plan(), nat = bridge();
    if (nat) { try { nat.setReminders(JSON.stringify(list)); } catch (e) { /* */ } return list; }
    timers.forEach(clearTimeout); timers = [];
    list.filter((r) => r.at - Date.now() < 864e5).forEach((r) => timers.push(setTimeout(() => fire(r.title, r.body), r.at - Date.now())));
    return list;
  }
  function later() { clearTimeout(syncT); syncT = setTimeout(sync, 800); }
  function fire(title, body) {
    try { if (window.Notification && Notification.permission === 'granted') { new Notification(title, { body, icon: O.icon || undefined }); return; } } catch (e) { /* */ }
    banner('🔔 ' + title + (body ? ' — ' + body : ''));
  }
  function banner(msg) {
    let b = document.getElementById('mrm-ban');
    if (!b) { b = document.createElement('div'); b.id = 'mrm-ban'; b.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);background:#1B2623;color:#fff;padding:12px 16px;border-radius:14px;z-index:10001;font-size:15px;max-width:90vw;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer;font-family:inherit'; b.onclick = () => b.remove(); document.body.appendChild(b); }
    b.textContent = msg; clearTimeout(b._t); b._t = setTimeout(() => b.remove(), 12000);
  }
  async function askPermission() {
    if (bridge()) { try { bridge().askNotify && bridge().askNotify(); } catch (e) { /* */ } return true; }
    if (!window.Notification) return false;
    if (Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) { /* */ } }
    return Notification.permission === 'granted';
  }

  // ---- 캘린더 파일 (.ics) ----
  function ics() {
    const st = (t) => { const d = new Date(t); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`; };
    const tx = (s) => String(s || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const ev = [];
    const one = (uid, start, title, body, rrule, lead) => ev.push(['BEGIN:VEVENT', 'UID:' + uid + '@maumm.org', 'DTSTAMP:' + st(Date.now()), 'DTSTART;TZID=Asia/Seoul:' + st(start), 'DTEND;TZID=Asia/Seoul:' + st(start + 15 * 6e4), 'SUMMARY:' + tx(title), body ? 'DESCRIPTION:' + tx(body) : '', rrule || '', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + tx(title), 'TRIGGER:-PT' + (Number(lead) || 0) + 'M', 'END:VALARM', 'END:VEVENT'].filter(Boolean).join('\r\n'));
    const now = Date.now();
    S.items.filter((i) => i.on).forEach((it) => {
      const first = occurs(it, now - 1, now + 40 * 864e5)[0]; if (!first) return;
      const rr = it.rep === 'daily' ? 'RRULE:FREQ=DAILY' : it.rep === 'weekly' ? 'RRULE:FREQ=WEEKLY;BYDAY=' + (it.days || []).map((d) => BY[d]).join(',') : it.rep === 'monthly' ? 'RRULE:FREQ=MONTHLY;BYMONTHDAY=' + (Number(it.dom) || 1) : '';
      one(it.id, first, it.title, it.body, rr, 0);
    });
    (O.sources || []).forEach((s) => { const c = S.src[s.key]; if (!c || !c.on) return; let l = []; try { l = s.get() || []; } catch (e) { /* */ } l.filter((e) => e.at > now).slice(0, 60).forEach((e) => one(s.key + '-' + e.id, e.at, e.title, e.body, '', c.lead)); });
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//maumm.org//' + esc(O.name || O.app) + '//KO', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + tx(O.name || '알림'), 'BEGIN:VTIMEZONE', 'TZID:Asia/Seoul', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900', 'TZNAME:KST', 'END:STANDARD', 'END:VTIMEZONE', ...ev, 'END:VCALENDAR'].join('\r\n');
  }
  function exportIcs() {
    const txt = ics(), name = (O.name || O.app) + ' 알림.ics', nat = ['NUAndroid', 'DiaryAndroid', 'IeumAndroid', 'NativeDoc', 'PPAndroid', 'AdminAndroid'].map((k) => window[k]).find((b) => b && b.saveFile);
    if (!/BEGIN:VEVENT/.test(txt)) { toast('켜진 알림이 없어요 — 먼저 알림을 켜 주세요'); return; }
    if (nat) { nat.saveFile(name, 'text/calendar', txt); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/calendar' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast('캘린더 파일을 받았어요 — 열면 캘린더에 들어가요');
  }

  // ---- 화면 ----
  const CSS = `.mrm-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9998;display:flex;align-items:flex-end;justify-content:center;font-family:inherit}
.mrm{background:#fff;color:#1B2623;width:100%;max-width:640px;max-height:92vh;overflow:auto;border-radius:20px 20px 0 0;padding:18px 16px 22px;font-size:15.5px;line-height:1.5}
@media(min-width:700px){.mrm-bg{align-items:center}.mrm{border-radius:20px}}
.mrm h3{margin:0 0 4px;font-size:19px}.mrm h4{margin:16px 0 6px;font-size:15px;color:#4E5B56}.mrm .m{color:#5B6762;font-size:13.5px;margin:2px 0}
.mrm .row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #E3E7E1;border-radius:14px;margin:6px 0;background:#FBFCFA}
.mrm .row .t{flex:1;min-width:0}.mrm .row .t select{display:block;margin-top:6px;width:auto!important;padding:5px 8px;font-size:14px}.mrm label{display:inline;margin:0}.mrm .f{display:block}.mrm .row .t b{display:block;font-size:15.5px}.mrm .row .t span{font-size:13px;color:#5B6762}
.mrm .sw{position:relative;width:46px;height:28px;flex:none}.mrm .sw input{opacity:0;width:0;height:0}.mrm .sw i{position:absolute;inset:0;background:#CBD2CC;border-radius:20px;transition:.2s;cursor:pointer}.mrm .sw i:before{content:'';position:absolute;width:22px;height:22px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}.mrm .sw input:checked+i{background:var(--mrm,#2F6B5E)}.mrm .sw input:checked+i:before{transform:translateX(18px)}
.mrm button{font:inherit;cursor:pointer}.mrm .b{background:var(--mrm,#2F6B5E);color:#fff;border:0;border-radius:12px;padding:10px 15px;font-weight:700}.mrm .b.g{background:#EDF2EF;color:#24433B}.mrm .b.r{background:#FBE7E5;color:#A33A30}
.mrm .ic{border:0;background:#EDF2EF;border-radius:10px;padding:6px 9px;font-size:15px;flex:none}.mrm .row .b{padding:8px 12px;flex:none}
.mrm select,.mrm input[type=text],.mrm input[type=time],.mrm input[type=date]{font:inherit;font-size:15px;padding:8px 10px;border:1px solid #D3D9D2;border-radius:10px;background:#fff;max-width:100%}
.mrm .f{display:block;font-size:13px;font-weight:700;color:#4E5B56;margin:12px 0 4px}.mrm .f input[type=text]{width:100%;box-sizing:border-box}
.mrm .seg{display:flex;gap:6px;flex-wrap:wrap}.mrm .seg button{border:1px solid #D3D9D2;background:#fff;border-radius:999px;padding:7px 13px;font-weight:700;color:#4E5B56}.mrm .seg button.on{background:var(--mrm,#2F6B5E);border-color:var(--mrm,#2F6B5E);color:#fff}
.mrm .ft{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:16px}.mrm .note{background:#F3F6F2;border-radius:12px;padding:9px 12px;font-size:13.5px;color:#43514B;margin:8px 0}`;
  let edit = null;
  function sheet(html) {
    if (!document.getElementById('mrm-css')) { const s = document.createElement('style'); s.id = 'mrm-css'; s.textContent = CSS; document.head.appendChild(s); }
    let bg = document.getElementById('mrm-bg');
    if (!bg) { bg = document.createElement('div'); bg.id = 'mrm-bg'; bg.className = 'mrm-bg'; document.body.appendChild(bg); bg.addEventListener('click', (e) => { if (e.target === bg) close(); }); }
    bg.innerHTML = `<div class="mrm" style="--mrm:${esc(O.color || '#2F6B5E')}">${html}</div>`; return bg.firstChild;
  }
  function close() { const bg = document.getElementById('mrm-bg'); if (bg) bg.remove(); edit = null; ask = null; }
  function toast(msg) { (window.MReader && window.MReader.note) ? window.MReader.note(msg) : banner(msg); }
  const isPast = (it) => it.rep === 'once' && it.date && at(it.date, it.time) <= Date.now();
  let ask = null; // 지울지 묻는 중인 알림 번호
  function when(it) {
    const tm = it.time || '09:00';
    if (it.rep === 'daily') return '매일 ' + tm;
    if (it.rep === 'weekly') { const d = (it.days || []).slice().sort(); return (d.length === 7 ? '매일' : d.join() === '1,2,3,4,5' ? '평일' : '매주 ' + d.map((x) => DAYS[x]).join('·')) + ' ' + tm; }
    if (it.rep === 'monthly') return `매월 ${it.dom || 1}일 ${tm}`;
    return (it.date ? it.date.slice(5).replace('-', '/') : '날짜 없음') + ' ' + tm + ' (한 번)';
  }
  const sw = (attr, on) => `<label class="sw"><input type="checkbox" ${attr}${on ? ' checked' : ''}><i></i></label>`;
  function nextText() {
    const l = plan(); if (!l.length) return '예약된 알림이 없어요';
    const d = new Date(l[0].at), t = new Date(); t.setHours(0, 0, 0, 0);
    const dd = Math.round((new Date(d).setHours(0, 0, 0, 0) - t) / 864e5);
    return `다음 알림: ${dd === 0 ? '오늘' : dd === 1 ? '내일' : `${d.getMonth() + 1}/${d.getDate()}(${DAYS[d.getDay()]})`} ${pad(d.getHours())}:${pad(d.getMinutes())} · ${esc(l[0].title)} <span style="opacity:.7">(앞으로 ${l.length}건)</span>`;
  }
  function open() {
    if (!O) return;
    if (edit) return openEdit();
    const nat = !!bridge();
    const srcs = (O.sources || []).map((s) => { const c = S.src[s.key]; return `<div class="row"><div class="t"><b>${esc(s.label)}</b><span>${esc(s.hint || '')}</span><select data-lead="${esc(s.key)}">${(s.leads || [0, 10, 30, 60, 1440]).map((m) => `<option value="${m}"${Number(c.lead) === m ? ' selected' : ''}>${leadText(m)} 알림</option>`).join('')}</select></div>${sw(`data-src="${esc(s.key)}"`, c.on)}</div>`; }).join('');
    const past = S.items.filter(isPast).length;
    const items = S.items.map((it, i) => ask === i
      ? `<div class="row" style="background:#FFF4F2;border-color:#F2C9C3"><div class="t"><b>‘${esc(it.title || '알림')}’ 알림을 지울까요?</b><span>지우면 되돌릴 수 없어요</span></div><button class="b g" data-no="1">취소</button><button class="b r" data-del="${i}">지우기</button></div>`
      : `<div class="row"${isPast(it) ? ' style="opacity:.62"' : ''}><div class="t"><b>${esc(it.title || '알림')}${isPast(it) ? ' <span style="font-size:12px;background:#E7ECE6;border-radius:8px;padding:1px 7px;color:#4E5B56">지남</span>' : ''}</b><span>${esc(when(it))}${it.body ? ' · ' + esc(it.body) : ''}</span></div><button class="ic" data-ed="${i}" aria-label="고치기">✏️</button><button class="ic" data-ask="${i}" aria-label="지우기">🗑️</button>${isPast(it) ? '' : sw(`data-it="${i}"`, it.on)}</div>`).join('')
      + (past ? `<button class="b r" id="mrm-past" style="width:100%;margin-top:4px">지난 알림 ${past}개 모두 지우기</button>` : '');
    const sh = sheet(`<h3>🔔 ${esc(O.name || '')} 알림</h3>
      <div class="row" style="background:#fff"><div class="t"><b>알림 받기</b><span>${nextText()}</span></div>${sw('id="mrm-all"', S.on)}</div>
      ${srcs ? `<h4>자동 알림 <span class="m">— 앱에 적힌 일정으로 알려 드려요</span></h4>${srcs}` : ''}
      <h4>내 알림</h4>${items || '<p class="m">아직 없어요. 아래에서 만들어 보세요.</p>'}
      <button class="b g" id="mrm-add" style="width:100%;margin-top:4px">＋ 알림 만들기</button>
      <div class="note">${nat ? '📱 휴대폰 알림으로 알려 드려요. 앱을 닫아도, 휴대폰을 다시 켜도 와요. 알림이 안 오면 휴대폰 설정 → 앱 → 알림을 켜 주세요.' : '🌐 웹에서는 이 화면이 열려 있을 때만 알림이 떠요. 아이폰 · PC에서는 <b>📅 캘린더에 넣기</b>를 누르면 캘린더 알림으로 받을 수 있어요.'}</div>
      <div class="ft"><button class="b g" id="mrm-test">시험 알림</button><button class="b g" id="mrm-ics">📅 캘린더에 넣기</button><button class="b" id="mrm-x">닫기</button></div>`);
    sh.querySelector('#mrm-x').onclick = close;
    sh.querySelector('#mrm-all').onchange = (e) => { S.on = e.target.checked; save(); sync(); if (S.on) askPermission(); open(); };
    sh.querySelectorAll('[data-src]').forEach((x) => { x.onchange = () => { S.src[x.dataset.src].on = x.checked; save(); sync(); if (x.checked) askPermission(); open(); }; });
    sh.querySelectorAll('[data-lead]').forEach((x) => { x.onchange = () => { S.src[x.dataset.lead].lead = Number(x.value); save(); sync(); open(); }; });
    sh.querySelectorAll('[data-it]').forEach((x) => { x.onchange = () => { S.items[x.dataset.it].on = x.checked; save(); sync(); if (x.checked) askPermission(); open(); }; });
    sh.querySelectorAll('[data-ask]').forEach((x) => { x.onclick = () => { ask = Number(x.dataset.ask); open(); }; });
    sh.querySelectorAll('[data-no]').forEach((x) => { x.onclick = () => { ask = null; open(); }; });
    sh.querySelectorAll('[data-del]').forEach((x) => { x.onclick = () => { const it = S.items[Number(x.dataset.del)]; S.items.splice(Number(x.dataset.del), 1); ask = null; save(); sync(); toast(`‘${it && it.title || '알림'}’을 지웠어요`); open(); }; });
    const pb = sh.querySelector('#mrm-past'); if (pb) pb.onclick = () => { const n = S.items.filter(isPast).length; S.items = S.items.filter((it) => !isPast(it)); save(); sync(); toast(`지난 알림 ${n}개를 지웠어요`); open(); };
    sh.querySelectorAll('[data-ed]').forEach((x) => { x.onclick = () => { ask = null; edit = { i: Number(x.dataset.ed), it: JSON.parse(JSON.stringify(S.items[x.dataset.ed])) }; openEdit(); }; });
    sh.querySelector('#mrm-add').onclick = () => { const d = new Date(); edit = { i: -1, it: { id: 'u' + Date.now().toString(36), title: '', body: '', rep: 'weekly', days: [d.getDay()], dom: d.getDate(), date: ymd(d), time: '09:00', on: true } }; openEdit(); };
    sh.querySelector('#mrm-test').onclick = async () => { await askPermission(); const n = bridge(); if (n && n.testNotification) n.testNotification(O.name || '알림', '알림이 이렇게 와요 🔔'); else fire(O.name || '알림', '알림이 이렇게 와요 🔔'); };
    sh.querySelector('#mrm-ics').onclick = exportIcs;
  }
  function openEdit() {
    const it = edit.it;
    const sh = sheet(`<h3>${edit.i < 0 ? '＋ 새 알림' : '✏️ 알림 고치기'}</h3>
      <label class="f">제목<input type="text" id="mrm-t" maxlength="40" value="${esc(it.title)}" placeholder="예) 출석 확인하기"></label>
      <label class="f">내용 (안 써도 돼요)<input type="text" id="mrm-b" maxlength="80" value="${esc(it.body)}" placeholder="알림에 함께 보일 말"></label>
      <span class="f">반복</span><div class="seg" id="mrm-rep">${[['daily', '매일'], ['weekly', '요일마다'], ['monthly', '매월'], ['once', '한 번']].map(([k, l]) => `<button data-rep="${k}" class="${it.rep === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${it.rep === 'weekly' ? `<span class="f">요일</span><div class="seg">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button data-day="${d}" class="${(it.days || []).includes(d) ? 'on' : ''}">${DAYS[d]}</button>`).join('')}</div>` : ''}
      ${it.rep === 'monthly' ? `<label class="f">날짜<select id="mrm-dom">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}"${Number(it.dom) === i + 1 ? ' selected' : ''}>매월 ${i + 1}일</option>`).join('')}</select></label>` : ''}
      ${it.rep === 'once' ? `<label class="f">날짜<input type="date" id="mrm-d" value="${esc(it.date || '')}"></label>` : ''}
      <label class="f">시간<input type="time" id="mrm-tm" value="${esc(it.time || '09:00')}"></label>
      <div class="ft">${edit.i >= 0 ? '<button class="b r" id="mrm-del" style="margin-right:auto">지우기</button>' : ''}<button class="b g" id="mrm-c">취소</button><button class="b" id="mrm-s">저장</button></div>`);
    const keep = () => { it.title = sh.querySelector('#mrm-t').value; it.body = sh.querySelector('#mrm-b').value; it.time = sh.querySelector('#mrm-tm').value || '09:00'; const dm = sh.querySelector('#mrm-dom'); if (dm) it.dom = Number(dm.value); const dd = sh.querySelector('#mrm-d'); if (dd) it.date = dd.value; };
    sh.querySelectorAll('[data-rep]').forEach((b) => { b.onclick = () => { keep(); it.rep = b.dataset.rep; openEdit(); }; });
    sh.querySelectorAll('[data-day]').forEach((b) => { b.onclick = () => { keep(); const d = Number(b.dataset.day); it.days = (it.days || []).includes(d) ? it.days.filter((x) => x !== d) : [...(it.days || []), d]; openEdit(); }; });
    sh.querySelector('#mrm-c').onclick = () => { edit = null; open(); };
    const del = sh.querySelector('#mrm-del'); if (del) del.onclick = () => { ask = edit.i; edit = null; open(); };
    sh.querySelector('#mrm-s').onclick = () => {
      keep();
      if (!it.title.trim()) { toast('제목을 적어 주세요'); return; }
      if (it.rep === 'weekly' && !(it.days || []).length) { toast('요일을 하나 이상 골라 주세요'); return; }
      if (it.rep === 'once' && !it.date) { toast('날짜를 골라 주세요'); return; }
      it.title = it.title.trim(); it.on = true;
      if (edit.i < 0) S.items.push(it); else S.items[edit.i] = it;
      edit = null; save(); sync(); askPermission(); toast('알림을 저장했어요'); open();
    };
  }

  function init(opt) {
    O = opt || {}; load(); save();
    sync();
    if (bound) return; bound = true;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) later(); });
    setInterval(() => { if (!bridge()) sync(); }, 6 * 36e5);
  }
  window.MRemind = { init, open, sync: later, syncNow: sync, plan: () => (O ? plan() : []), close, ics: () => (O ? ics() : '') };
})();
