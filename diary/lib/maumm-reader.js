/* maumm.org 공용 파일 읽기 도구 (MReader) — 모든 앱이 같은 파일을 씁니다.
   읽는 파일: PDF · 워드(docx) · 엑셀(xlsx) · 한글(hwpx) · 사진(jpg/png 글자 인식) · CSV/TXT
   - read(file)  → { kind, pages:[{items:[{s,x,y,w,h}]}], tables:[{name, rows:[[칸]]}], text }
       pages: 글자 위치(표 모양 그대로 읽기용), tables: 행 · 칸, text: 전체 글
   - importWizard({title, fields, onApply}) → 파일 고르기 → 표 고르기 → 칸 맞추기 → 미리보기 → 넣기
   한글 .hwp(옛 형식)는 브라우저에서 읽을 수 없어 PDF · HWPX로 저장해 달라고 안내합니다.
   읽는 도구(pdf.js · fflate)는 이 파일 옆 폴더에 있고, 사진 글자 인식(tesseract)은 필요할 때만 받아요. */
(function () {
  const HERE = (document.currentScript && document.currentScript.src) || new URL('lib/maumm-reader.js', location.href).href;
  const LIB = (n) => new URL(n, HERE).href;
  const CDN = {
    pdf: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs',
    worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.worker.min.mjs',
    zip: 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js',
  };
  // 사진 글자 인식: maumm.org 웹 주소에 올려 둔 파일 → 안 되면 jsdelivr
  const OCR_BASES = ['https://maummd.github.io/lib/ocr/', 'https://cdn.jsdelivr.net/npm/'];
  const OCR_FILES = [
    { lib: 'tesseract.min.js', worker: 'worker.min.js', core: '', lang: 'lang/' },
    { lib: 'tesseract.js@7.0.0/dist/tesseract.min.js', worker: 'tesseract.js@7.0.0/dist/worker.min.js', core: 'tesseract.js-core@7.0.0/', lang: '@tesseract.js-data/kor@1.0.0/4.0.0_best_int/' },
  ];

  async function imp(local, cdn) {
    let e1;
    try { return await import(LIB(local)); } catch (e) { e1 = e; }
    try { return await import(cdn); } catch (e) { throw new Error('읽는 도구를 불러오지 못했어요 (' + ((e1 && e1.message) || '') + ')'); }
  }
  const zipLib = () => imp('fflate.js', CDN.zip);
  async function pdfLib() {
    let m, local = true;
    try { m = await import(LIB('pdf.min.js')); } catch (e) { local = false; m = await import(CDN.pdf); }
    m.GlobalWorkerOptions.workerSrc = local ? LIB('pdf.worker.min.js') : CDN.worker;
    return m;
  }
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('불러오기 실패: ' + src)); document.head.appendChild(s); });
  }
  let _ocr = null;
  async function ocrWorker(progress) {
    if (_ocr) return _ocr;
    let lastErr;
    for (let i = 0; i < OCR_BASES.length; i++) {
      const B = OCR_BASES[i], F = OCR_FILES[i];
      try {
        if (!window.Tesseract) await loadScript(B + F.lib);
        _ocr = await window.Tesseract.createWorker('kor', 1, {
          workerPath: B + F.worker, corePath: B + F.core || undefined, langPath: (B + F.lang).replace(/\/$/, ''), gzip: true,
          logger: (m) => progress && m.status && progress(`사진 글자 읽는 중 · ${m.status === 'recognizing text' ? '인식' : '준비'} ${Math.round((m.progress || 0) * 100)}%`),
        });
        return _ocr;
      } catch (e) { lastErr = e; _ocr = null; }
    }
    throw new Error('사진 글자 인식 도구를 받지 못했어요 — 인터넷 연결을 확인해 주세요 (' + ((lastErr && lastErr.message) || '') + ')');
  }

  // ---------- 글자 위치 → 줄 · 칸 ----------
  function lines(items) {
    const ls = [];
    [...items].sort((a, b) => b.y - a.y || a.x - b.x).forEach((i) => {
      const l = ls.find((l) => Math.abs(l.y - i.y) < Math.max(3, (i.h || 0) * 0.5));
      if (l) l.it.push(i); else ls.push({ y: i.y, it: [i] });
    });
    return ls.map((l) => l.it.sort((a, b) => a.x - b.x));
  }
  // 한 줄을 칸으로 나누기: 글자 사이가 넓게 벌어진 곳에서 자릅니다
  function rowsFromItems(items) {
    return lines(items).map((ln) => {
      const cells = []; let cur = null;
      ln.forEach((i) => {
        const gap = cur ? i.x - (cur.x + cur.w) : 0, lim = Math.max(14, (i.h || 10) * 1.6);
        if (cur && gap <= lim) { cur.s += (gap > 2 ? ' ' : '') + i.s; cur.w = i.x + i.w - cur.x; }
        else { if (cur) cells.push(cur); cur = { s: i.s, x: i.x, w: i.w }; }
      });
      if (cur) cells.push(cur);
      return cells.map((c) => c.s.trim());
    }).filter((r) => r.some(Boolean));
  }

  // ---------- 형식별 읽기 ----------
  async function readPdf(buf, progress) {
    const pdfjs = await pdfLib();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise, pages = [];
    let textLen = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      progress && progress(`${i} / ${doc.numPages}쪽 읽는 중…`);
      const p = await doc.getPage(i), tc = await p.getTextContent();
      const items = tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || 10 }));
      textLen += items.length; pages.push({ items, page: p });
    }
    // 글자가 없는 PDF(스캔 사진) → 쪽마다 그림으로 바꿔 글자 인식
    if (textLen < 5) {
      for (let i = 0; i < pages.length; i++) {
        progress && progress(`스캔 PDF ${i + 1} / ${pages.length}쪽 글자 인식 중…`);
        const vp = pages[i].page.getViewport({ scale: 2 }), cv = document.createElement('canvas');
        cv.width = vp.width; cv.height = vp.height;
        await pages[i].page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        pages[i].items = await ocrCanvas(cv, progress);
      }
    }
    pages.forEach((p) => delete p.page);
    return { kind: 'pdf', pages, tables: pages.map((p, i) => ({ name: `PDF ${i + 1}쪽`, rows: rowsFromItems(p.items) })).filter((t) => t.rows.length), text: pages.map((p) => lines(p.items).map((l) => l.map((i) => i.s).join(' ')).join('\n')).join('\n') };
  }
  // 워드 · 한글(HWPX): 압축 안 XML에서 문단과 표(행 · 칸)를 차례대로
  async function readXmlDoc(buf, kind) {
    const { unzipSync, strFromU8 } = await zipLib();
    const files = unzipSync(new Uint8Array(buf));
    const names = Object.keys(files).filter((n) => kind === 'docx' ? /^word\/document\.xml$/i.test(n) : /Contents\/section\d+\.xml$/i.test(n)).sort();
    if (!names.length) throw new Error('문서 내용을 찾지 못했어요');
    const tables = [], pages = [{ items: [] }], textLines = [];
    let y = 0, ti = 0;
    const ln = (e) => e.localName;
    const textOf = (e) => [...e.getElementsByTagNameNS('*', 't')].map((t) => t.textContent).join('');
    const push = (s, x, w) => { if (s.trim()) pages[pages.length - 1].items.push({ s, x, y, w, h: 12 }); };
    names.forEach((n) => {
      const xml = new DOMParser().parseFromString(strFromU8(files[n]), 'application/xml');
      const walk = (el) => {
        for (const c of el.children) {
          if (ln(c) === 'tbl') {
            const rows = [];
            [...c.children].filter((r) => ln(r) === 'tr').forEach((tr) => {
              const cells = [...tr.children].filter((t) => ln(t) === 'tc').map((tc) => [...tc.getElementsByTagNameNS('*', 'p')].map(textOf).filter((s) => s.trim()).join('\n'));
              rows.push(cells);
              y -= 40;
              cells.forEach((cell, ci) => { let yy = y; cell.split('\n').forEach((s) => { pages[pages.length - 1].items.push({ s, x: ci * 150 + 10, y: yy, w: 120, h: 12 }); yy -= 12; }); });
            });
            y -= 40; tables.push({ name: `표 ${++ti}`, rows });
            continue;
          }
          if (ln(c) === 'p' && !c.getElementsByTagNameNS('*', 'tbl').length) {
            const s = textOf(c);
            if (/주문표|명단|출석|기록/.test(s) && /\[.*\]|\d{4}/.test(s) && pages[pages.length - 1].items.length) { pages.push({ items: [] }); y = 1000; }
            y -= 20; push(s, 10, Math.max(8, s.length * 12)); if (s.trim()) textLines.push(s);
            continue;
          }
          walk(c);
        }
      };
      walk(xml.documentElement);
    });
    tables.forEach((t) => t.rows.forEach((r) => textLines.push(r.join('\t'))));
    return { kind, pages, tables, text: textLines.join('\n') };
  }
  // 엑셀: 시트마다 행 · 칸 (공유 문자열 · 숫자 · 날짜)
  async function readXlsx(buf) {
    const { unzipSync, strFromU8 } = await zipLib();
    const files = unzipSync(new Uint8Array(buf));
    const P = (n) => files[n] ? new DOMParser().parseFromString(strFromU8(files[n]), 'application/xml') : null;
    const ss = P('xl/sharedStrings.xml'), shared = ss ? [...ss.getElementsByTagNameNS('*', 'si')].map((si) => [...si.getElementsByTagNameNS('*', 't')].map((t) => t.textContent).join('')) : [];
    const wb = P('xl/workbook.xml'), rels = P('xl/_rels/workbook.xml.rels');
    const relMap = {}; if (rels) [...rels.getElementsByTagNameNS('*', 'Relationship')].forEach((r) => { relMap[r.getAttribute('Id')] = r.getAttribute('Target'); });
    // 날짜 서식 칸 알아보기
    const st = P('xl/styles.xml'), dateStyle = new Set();
    if (st) {
      const custom = {}; [...st.getElementsByTagNameNS('*', 'numFmt')].forEach((f) => { custom[f.getAttribute('numFmtId')] = f.getAttribute('formatCode') || ''; });
      const xfs = st.getElementsByTagNameNS('*', 'cellXfs')[0];
      if (xfs) [...xfs.children].forEach((xf, i) => { const id = +xf.getAttribute('numFmtId'); if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[ymd]/i.test((custom[id] || '').replace(/"[^"]*"/g, ''))) dateStyle.add(i); });
    }
    const sheets = wb ? [...wb.getElementsByTagNameNS('*', 'sheet')].map((s) => ({ name: s.getAttribute('name'), path: 'xl/' + (relMap[s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')] || '').replace(/^\/?xl\//, '') })) : [];
    if (!sheets.length) Object.keys(files).filter((n) => /xl\/worksheets\/sheet\d+\.xml$/.test(n)).forEach((n, i) => sheets.push({ name: '시트' + (i + 1), path: n }));
    const colNum = (ref) => { const m = ref.match(/^([A-Z]+)/); let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
    const tables = [], pages = [];
    sheets.forEach((sh) => {
      const x = P(sh.path); if (!x) return;
      const grid = [];
      [...x.getElementsByTagNameNS('*', 'row')].forEach((r) => {
        const ri = (+r.getAttribute('r') || grid.length + 1) - 1; grid[ri] = grid[ri] || [];
        [...r.getElementsByTagNameNS('*', 'c')].forEach((c) => {
          const t = c.getAttribute('t'), v = c.getElementsByTagNameNS('*', 'v')[0], is = c.getElementsByTagNameNS('*', 'is')[0];
          let val = '';
          if (t === 's' && v) val = shared[+v.textContent] || '';
          else if (t === 'inlineStr' && is) val = [...is.getElementsByTagNameNS('*', 't')].map((q) => q.textContent).join('');
          else if (v) { val = v.textContent; if (dateStyle.has(+c.getAttribute('s')) && /^\d+(\.\d+)?$/.test(val)) { const d = new Date(Math.round((+val - 25569) * 864e5)); val = d.toISOString().slice(0, 10); } }
          grid[ri][colNum(c.getAttribute('r') || 'A')] = val;
        });
      });
      const rows = grid.filter(Boolean).map((r) => Array.from(r, (v) => (v == null ? '' : String(v)))).filter((r) => r.some((v) => v.trim()));
      if (!rows.length) return;
      tables.push({ name: sh.name, rows });
      const items = []; rows.forEach((r, ri) => r.forEach((v, ci) => { String(v).split('\n').forEach((s, k) => { if (s.trim()) items.push({ s, x: ci * 150 + 10, y: -(ri * 60 + k * 12), w: 120, h: 12 }); }); }));
      pages.push({ items });
    });
    return { kind: 'xlsx', pages, tables, text: tables.map((t) => t.rows.map((r) => r.join('\t')).join('\n')).join('\n') };
  }
  // 사진: 크게 · 흑백으로 다듬은 뒤 글자 인식, 글자 위치를 PDF와 같은 모양으로
  async function imageCanvas(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('사진을 열 수 없어요 (HEIC는 JPG로 바꿔 주세요)')); i.src = url; });
      const k = Math.min(3, Math.max(1, 2200 / Math.max(img.width, img.height)));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      const g = cv.getContext('2d'); g.drawImage(img, 0, 0, cv.width, cv.height);
      const d = g.getImageData(0, 0, cv.width, cv.height), a = d.data;
      for (let i = 0; i < a.length; i += 4) { const r = a[i], gg = a[i + 1], b = a[i + 2]; let v = 0.299 * r + 0.587 * gg + 0.114 * b; if (r > 150 && gg < 110 && b < 110) v = 0; a[i] = a[i + 1] = a[i + 2] = v > 165 ? 255 : v < 90 ? 0 : v; }
      g.putImageData(d, 0, 0); return cv;
    } finally { URL.revokeObjectURL(url); }
  }
  async function ocrCanvas(cv, progress) {
    const w = await ocrWorker(progress);
    const { data } = await w.recognize(cv, {}, { blocks: true });
    const items = [];
    (data.blocks || []).forEach((b) => b.paragraphs.forEach((p) => p.lines.forEach((l) => {
      let cur = null; const lh = l.bbox.y1 - l.bbox.y0;
      l.words.forEach((wd) => {
        if (wd.confidence < 20 && !/[가-힣0-9]/.test(wd.text)) return;
        if (cur && wd.bbox.x0 - cur.x1 < lh * 0.55) { cur.s += (wd.bbox.x0 - cur.x1 > lh * 0.32 ? ' ' : '') + wd.text; cur.x1 = wd.bbox.x1; }
        else { if (cur) items.push(cur); cur = { s: wd.text, x: wd.bbox.x0, x1: wd.bbox.x1, y: -(l.bbox.y0 + l.bbox.y1) / 2, h: lh }; }
      });
      if (cur) items.push(cur);
    })));
    items.forEach((i) => { i.w = i.x1 - i.x; delete i.x1; });
    return items;
  }
  async function readImage(file, progress) {
    progress && progress('사진을 다듬는 중…');
    const items = await ocrCanvas(await imageCanvas(file), progress);
    return { kind: 'image', ocr: true, pages: [{ items }], tables: [{ name: '사진 글자', rows: rowsFromItems(items) }], text: lines(items).map((l) => l.map((i) => i.s).join(' ')).join('\n') };
  }
  function readCsv(text) {
    const sep = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : ',';
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const R = rows.filter((r) => r.some((v) => v.trim()));
    const items = []; R.forEach((r, ri) => r.forEach((v, ci) => v.trim() && items.push({ s: v, x: ci * 150 + 10, y: -ri * 40, w: 120, h: 12 })));
    return { kind: 'csv', pages: [{ items }], tables: [{ name: '표', rows: R }], text };
  }
  async function read(file, progress) {
    const n = (file.name || '').toLowerCase(), type = file.type || '';
    if (/\.hwp$/.test(n)) throw new Error('한글(.hwp) 파일은 한글에서 [파일 → 다른 이름으로 저장 → PDF 또는 HWPX(또는 워드 docx)]로 저장해 올려 주세요');
    if (/\.(doc|xls|ppt)$/.test(n)) throw new Error('옛 오피스 형식(.doc · .xls)은 읽을 수 없어요. 워드 · 엑셀에서 .docx · .xlsx로 저장해 올려 주세요');
    if (/\.pdf$/.test(n) || type === 'application/pdf') return readPdf(await file.arrayBuffer(), progress);
    if (/\.docx$/.test(n)) return readXmlDoc(await file.arrayBuffer(), 'docx');
    if (/\.hwpx$/.test(n)) return readXmlDoc(await file.arrayBuffer(), 'hwpx');
    if (/\.xlsx$/.test(n) || /spreadsheetml/.test(type)) return readXlsx(await file.arrayBuffer());
    if (/^image\//.test(type) || /\.(jpe?g|png|webp|bmp|gif|heic)$/.test(n)) return readImage(file, progress);
    if (/\.(csv|tsv|txt)$/.test(n) || /^text\//.test(type)) { const t = await file.text(); return /\.txt$/.test(n) && !/[\t,]/.test(t.split('\n')[0]) ? { kind: 'txt', pages: [{ items: t.split('\n').map((s, i) => ({ s, x: 10, y: -i * 20, w: s.length * 12, h: 12 })).filter((i) => i.s.trim()) }], tables: [{ name: '글', rows: t.split('\n').filter((s) => s.trim()).map((s) => [s]) }], text: t } : readCsv(t); }
    throw new Error('이 파일 형식은 읽을 수 없어요 (PDF · 워드 · 엑셀 · 한글 HWPX · 사진 · CSV 가능)');
  }

  // ---------- 비슷한 글자 맞추기 (사진 글자 인식이 틀린 것 바로잡기) ----------
  const nz = (s) => String(s || '').replace(/[\s·&()\[\]]+/g, '').toLowerCase();
  function similar(a, b) {
    a = nz(a); b = nz(b); if (!a || !b) return 0; if (a === b) return 1;
    const bg = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); m.set(k, (m.get(k) || 0) + 1); } return m; };
    const A = bg(a), B = bg(b); let inter = 0; A.forEach((v, k) => { inter += Math.min(v, B.get(k) || 0); });
    return (2 * inter) / Math.max(1, a.length - 1 + b.length - 1);
  }
  function closest(s, list, min = 0.5) { let best = null, bs = 0; (list || []).forEach((x) => { const v = similar(s, x); if (v > bs) { bs = v; best = x; } }); return bs >= min ? best : null; }

  // ---------- 표 가져오기 마법사 ----------
  const CSS = `.mr-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:flex-end;justify-content:center;font-family:'Noto Sans KR','Apple SD Gothic Neo',system-ui,sans-serif}
.mr-sh{background:#fff;color:#1B2623;width:100%;max-width:720px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:18px 16px 22px;font-size:15.5px;line-height:1.55}
@media(min-width:760px){.mr-bg{align-items:center}.mr-sh{border-radius:18px}}
.mr-sh h3{margin:0 0 6px;font-size:18px}.mr-m{color:#4E5B56;font-size:14px}.mr-b{background:#2F5D50;color:#fff;border:0;border-radius:12px;padding:10px 15px;font:inherit;font-weight:700;cursor:pointer}
.mr-b.g{background:#E6F0EC;color:#2F5D50}.mr-r{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mr-sel{font:inherit;font-size:15px;padding:7px 8px;border:1px solid #D3D9D2;border-radius:10px;background:#fff;max-width:100%}
.mr-tw{overflow:auto;border:1px solid #D9DED7;border-radius:12px;margin:8px 0;max-height:42vh}.mr-t{border-collapse:collapse;font-size:13.5px;min-width:100%}.mr-t th,.mr-t td{border-bottom:1px solid #E6EAE4;padding:6px 7px;text-align:left;white-space:nowrap}.mr-t th{background:#EEF3F0;position:sticky;top:0}
.mr-t td input{font:inherit;font-size:13.5px;border:1px solid transparent;border-radius:6px;padding:2px 4px;width:100%;min-width:70px}.mr-t td input:focus{border-color:#9DB7AC;outline:none}
.mr-e{background:#F8E3E3;color:#B03A3A;border-radius:10px;padding:10px;margin-top:8px}.mr-f{display:block;font-size:13px;color:#4E5B56;font-weight:700;margin:10px 0 3px}`;
  function sheet(html) {
    if (!document.getElementById('mr-css')) { const s = document.createElement('style'); s.id = 'mr-css'; s.textContent = CSS; document.head.appendChild(s); }
    let bg = document.getElementById('mr-bg');
    if (!bg) { bg = document.createElement('div'); bg.id = 'mr-bg'; bg.className = 'mr-bg'; document.body.appendChild(bg); bg.addEventListener('click', (e) => { if (e.target === bg) close(); }); }
    bg.innerHTML = `<div class="mr-sh">${html}</div>`; return bg.firstChild;
  }
  function close() { const bg = document.getElementById('mr-bg'); if (bg) bg.remove(); }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function pickFile(accept) {
    return new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept || '.pdf,.docx,.xlsx,.hwpx,.hwp,.csv,.tsv,.txt,image/*'; i.style.display = 'none'; document.body.appendChild(i); i.onchange = () => { res(i.files[0] || null); i.remove(); }; i.click(); });
  }
  // fields: [{key, label, aliases:[머리글 낱말], required, hint}]
  function guessMap(header, fields) {
    const used = new Set(), map = {};
    fields.forEach((f) => {
      const words = [f.label, ...(f.aliases || [])].map(nz);
      let best = -1, bs = 0;
      header.forEach((h, i) => { if (used.has(i)) return; const hh = nz(h); let sc = 0; words.forEach((w) => { if (hh && w && (hh === w)) sc = Math.max(sc, 3); else if (hh && w && (hh.includes(w) || w.includes(hh))) sc = Math.max(sc, 2); else sc = Math.max(sc, similar(hh, w) > 0.6 ? 1 : 0); }); if (sc > bs) { bs = sc; best = i; } });
      if (best >= 0) { map[f.key] = best; used.add(best); }
    });
    return map;
  }
  function headerRowIndex(rows, fields) {
    let best = 0, bs = -1;
    const width = Math.max(...rows.slice(0, 10).map((r) => r.filter((c) => String(c).trim()).length));
    rows.slice(0, 10).forEach((r, i) => {
      const filled = r.filter((c) => String(c).trim()).length;
      if (width >= 2 && filled < 2) return;   // 표 위의 제목 줄(칸 하나)은 머리글이 아니에요
      const m = guessMap(r, fields);
      const sc = Object.keys(m).length * 2 + filled * 0.2 - r.filter((c) => /^\d[\d.,/-]*$/.test(String(c).trim())).length;
      if (sc > bs) { bs = sc; best = i; } });
    return best;
  }
  async function importWizard(opt) {
    const fields = opt.fields;
    const f = opt.file || await pickFile(opt.accept); if (!f) return;
    const prog = sheet(`<h3>📥 ${esc(opt.title || '파일 불러오기')}</h3><p class="mr-m" id="mr-p">파일을 여는 중…</p>`);
    let R;
    try { R = await read(f, (t) => { const p = document.getElementById('mr-p'); if (p) p.textContent = t; }); }
    catch (e) { sheet(`<h3>읽지 못했어요</h3><div class="mr-e">${esc(e.message || e)}</div><div class="mr-r" style="justify-content:flex-end;margin-top:12px"><button class="mr-b" id="mr-x">닫기</button></div>`); document.getElementById('mr-x').onclick = close; return; }
    if (opt.onRead && (await opt.onRead(R, f)) === true) { close(); return; }   // 앱이 직접 처리
    const tables = R.tables.filter((t) => t.rows.length);
    if (!tables.length) { sheet(`<h3>표를 찾지 못했어요</h3><p class="mr-m">파일에서 행 · 칸으로 된 표를 찾지 못했어요. ${R.ocr ? '사진이 흐리거나 기울어지면 잘 안 읽혀요. 밝은 곳에서 표만 똑바로 찍어 주세요.' : ''}</p><div class="mr-r" style="justify-content:flex-end;margin-top:12px"><button class="mr-b" id="mr-x">닫기</button></div>`); document.getElementById('mr-x').onclick = close; return; }
    let ti = tables.reduce((b, t, i) => (t.rows.length * Math.max(...t.rows.map((r) => r.length)) > tables[b].rows.length * Math.max(...tables[b].rows.map((r) => r.length)) ? i : b), 0);
    let hr = headerRowIndex(tables[ti].rows, fields), map = guessMap(tables[ti].rows[hr], fields), edits = {};
    const draw = () => {
      const T = tables[ti], rows = T.rows, header = rows[hr] || [], ncol = Math.max(...rows.map((r) => r.length));
      const body = rows.slice(hr + 1);
      const col = (i) => header[i] || `${i + 1}번째 칸`;
      const out = body.map((r, ri) => { const o = {}; fields.forEach((fd) => { const k = `${ri}:${fd.key}`; o[fd.key] = edits[k] !== undefined ? edits[k] : (map[fd.key] !== undefined ? String(r[map[fd.key]] || '').trim() : ''); }); return o; });
      const sh = sheet(`<h3>📥 ${esc(opt.title || '파일 불러오기')}</h3>
        <p class="mr-m">${esc(f.name)} · ${R.kind.toUpperCase()}${R.ocr ? ' (사진 글자 인식 — 틀린 글자는 아래에서 고쳐 주세요)' : ''}</p>
        ${tables.length > 1 ? `<label class="mr-f">표 고르기</label><select class="mr-sel" id="mr-t">${tables.map((t, i) => `<option value="${i}" ${i === ti ? 'selected' : ''}>${esc(t.name)} (${t.rows.length}줄)</option>`).join('')}</select>` : ''}
        <label class="mr-f">제목(머리글) 줄</label><select class="mr-sel" id="mr-h">${rows.slice(0, 10).map((r, i) => `<option value="${i}" ${i === hr ? 'selected' : ''}>${i + 1}줄: ${esc(r.filter(Boolean).slice(0, 4).join(' · ').slice(0, 40))}</option>`).join('')}</select>
        <label class="mr-f">칸 맞추기 (앱 항목 ← 파일의 칸)</label>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center">${fields.map((fd) => `<span>${esc(fd.label)}${fd.required ? ' <b style="color:#B5602A">*</b>' : ''}</span><select class="mr-sel mr-map" data-k="${fd.key}"><option value="">(없음)</option>${Array.from({ length: ncol }, (_, i) => `<option value="${i}" ${map[fd.key] === i ? 'selected' : ''}>${esc(col(i))}</option>`).join('')}</select>`).join('')}</div>
        ${opt.hint ? `<p class="mr-m" style="margin-top:8px">${opt.hint}</p>` : ''}
        <label class="mr-f">미리보기 · 고치기 (${out.length}줄 — 체크를 끄면 빼요)</label>
        <div class="mr-tw"><table class="mr-t"><tr><th>✔</th>${fields.map((fd) => `<th>${esc(fd.label)}</th>`).join('')}</tr>${out.map((o, ri) => `<tr><td><input type="checkbox" class="mr-ck" data-r="${ri}" ${edits['x' + ri] === false ? '' : 'checked'} style="width:18px;min-width:18px"></td>${fields.map((fd) => `<td><input class="mr-in" data-r="${ri}" data-k="${fd.key}" value="${esc(o[fd.key])}"></td>`).join('')}</tr>`).join('')}</table></div>
        <div class="mr-r" style="justify-content:flex-end;margin-top:12px"><button class="mr-b g" id="mr-x">취소</button><button class="mr-b" id="mr-go">${esc(opt.applyLabel || '넣기')}</button></div>`);
      sh.querySelector('#mr-x').onclick = close;
      const t = sh.querySelector('#mr-t'); if (t) t.onchange = () => { ti = +t.value; hr = headerRowIndex(tables[ti].rows, fields); map = guessMap(tables[ti].rows[hr], fields); edits = {}; draw(); };
      sh.querySelector('#mr-h').onchange = (e) => { hr = +e.target.value; map = guessMap(tables[ti].rows[hr], fields); edits = {}; draw(); };
      sh.querySelectorAll('.mr-map').forEach((s) => { s.onchange = () => { if (s.value === '') delete map[s.dataset.k]; else map[s.dataset.k] = +s.value; Object.keys(edits).forEach((k) => { if (k.endsWith(':' + s.dataset.k)) delete edits[k]; }); draw(); }; });
      sh.querySelectorAll('.mr-in').forEach((i) => { i.oninput = () => { edits[`${i.dataset.r}:${i.dataset.k}`] = i.value; }; });
      sh.querySelectorAll('.mr-ck').forEach((c) => { c.onchange = () => { edits['x' + c.dataset.r] = c.checked; }; });
      sh.querySelector('#mr-go').onclick = async () => {
        const final = out.map((o, ri) => { const x = {}; fields.forEach((fd) => { const k = `${ri}:${fd.key}`; x[fd.key] = (edits[k] !== undefined ? edits[k] : o[fd.key]).trim(); }); return edits['x' + ri] === false ? null : x; }).filter(Boolean)
          .filter((x) => fields.filter((fd) => fd.required).every((fd) => x[fd.key]));
        if (!final.length) { alert('넣을 줄이 없어요. 필수(*) 칸을 맞춰 주세요.'); return; }
        try { const msg = await opt.onApply(final, { file: f, read: R }); close(); if (msg && opt.toast) opt.toast(msg); }
        catch (e) { alert(e.message || e); }
      };
    };
    draw();
  }
  // 날짜 글자 → YYYY-MM-DD (2026.11.27 · 11/27 · 2026년 11월 27일 · 엑셀 날짜)
  function toDate(s, year) {
    s = String(s || '').trim(); if (!s) return '';
    let m = s.match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/(\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/); if (m) return `20${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/(\d{1,2})\s*[./월]\s*(\d{1,2})/); if (m) return `${year || new Date().getFullYear()}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Math.round((+s - 25569) * 864e5)).toISOString().slice(0, 10);
    return '';
  }

  // ---------- 보내기: 문자 · 카카오톡 · 이메일 · 다른 앱(링크) · 복사 ----------
  // send({title, text, subject, num, email, link})
  const bridge = () => ['AdminAndroid', 'NUAndroid', 'DiaryAndroid', 'NativeDoc', 'PPAndroid', 'IeumAndroid'].map((k) => window[k]).find((b) => b && b.sendTo);
  async function copyText(t) {
    const b = ['AdminAndroid', 'NUAndroid', 'DiaryAndroid', 'NativeDoc'].map((k) => window[k]).find((x) => x && x.copyText);
    try { if (b && b.copyText(t)) return true; } catch (e) { }
    try { await navigator.clipboard.writeText(t); return true; } catch (e) { }
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { } ta.remove(); return ok;
  }
  function note(msg) { let t = document.getElementById('mr-toast'); if (!t) { t = document.createElement('div'); t.id = 'mr-toast'; t.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#1B2623;color:#fff;padding:10px 16px;border-radius:12px;z-index:10000;font-size:14.5px;max-width:86vw;text-align:center;font-family:inherit'; document.body.appendChild(t); } t.textContent = msg; t.style.display = 'block'; clearTimeout(t._t); t._t = setTimeout(() => { t.style.display = 'none'; }, 2600); }
  function send(o) {
    o = o || {}; if (!o.link) { const m = String(o.text || '').match(/https?:\/\/\S+/); if (m) o.link = m[0]; }
    const txt = (o.text || '') + (o.link && !(o.text || '').includes(o.link) ? '\n' + o.link : '');
    const sh = sheet(`<h3>📤 ${esc(o.title || '보내기')}</h3><div style="max-height:150px;overflow:auto;background:#F7F8F5;border:1px solid #D9DED7;border-radius:10px;padding:8px 10px;font-size:13.5px;margin:6px 0 12px">${esc(txt).replace(/\n/g, '<br>')}</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">${[['sms', '✉️', '문자', '#E3F8EE'], ['kakao', '💬', '카카오톡', '#FEE500'], ['email', '📧', '이메일', '#E3EEFF'], ['any', '🔗', o.link ? '링크' : '다른 앱', '#FFF1E5'], ['copy', '📋', '복사', '#F1F2EE']].map(([k, i, l, c]) => `<button data-mrs="${k}" style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 2px;border:0;border-radius:14px;background:${c};font:inherit;font-weight:700;font-size:13px;color:#1B2623;cursor:pointer"><span style="font-size:24px;line-height:1.1">${i}</span>${l}</button>`).join('')}</div>
      <div class="mr-r" style="justify-content:flex-end;margin-top:12px"><button class="mr-b g" id="mr-x">닫기</button></div>`);
    sh.querySelector('#mr-x').onclick = close;
    sh.querySelectorAll('[data-mrs]').forEach((b) => { b.onclick = async () => {
      const k = b.dataset.mrs, nat = bridge(); close();
      if (k === 'copy') { note((await copyText(txt)) ? '복사했어요 — 붙여 넣어 보내세요' : '복사하지 못했어요'); return; }
      if (nat) { nat.sendTo(k, '', '', txt, o.subject || o.title || '', k === 'email' ? (o.email || '') : k === 'sms' ? String(o.num || '').replace(/[^\d]/g, '') : ''); return; }
      if (k === 'sms') { const ios = /iPhone|iPad|Mac/i.test(navigator.userAgent); location.href = `sms:${String(o.num || '').replace(/[^\d]/g, '')}${ios ? '&' : '?'}body=${encodeURIComponent(txt)}`; return; }
      if (k === 'email') { location.href = `mailto:${encodeURIComponent(o.email || '')}?subject=${encodeURIComponent(o.subject || o.title || '')}&body=${encodeURIComponent(txt)}`; return; }
      if (navigator.share) { try { await navigator.share({ text: txt }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
      note((await copyText(txt)) ? (k === 'kakao' ? '복사했어요 — 카카오톡에 붙여 넣어 주세요' : '복사했어요 — 붙여 넣어 보내세요') : '복사하지 못했어요');
    }; });
  }
  window.MReader = { note, send, copyText, read, importWizard, rowsFromItems, similar, closest, toDate, pickFile, close, ocrCanvas };
})();
