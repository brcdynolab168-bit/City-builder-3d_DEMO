// ---------------------------------------------------------------
// หน้า Intro / เมนูหลัก: เล่นต่อ, เกมใหม่ (เลือกแผนที่), โหลดเกม (จัดการเซฟ), ตั้งค่า
// ---------------------------------------------------------------
import { t, setLang, getLang, LANGS, onLang } from './i18n.js';
import * as Saves from './saves.js';
import { MAP_IDS, previewMap } from './terrain.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function drawPreview(canvas, id) {
  const n = 80, span = 70;
  const hs = previewMap(id, n, span);
  canvas.width = n; canvas.height = n;
  const g = canvas.getContext('2d');
  const img = g.createImageData(n, n);
  for (let k = 0; k < n * n; k++) {
    const h = hs[k];
    let r, gr, b;
    if (h < 0.04) { const d = Math.min(1, -h / 1.2); r = 60 - 30 * d; gr = 140 - 50 * d; b = 190 - 40 * d; }
    else if (h < 0.32) { r = 224; gr = 205; b = 140; }
    else if (h < 4) { const j = (Math.sin(k * 12.9898) * 43758.5) % 1; r = 98 + 14 * j; gr = 164 + 12 * j; b = 76; }
    else if (h < 9) { r = 52; gr = 112; b = 62; }
    else if (h < 13) { r = 140; gr = 134; b = 122; }
    else { r = 244; gr = 246; b = 250; }
    // ขอบเมือง (กรอบ 48x48 ช่อง ตรงกลาง) ทำให้เห็นพื้นที่เล่นจริง
    const x = k % n, y = Math.floor(k / n);
    const half = (24 / span) * n, c = n / 2;
    const edge = Math.abs(Math.max(Math.abs(x - c), Math.abs(y - c)) - half) < 0.7;
    if (edge) { r = 255; gr = 255; b = 255; }
    img.data[k * 4] = r; img.data[k * 4 + 1] = gr; img.data[k * 4 + 2] = b; img.data[k * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

export function createMenu(h) {
  const root = document.getElementById('menu');
  let screen = 'main';
  let open = false, inGame = false;
  let selMap = 'river';

  const fmtDate = ms => {
    try { return new Date(ms).toLocaleString(getLang() === 'zh' ? 'zh-CN' : getLang() === 'en' ? 'en-GB' : 'th-TH', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return new Date(ms).toLocaleString(); }
  };
  const mapName = id => t('map.' + id);
  const btn = (act, label, extra = '', cls = '') => `<button class="mb ${cls}" data-act="${act}" ${extra}>${label}</button>`;

  function langBar() {
    return `<div class="mlang">${LANGS.map(l => `<button class="${l.id === getLang() ? 'on' : ''}" data-act="lang" data-v="${l.id}">${l.name}</button>`).join('')}</div>`;
  }

  function mainScreen() {
    const slots = Saves.listSlots();
    const act = h.getActive();
    const sub = act ? `${esc(act.name)} · ${mapName(act.map)}` : '';
    return `
      <div class="mlogo"><span>MINI</span><b>CITY</b><i>3D</i></div>
      <div class="mtag">${t('menu.tagline')}</div>
      <div class="mbtns">
        ${inGame ? btn('resume', t('menu.resume'), '', 'primary') : ''}
        ${act ? `<button class="mb ${inGame ? '' : 'primary'}" data-act="continue"><span>${t('menu.continue')}</span><small>${sub}</small></button>` : ''}
        ${btn('new', t('menu.new'))}
        ${btn('load', t('menu.load') + (slots.length ? ` (${slots.length})` : ''), slots.length ? '' : 'disabled')}
        ${btn('settings', t('menu.settings'))}
      </div>
      <div class="mfoot">${t('menu.footer')}<br>${t('daylen')} · ${t('about')}</div>`;
  }

  function newScreen() {
    const slots = Saves.listSlots();
    return `
      <div class="mtitle">${t('new.title')}</div>
      <div class="mapgrid">${MAP_IDS.map(id => `
        <button class="mapcard ${id === selMap ? 'on' : ''}" data-act="pickmap" data-v="${id}">
          <canvas data-map="${id}"></canvas>
          <b>${mapName(id)}</b><small>${t('map.' + id + '.desc')}</small>
        </button>`).join('')}
      </div>
      <label class="mfield"><span>${t('new.name')}</span><input id="mName" maxlength="28" value="${esc(t('new.defaultName', { n: slots.length + 1 }))}"></label>
      <div class="mrow">${btn('back', t('menu.back'))}${btn('start', t('new.start'), '', 'primary')}</div>`;
  }

  function loadScreen() {
    const slots = Saves.listSlots();
    const act = h.getActive();
    return `
      <div class="mtitle">${t('load.title')}</div>
      <div class="slots">${slots.length ? slots.map(s => `
        <div class="slot ${act && act.id === s.id ? 'cur' : ''}">
          <div class="si">
            <b>${esc(s.name)}</b>
            <span>${mapName(s.map)} · ${t('load.info', { day: s.day || 0, pop: (s.pop || 0).toLocaleString(), money: (s.money || 0).toLocaleString() })}</span>
            <small>${t('load.updated', { t: fmtDate(s.updated) })}</small>
          </div>
          <div class="sb">
            <button class="mb primary" data-act="play" data-id="${s.id}">${t('load.play')}</button>
            <button class="mb" data-act="rename" data-id="${s.id}">${t('load.rename')}</button>
            <button class="mb" data-act="dup" data-id="${s.id}">${t('load.dup')}</button>
            <button class="mb danger" data-act="del" data-id="${s.id}">${t('load.delete')}</button>
          </div>
        </div>`).join('') : `<div class="empty">${t('load.empty')}</div>`}</div>
      <div class="mrow">${btn('back', t('menu.back'))}</div>`;
  }

  function settingsScreen() {
    const S = h.settings.get();
    const slider = (k, label) => `<label class="mfield sl"><span>${label}</span><input type="range" min="0" max="100" value="${Math.round(S[k] * 100)}" data-slider="${k}"><em>${Math.round(S[k] * 100)}</em></label>`;
    const seg = (key, items, cur) => `<div class="mseg">${items.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" data-act="set" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
    return `
      <div class="mtitle">${t('set.title')}</div>
      <div class="msec"><h4>${t('set.language')}</h4>${seg('lang', LANGS.map(l => [l.id, l.name]), getLang())}</div>
      <div class="msec"><h4>${t('set.sound')}</h4>
        ${slider('master', t('set.master'))}${slider('sfx', t('set.sfx'))}${slider('music', t('set.music'))}
        <label class="mchk"><input type="checkbox" data-chk="mute" ${S.mute ? 'checked' : ''}> ${t('set.mute')}</label>
      </div>
      <div class="msec"><h4>${t('set.graphics')}</h4>${seg('quality', [['low', t('q.low')], ['med', t('q.med')], ['high', t('q.high')], ['rtx', 'RTX']], S.quality)}
        <div class="mdesc">${t('q.' + S.quality + '.desc')}</div></div>
      <div class="msec"><h4>${t('side.control')}</h4>${seg('mode', [['trackpad', t('m.trackpad')], ['mouse', t('m.mouse')]], S.mode)}</div>
      <div class="mrow">${btn('back', t('menu.back'))}</div>`;
  }

  function render() {
    const body = screen === 'new' ? newScreen() : screen === 'load' ? loadScreen() : screen === 'settings' ? settingsScreen() : mainScreen();
    root.innerHTML = `${langBar()}<div class="mpanel scr-${screen}">${body}</div>`;
    root.querySelectorAll('canvas[data-map]').forEach(c => drawPreview(c, c.dataset.map));
  }

  function go(s) { screen = s; render(); h.sfx?.('menu'); }

  root.addEventListener('input', e => {
    const k = e.target.dataset?.slider;
    if (k) {
      const v = e.target.value / 100;
      h.settings.set(k, v);
      e.target.nextElementSibling.textContent = e.target.value;
    }
  });
  root.addEventListener('change', e => {
    if (e.target.dataset?.chk === 'mute') h.settings.set('mute', e.target.checked);
  });
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const act = el.dataset.act, id = el.dataset.id;
    h.sfx?.('click');
    switch (act) {
      case 'lang': setLang(el.dataset.v); h.settings.set('lang', el.dataset.v); break;   // onLang จะวาดใหม่
      case 'resume': hide(); h.onResume(); break;
      case 'continue': hide(); h.onContinue(); break;
      case 'new': screen = 'new'; render(); break;
      case 'load': screen = 'load'; render(); break;
      case 'settings': screen = 'settings'; render(); break;
      case 'back': screen = 'main'; render(); break;
      case 'pickmap':
        selMap = el.dataset.v;
        root.querySelectorAll('.mapcard').forEach(c => c.classList.toggle('on', c.dataset.v === selMap));
        break;
      case 'start': {
        const name = (root.querySelector('#mName')?.value || '').trim() || t('new.defaultName', { n: Saves.listSlots().length + 1 });
        h.onNew(name, selMap);
        break;
      }
      case 'play': h.onLoad(id); break;
      case 'rename': {
        const s = Saves.getSlot(id);
        const nn = window.prompt(t('load.renamePrompt'), s?.name || '');
        if (nn && nn.trim()) { Saves.renameSlot(id, nn.trim().slice(0, 28)); render(); h.onSlotsChanged?.(); }
        break;
      }
      case 'dup': Saves.duplicateSlot(id); render(); break;
      case 'del': {
        const s = Saves.getSlot(id);
        if (window.confirm(t('load.deleteConfirm', { name: s?.name || '' }))) {
          Saves.deleteSlot(id);
          h.onDeleted?.(id);
          render();
        }
        break;
      }
      case 'set': {
        h.settings.set(el.dataset.k, el.dataset.v);
        if (el.dataset.k === 'lang') setLang(el.dataset.v); else render();
        break;
      }
    }
  });
  onLang(() => { if (open) render(); });

  function show(scr = 'main', fromGame = false) {
    inGame = fromGame; screen = scr; open = true;
    document.body.classList.add('menu-open');
    root.classList.add('show');
    render();
  }
  function hide() {
    open = false;
    root.classList.remove('show');
    document.body.classList.remove('menu-open');
  }
  return { show, hide, get isOpen() { return open; }, get inGame() { return inGame; }, refresh: () => open && render() };
}
