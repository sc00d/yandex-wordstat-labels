// ==UserScript==
// @name         Яндекс Вордстат — подписи точек + АППГ
// @namespace    https://wordstat.yandex.ru/
// @version      5.6
// @description  Подписи всех точек на графике, колонка АППГ в таблице — только на вкладке Динамика
// @author       Strong SEO — https://t.me/seregaseo
// @match        *://wordstat.yandex.ru/*
// @match        *://wordstat.yandex.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const CFG = { showAbsolute: true, showRelative: true, showDots: true, showAppg: true, panelOpen: true };
  const MONTHS_RU = { 'январь':1,'февраль':2,'март':3,'апрель':4,'май':5,'июнь':6,'июль':7,'август':8,'сентябрь':9,'октябрь':10,'ноябрь':11,'декабрь':12 };
  const NS = 'http://www.w3.org/2000/svg';
  const LABEL_CLS = 'ws-label', DOT_CLS = 'ws-dot', APPG_CLS = 'ws-appg-td', APPG_TH = 'ws-appg-th';
  const LABEL_FONT = 13;
  const DOT_RADIUS = 6;
  const OUTLINE = 4;
  const Y_ABOVE = -18;
  const Y_BELOW = +22;
  const MIN_Y_GAP = 14;

  // ── Определяем активную вкладку ───────────────────────────────────
  function isGraphTabActive() {
    // Вкладка "Динамика" — radio#graph с value="graph"
    const radio = document.querySelector('input.radiobox__control[value="graph"]');
    return radio && radio.checked;
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function fmt(str) { return String(str).replace(/\s/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,'\u00a0'); }
  function numVal(str) { return parseFloat(String(str).replace(/\s/g,'').replace(',','.')) || 0; }
  function parsePath(d) { return [...d.matchAll(/[ML]\s*([\d.]+)\s+([\d.]+)/g)].map(m => ({ x:+m[1], y:+m[2] })); }
  function getTranslate(el) {
    const m = (el?.getAttribute('transform')||'').match(/translate\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
    return m ? { tx:+m[1], ty:+m[2] } : { tx:0, ty:0 };
  }
  function parseMonthYear(str) {
    const parts = String(str).trim().toLowerCase().split(' ');
    return { month: MONTHS_RU[parts[0]] || 0, year: parseInt(parts[1]) || 0 };
  }
  function pctDiff(cur, prev) { if (!prev) return null; return (cur - prev) / prev * 100; }
  function arrowHTML(v) {
    if (v === null || isNaN(v) || v === '') return '<span style="color:#bbb">—</span>';
    const color = v >= 0 ? '#22a35a' : '#e03f2e';
    return `<span style="color:${color};font-weight:700">${v>=0?'▲':'▼'}${Math.abs(v).toFixed(1)}%</span>`;
  }

  // ── Таблица ───────────────────────────────────────────────────────
  function readTable() {
    return [...document.querySelectorAll('table.table__wrapper tbody tr')].map((tr, idx) => {
      const cells = [...tr.cells].map(c => c.textContent.trim());
      if (cells.length < 3) return null;
      const { month, year } = parseMonthYear(cells[0]);
      return { idx, label:cells[0], month, year, abs:numVal(cells[1]), absStr:cells[1], rel:numVal(cells[2]), relStr:cells[2], tr };
    }).filter(Boolean);
  }

  function buildAppgMap(data) {
    const byKey = {};
    data.forEach(d => { byKey[`${d.month}-${d.year}`] = d; });
    const map = {};
    data.forEach(d => {
      const prev = byKey[`${d.month}-${d.year-1}`];
      map[d.idx] = { abs: pctDiff(d.abs, prev?.abs ?? null), rel: pctDiff(d.rel, prev?.rel ?? null) };
    });
    return map;
  }

  function injectAppgColumn() {
    // Удаляем если не та вкладка или настройка выключена
    if (!isGraphTabActive() || !CFG.showAppg) { removeAppgColumn(); return; }

    const table = document.querySelector('table.table__wrapper');
    if (!table) return;
    const data = readTable();
    const appgByIdx = buildAppgMap(data);

    const thead = table.querySelector('thead tr');
    if (thead && !thead.querySelector('.'+APPG_TH)) {
      const th = document.createElement('th');
      th.className = `table__column table__column_sortable ${APPG_TH}`;
      th.setAttribute('colspan','1'); th.setAttribute('role','columnheader'); th.style.width='140px';
      th.innerHTML = `<span class="table__header-wrapper"><span class="table__th-start">Динамика</span><span class="table__th-end">к АППГ<span class="table__sort-switcher" data-dir="none"></span></span></span>`;
      thead.appendChild(th);
      th.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        const sw = th.querySelector('.table__sort-switcher');
        const nd = sw.dataset.dir === 'asc' ? 'desc' : 'asc';
        sw.dataset.dir = nd;
        sw.className = `table__sort-switcher table__sort-switcher_type_${nd}`;
        sortTableByAppg(nd);
      });
    }

    [...table.querySelectorAll('tbody tr')].forEach((tr, vi) => {
      const appg = appgByIdx[vi] || { abs:null };
      let td = tr.querySelector('.'+APPG_CLS);
      if (!td) { td = document.createElement('td'); td.className=`table__level-cell ${APPG_CLS}`; td.setAttribute('role','cell'); tr.appendChild(td); }
      td.innerHTML = arrowHTML(appg.abs);
      td.dataset.abs = appg.abs == null ? '' : String(appg.abs);
    });
  }

  function removeAppgColumn() {
    document.querySelectorAll('.'+APPG_CLS+',.'+APPG_TH).forEach(e => e.remove());
  }

  function sortTableByAppg(dir) {
    const tbody = document.querySelector('table.table__wrapper tbody');
    if (!tbody) return;
    const rows = [...tbody.querySelectorAll('tr')];
    rows.sort((a,b) => {
      const av = parseFloat(a.querySelector('.'+APPG_CLS)?.dataset.abs ?? '');
      const bv = parseFloat(b.querySelector('.'+APPG_CLS)?.dataset.abs ?? '');
      const an = isNaN(av)?-Infinity:av, bn = isNaN(bv)?-Infinity:bv;
      return dir==='asc' ? an-bn : bn-an;
    });
    rows.forEach(r => tbody.appendChild(r));
    injectAppgColumn();
  }

  // ── График ────────────────────────────────────────────────────────
  function clearOldSvg(svg) {
    svg.querySelectorAll('.'+LABEL_CLS+',.'+DOT_CLS).forEach(e => e.remove());
  }

  function buildLabels(coords, tx, ty, svgW, svgH, data, valueKey) {
    const plotMinY = ty + 10;
    const plotMaxY = svgH - 36;

    const labels = coords.map((pt, i) => {
      const d = data[i];
      if (!d) return null;
      const xAbs = tx + pt.x;
      const yPt  = ty + pt.y;
      const tooHigh = (yPt + Y_ABOVE) < plotMinY;
      const tooLow  = (yPt + Y_BELOW) > plotMaxY;
      let yLabel;
      if (tooHigh)      yLabel = yPt + Y_BELOW;
      else if (tooLow)  yLabel = yPt + Y_ABOVE;
      else              yLabel = (i % 2 === 0) ? yPt + Y_ABOVE : yPt + Y_BELOW;

      const xLabel = Math.max(26, Math.min(svgW - 26, xAbs));
      const val = valueKey === 'abs' ? fmt(d.absStr) : d.relStr;
      return { x: xLabel, y: yLabel, yPt, val };
    }).filter(Boolean);

    // Итеративное отталкивание по Y
    for (let pass = 0; pass < 20; pass++) {
      const sorted = [...labels].sort((a,b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i-1], b = sorted[i];
        if (Math.abs(a.x - b.x) >= 60) continue;
        const dy = b.y - a.y;
        const overlap = MIN_Y_GAP - Math.abs(dy);
        if (overlap <= 0) continue;
        const half = overlap / 2 + 1;
        if (dy >= 0) { a.y = Math.max(plotMinY, a.y - half); b.y = Math.min(plotMaxY, b.y + half); }
        else         { a.y = Math.min(plotMaxY, a.y + half); b.y = Math.max(plotMinY, b.y - half); }
      }
    }
    return labels;
  }

  function drawSeries(svg, pathEl, data, valueKey, color, showLabels) {
    const group = pathEl.closest('g.highcharts-series');
    const { tx, ty } = getTranslate(group);
    const coords = parsePath(pathEl.getAttribute('d'));
    const svgW = parseFloat(svg.getAttribute('width')) || 800;
    const svgH = parseFloat(svg.getAttribute('height')) || 300;

    if (CFG.showDots) {
      coords.forEach(pt => {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('class', DOT_CLS);
        c.setAttribute('cx', tx + pt.x); c.setAttribute('cy', ty + pt.y);
        c.setAttribute('r', String(DOT_RADIUS));
        c.setAttribute('fill', color); c.setAttribute('stroke','white'); c.setAttribute('stroke-width','2.5');
        c.setAttribute('pointer-events','none');
        svg.appendChild(c);
      });
    }

    if (!showLabels) return;

    buildLabels(coords, tx, ty, svgW, svgH, data, valueKey).forEach(lbl => {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('class', LABEL_CLS);
      t.setAttribute('x', lbl.x); t.setAttribute('y', lbl.y);
      t.setAttribute('text-anchor','middle');
      t.setAttribute('font-size', String(LABEL_FONT));
      t.setAttribute('font-weight','700');
      t.setAttribute('fill', color);
      t.setAttribute('pointer-events','none');
      t.setAttribute('paint-order','stroke');
      t.setAttribute('stroke','white');
      t.setAttribute('stroke-width', String(OUTLINE));
      t.setAttribute('stroke-linejoin','round');
      t.textContent = lbl.val;
      svg.appendChild(t);
    });
  }

  // ── Главная функция обновления ────────────────────────────────────
  function update() {
    // Очищаем SVG в любом случае при смене вкладки
    const svg = document.querySelector('[data-highcharts-chart] svg');
    if (svg) clearOldSvg(svg);

    if (!isGraphTabActive()) {
      // Не вкладка "Динамика" — убираем всё и выходим
      removeAppgColumn();
      setPanel(false);
      return;
    }

    setPanel(true);
    injectAppgColumn();

    if (!svg) return;
    const data = readTable();
    if (!data.length) return;

    document.querySelectorAll('.highcharts-series path.highcharts-graph').forEach(pathEl => {
      const cls = pathEl.closest('g.highcharts-series')?.className?.baseVal || '';
      if (cls.includes('absolute')) drawSeries(svg, pathEl, data, 'abs', '#197eea', CFG.showAbsolute);
      if (cls.includes('relative')) drawSeries(svg, pathEl, data, 'rel', '#fc3f1d', CFG.showRelative);
    });
  }

  // ── Панель управления ─────────────────────────────────────────────
  function setPanel(visible) {
    const p = document.getElementById('ws-panel');
    if (p) p.style.display = visible ? 'block' : 'none';
  }

  function createPanel() {
    if (document.getElementById('ws-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'ws-panel';
    panel.innerHTML = `
      <div id="ws-ph" style="background:#197eea;color:#fff;padding:8px 12px;border-radius:8px 8px 0 0;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700;user-select:none">
        <span>📊 Вордстат+</span><span id="ws-arr">▲</span>
      </div>
      <div id="ws-pb" style="padding:12px 14px">
        <div style="font-size:11px;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">График</div>
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;margin-bottom:5px;font-size:13px"><input type="checkbox" id="ws-abs" ${CFG.showAbsolute?'checked':''}><span style="color:#197eea;font-weight:700">●</span> Число запросов</label>
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;margin-bottom:5px;font-size:13px"><input type="checkbox" id="ws-rel" ${CFG.showRelative?'checked':''}><span style="color:#fc3f1d;font-weight:700">●</span> Доля запросов</label>
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;margin-bottom:10px;font-size:13px"><input type="checkbox" id="ws-dots" ${CFG.showDots?'checked':''}>⬤ Кружки на точках</label>
        <div style="font-size:11px;color:#999;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Таблица</div>
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;margin-bottom:12px;font-size:13px"><input type="checkbox" id="ws-appg" ${CFG.showAppg?'checked':''}>📈 Колонка АППГ</label>
        <div style="text-align:center;padding-top:8px;border-top:1px solid #eee">
          <a href="https://t.me/seregaseo" target="_blank" rel="noopener noreferrer" style="color:#197eea;text-decoration:none;font-size:13px;font-weight:700">📢 Strong SEO</a>
          <div style="font-size:11px;color:#999;margin-top:2px">t.me/seregaseo</div>
        </div>
      </div>`;
    Object.assign(panel.style, {
      position:'fixed', bottom:'20px', right:'20px', width:'220px', display:'none',
      background:'white', borderRadius:'8px',
      boxShadow:'0 4px 24px rgba(0,0,0,.18)', zIndex:'99999',
      fontFamily:'"Yandex Sans Text Web",Arial,sans-serif', border:'1px solid #e8e8e8'
    });
    document.body.appendChild(panel);
    document.getElementById('ws-ph').addEventListener('click', () => {
      CFG.panelOpen = !CFG.panelOpen;
      document.getElementById('ws-pb').style.display = CFG.panelOpen ? 'block' : 'none';
      document.getElementById('ws-arr').textContent = CFG.panelOpen ? '▲' : '▼';
    });
    const bind = (id, key) => document.getElementById(id).addEventListener('change', function(){ CFG[key]=this.checked; update(); });
    bind('ws-abs','showAbsolute'); bind('ws-rel','showRelative'); bind('ws-dots','showDots'); bind('ws-appg','showAppg');
  }

  // ── Подписка на переключение вкладок ─────────────────────────────
  function watchTabs() {
    // Вешаем change на radio-кнопки вкладок
    document.querySelectorAll('input.radiobox__control').forEach(radio => {
      radio.addEventListener('change', () => schedule());
    });
  }

  // ── MutationObserver + дебаунс ────────────────────────────────────
  let debounce = null;
  function schedule() { clearTimeout(debounce); debounce = setTimeout(update, 500); }

  new MutationObserver(mutations => {
    const hit = mutations.some(m =>
      (m.type === 'attributes' && (
        m.target.matches?.('path.highcharts-graph') ||
        m.target.matches?.('input.radiobox__control')
      )) ||
      [...(m.addedNodes||[])].some(n => n.nodeType===1 && (
        n.matches?.('path.highcharts-graph,table,tbody,tr,td,input.radiobox__control') ||
        n.querySelector?.('path.highcharts-graph,table tbody tr,input.radiobox__control')
      ))
    );
    if (hit) schedule();
  }).observe(document.body, {
    childList:true, subtree:true,
    attributes:true, attributeFilter:['d','checked','class']
  });

  [700, 1600, 3200].forEach(delay => setTimeout(() => { createPanel(); watchTabs(); update(); }, delay));
})();
