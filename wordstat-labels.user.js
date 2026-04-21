// ==UserScript==
// @name         Яндекс Вордстат — подписи точек + АППГ
// @namespace    https://wordstat.yandex.ru/
// @version      5.9
// @description  Подписи всех точек на графике, колонки АППГ и МоМ в таблице — только на вкладке Динамика
// @author       Strong SEO — https://t.me/seregaseo
// @match        *://wordstat.yandex.ru/*
// @match        *://wordstat.yandex.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const CFG = { showAbsolute: true, showRelative: true, showDots: true, showAppg: true, showMom: true, panelOpen: true };
  const MONTHS_RU = { 'январь':1,'февраль':2,'март':3,'апрель':4,'май':5,'июнь':6,'июль':7,'август':8,'сентябрь':9,'октябрь':10,'ноябрь':11,'декабрь':12 };
  const NS = 'http://www.w3.org/2000/svg';
  const LABEL_CLS = 'ws-label', DOT_CLS = 'ws-dot';
  const APPG_CLS = 'ws-appg-td', APPG_TH = 'ws-appg-th';
  const MOM_CLS  = 'ws-mom-td',  MOM_TH  = 'ws-mom-th';
  const LABEL_FONT = 13, DOT_RADIUS = 6, OUTLINE = 4;
  const Y_ABOVE = -18, Y_BELOW = +22, MIN_Y_GAP = 14;

  function isGraphTabActive() {
    const radio = document.querySelector('input.radiobox__control[value="graph"]');
    return radio && radio.checked;
  }

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
  function prevMonthKey(month, year) { return month === 1 ? `12-${year-1}` : `${month-1}-${year}`; }
  function pctDiff(cur, prev) { if (prev == null || !prev) return null; return (cur - prev) / prev * 100; }
  function arrowHTML(v) {
    if (v === null || isNaN(+v) || v === '') return '<span style="color:#bbb">—</span>';
    const n = +v, color = n >= 0 ? '#22a35a' : '#e03f2e';
    return `<span style="color:${color};font-weight:700">${n>=0?'▲':'▼'}${Math.abs(n).toFixed(1)}%</span>`;
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

  function buildMaps(data) {
    const byKey = {};
    data.forEach(d => { byKey[`${d.month}-${d.year}`] = d; });
    const appg = {}, mom = {};
    data.forEach(d => {
      const prevYear  = byKey[`${d.month}-${d.year-1}`];
      const prevMonth = byKey[prevMonthKey(d.month, d.year)];
      appg[d.idx] = { abs: pctDiff(d.abs, prevYear?.abs  ?? null) };
      mom[d.idx]  = { abs: pctDiff(d.abs, prevMonth?.abs ?? null) };
    });
    return { appg, mom };
  }

  function ensureTh(thead, thCls, label, onSort) {
    if (thead.querySelector('.'+thCls)) return;
    const th = document.createElement('th');
    th.className = `table__column table__column_sortable ${thCls}`;
    th.setAttribute('colspan','1'); th.setAttribute('role','columnheader'); th.style.width='140px';
    th.innerHTML = `<span class="table__header-wrapper"><span class="table__th-start">Динамика</span><span class="table__th-end">${label}<span class="table__sort-switcher" data-dir="none"></span></span></span>`;
    thead.appendChild(th);
    th.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const sw = th.querySelector('.table__sort-switcher');
      const nd = sw.dataset.dir === 'asc' ? 'desc' : 'asc';
      sw.dataset.dir = nd;
      sw.className = `table__sort-switcher table__sort-switcher_type_${nd}`;
      onSort(nd);
    });
  }

  function injectColumns() {
    if (!isGraphTabActive()) { removeColumns(); return; }
    const table = document.querySelector('table.table__wrapper');
    if (!table) return;
    const data = readTable();
    const { appg, mom } = buildMaps(data);
    const thead = table.querySelector('thead tr');
    if (thead) {
      if (CFG.showAppg) ensureTh(thead, APPG_TH, 'к АППГ',       nd => sortBy(APPG_CLS, nd));
      else removeCol(APPG_CLS, APPG_TH);
      if (CFG.showMom)  ensureTh(thead, MOM_TH,  'к пред. мес.', nd => sortBy(MOM_CLS,  nd));
      else removeCol(MOM_CLS, MOM_TH);
    }
    [...table.querySelectorAll('tbody tr')].forEach((tr, vi) => {
      fillCell(tr, APPG_CLS, CFG.showAppg, appg[vi]?.abs);
      fillCell(tr, MOM_CLS,  CFG.showMom,  mom[vi]?.abs);
    });
  }

  function fillCell(tr, cls, show, val) {
    if (!show) { tr.querySelector('.'+cls)?.remove(); return; }
    let td = tr.querySelector('.'+cls);
    if (!td) { td = document.createElement('td'); td.className=`table__level-cell ${cls}`; td.setAttribute('role','cell'); tr.appendChild(td); }
    td.innerHTML = arrowHTML(val);
    td.dataset.val = (val == null || isNaN(val)) ? '' : String(val);
  }

  function removeCol(cls, thCls) { document.querySelectorAll('.'+cls+',.'+thCls).forEach(e => e.remove()); }
  function removeColumns() { removeCol(APPG_CLS, APPG_TH); removeCol(MOM_CLS, MOM_TH); }

  function sortBy(cls, dir) {
    const tbody = document.querySelector('table.table__wrapper tbody');
    if (!tbody) return;
    [...tbody.querySelectorAll('tr')].sort((a,b) => {
      const av = parseFloat(a.querySelector('.'+cls)?.dataset.val ?? '');
      const bv = parseFloat(b.querySelector('.'+cls)?.dataset.val ?? '');
      const an = isNaN(av)?-Infinity:av, bn = isNaN(bv)?-Infinity:bv;
      return dir==='asc' ? an-bn : bn-an;
    }).forEach(r => tbody.appendChild(r));
    injectColumns();
  }

  // ── График ────────────────────────────────────────────────────────
  function clearOldSvg(svg) { svg.querySelectorAll('.'+LABEL_CLS+',.'+DOT_CLS).forEach(e => e.remove()); }

  /**
   * Собираем подписи ВСЕХ серий в один массив, отталкиваем глобально,
   * потом рисуем все разом.
   */
  function collectSeriesLabels(pathEl, data, valueKey, color, tx, ty, svgW, svgH) {
    const coords = parsePath(pathEl.getAttribute('d'));
    const plotMinY = ty + 10, plotMaxY = svgH - 36;

    return coords.map((pt, i) => {
      const d = data[i]; if (!d) return null;
      const xAbs = tx + pt.x, yPt = ty + pt.y;
      const tooHigh = (yPt + Y_ABOVE) < plotMinY;
      const tooLow  = (yPt + Y_BELOW) > plotMaxY;
      const yInit   = tooHigh ? yPt+Y_BELOW : tooLow ? yPt+Y_ABOVE : (i%2===0 ? yPt+Y_ABOVE : yPt+Y_BELOW);
      return {
        x:     Math.max(26, Math.min(svgW-26, xAbs)),
        y:     yInit,
        yPt,
        xPt:   xAbs,
        val:   valueKey==='abs' ? fmt(d.absStr) : d.relStr,
        color,
        plotMinY, plotMaxY
      };
    }).filter(Boolean);
  }

  function repelLabels(all) {
    // Общий пул — отталкиваем вместе (20 проходов)
    for (let pass = 0; pass < 20; pass++) {
      // сортируем по X для попарного сравнения соседей
      const byX = [...all].sort((a,b) => a.x - b.x);
      for (let i = 1; i < byX.length; i++) {
        const a = byX[i-1], b = byX[i];
        if (Math.abs(a.x - b.x) >= 60) continue;   // далеко по X — не конфликтуют
        const dy = b.y - a.y;
        const overlap = MIN_Y_GAP - Math.abs(dy);
        if (overlap <= 0) continue;
        const half = overlap / 2 + 1;
        if (dy >= 0) {
          a.y = Math.max(a.plotMinY, a.y - half);
          b.y = Math.min(b.plotMaxY, b.y + half);
        } else {
          a.y = Math.min(a.plotMaxY, a.y + half);
          b.y = Math.max(b.plotMinY, b.y - half);
        }
      }
    }
  }

  function renderLabels(svg, labels) {
    labels.forEach(lbl => {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('class', LABEL_CLS);
      t.setAttribute('x', lbl.x); t.setAttribute('y', lbl.y);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', String(LABEL_FONT));
      t.setAttribute('font-weight', '700');
      t.setAttribute('fill', lbl.color);
      t.setAttribute('pointer-events', 'none');
      t.setAttribute('paint-order', 'stroke');
      t.setAttribute('stroke', 'white');
      t.setAttribute('stroke-width', String(OUTLINE));
      t.setAttribute('stroke-linejoin', 'round');
      t.textContent = lbl.val;
      svg.appendChild(t);
    });
  }

  function drawDots(svg, pathEl, tx, ty, color) {
    parsePath(pathEl.getAttribute('d')).forEach(pt => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('class', DOT_CLS);
      c.setAttribute('cx', tx+pt.x); c.setAttribute('cy', ty+pt.y);
      c.setAttribute('r', String(DOT_RADIUS));
      c.setAttribute('fill', color); c.setAttribute('stroke', 'white'); c.setAttribute('stroke-width', '2.5');
      c.setAttribute('pointer-events', 'none');
      svg.appendChild(c);
    });
  }

  // ── Главная функция ───────────────────────────────────────────────
  function update() {
    const svg = document.querySelector('[data-highcharts-chart] svg');
    if (svg) clearOldSvg(svg);
    if (!isGraphTabActive()) { removeColumns(); setPanel(false); return; }
    setPanel(true);
    injectColumns();
    if (!svg) return;
    const data = readTable();
    if (!data.length) return;

    const svgW = parseFloat(svg.getAttribute('width'))  || 800;
    const svgH = parseFloat(svg.getAttribute('height')) || 300;

    // Собираем все подписи в один пул
    const allLabels = [];
    const dotsToDraw = []; // {pathEl, tx, ty, color}

    document.querySelectorAll('.highcharts-series path.highcharts-graph').forEach(pathEl => {
      const cls   = pathEl.closest('g.highcharts-series')?.className?.baseVal || '';
      const { tx, ty } = getTranslate(pathEl.closest('g.highcharts-series'));

      if (cls.includes('absolute')) {
        if (CFG.showDots) dotsToDraw.push({ pathEl, tx, ty, color:'#197eea' });
        if (CFG.showAbsolute) allLabels.push(...collectSeriesLabels(pathEl, data, 'abs', '#197eea', tx, ty, svgW, svgH));
      }
      if (cls.includes('relative')) {
        if (CFG.showDots) dotsToDraw.push({ pathEl, tx, ty, color:'#fc3f1d' });
        if (CFG.showRelative) allLabels.push(...collectSeriesLabels(pathEl, data, 'rel', '#fc3f1d', tx, ty, svgW, svgH));
      }
    });

    // Глобальное отталкивание по всем подписям сразу
    repelLabels(allLabels);

    // Рисуем точки
    dotsToDraw.forEach(({ pathEl, tx, ty, color }) => drawDots(svg, pathEl, tx, ty, color));
    // Рисуем подписи
    renderLabels(svg, allLabels);
  }

  // ── Панель управления ─────────────────────────────────────────────
  function setPanel(v) { const p = document.getElementById('ws-panel'); if (p) p.style.display = v?'block':'none'; }

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
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;margin-bottom:5px;font-size:13px"><input type="checkbox" id="ws-appg" ${CFG.showAppg?'checked':''}> 📅 Динамика к АППГ</label>
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;margin-bottom:12px;font-size:13px"><input type="checkbox" id="ws-mom" ${CFG.showMom?'checked':''}> 📆 к пред. месяцу</label>
        <div style="text-align:center;padding-top:8px;border-top:1px solid #eee">
          <a href="https://t.me/seregaseo" target="_blank" rel="noopener noreferrer" style="color:#197eea;text-decoration:none;font-size:13px;font-weight:700">📢 Strong SEO</a>
          <div style="font-size:11px;color:#999;margin-top:2px">t.me/seregaseo</div>
        </div>
      </div>`;
    Object.assign(panel.style, {
      position:'fixed', bottom:'20px', right:'20px', width:'220px', display:'none',
      background:'white', borderRadius:'8px', boxShadow:'0 4px 24px rgba(0,0,0,.18)',
      zIndex:'99999', fontFamily:'"Yandex Sans Text Web",Arial,sans-serif', border:'1px solid #e8e8e8'
    });
    document.body.appendChild(panel);
    document.getElementById('ws-ph').addEventListener('click', () => {
      CFG.panelOpen = !CFG.panelOpen;
      document.getElementById('ws-pb').style.display = CFG.panelOpen ? 'block' : 'none';
      document.getElementById('ws-arr').textContent = CFG.panelOpen ? '▲' : '▼';
    });
    const bind = (id, key) => document.getElementById(id).addEventListener('change', function(){ CFG[key]=this.checked; update(); });
    bind('ws-abs','showAbsolute'); bind('ws-rel','showRelative'); bind('ws-dots','showDots');
    bind('ws-appg','showAppg'); bind('ws-mom','showMom');
  }

  function watchTabs() {
    document.querySelectorAll('input.radiobox__control').forEach(r => r.addEventListener('change', () => schedule()));
  }

  let debounce = null;
  function schedule() { clearTimeout(debounce); debounce = setTimeout(update, 500); }

  new MutationObserver(mutations => {
    const hit = mutations.some(m =>
      (m.type==='attributes' && (m.target.matches?.('path.highcharts-graph') || m.target.matches?.('input.radiobox__control'))) ||
      [...(m.addedNodes||[])].some(n => n.nodeType===1 && (
        n.matches?.('path.highcharts-graph,table,tbody,tr,td,input.radiobox__control') ||
        n.querySelector?.('path.highcharts-graph,table tbody tr,input.radiobox__control')
      ))
    );
    if (hit) schedule();
  }).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['d','checked','class'] });

  [700, 1600, 3200].forEach(d => setTimeout(() => { createPanel(); watchTabs(); update(); }, d));
})();
