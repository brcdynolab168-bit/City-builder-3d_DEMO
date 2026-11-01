// ---------------------------------------------------------------
// แผงข้อมูลสถานที่ (ดับเบิลคลิกที่อาคาร): ชื่อ รายละเอียด ความเป็นอยู่รอบๆ รีวิว และคอมเมนต์ของผู้เล่น
// ข้อมูลที่เก็บในเซฟ: state.places[ช่อง] = { k: 'ชนิด:แบบ', name?, cm: [{ w, s, x, d }] }
// ---------------------------------------------------------------
import { t, hasKey } from './i18n.js';

// ตัวกรองคำหยาบพื้นฐาน (ไทย/อังกฤษ/จีน): คอมเมนต์ที่มีคำเหล่านี้โพสต์ไม่ได้ และคำเหล่านี้ในคอมเมนต์เก่าจะถูกปิดด้วย ***
// ไม่ใช่ตัวกรองสมบูรณ์ เจ้าของเมือง/แอดมินยังลบคอมเมนต์ได้
const BAD = ['ควย', 'เหี้ย', 'สัส', 'แม่ง', 'ชิบหาย', 'ระยำ', 'ไอ้สัตว์', 'อีสัตว์', 'ส้นตีน', 'fuck', 'shit', 'bitch', 'asshole', 'dick', 'cunt', 'nigger', '傻逼', '他妈的', '妈的', '操你', '滚蛋'];
const BAD_RE = new RegExp(BAD.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
export const hasBad = s => { BAD_RE.lastIndex = 0; return BAD_RE.test(s); };
export const maskBad = s => String(s).replace(BAD_RE, m => '*'.repeat(m.length));

const FACTORS = ['park', 'school', 'health', 'safety', 'fire', 'transit', 'shops', 'clean', 'utility'];

// สุ่มแบบกำหนดผลได้ (เปิดแผงเดิมซ้ำแล้วรีวิวชุดเดิมไม่เปลี่ยน)
function rng(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

export function createPlacePanel(h) {
  const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = document.createElement('div');
  el.id = 'placePanel';
  document.body.appendChild(el);
  const st = document.createElement('style');
  st.textContent = `#placePanel{position:fixed;z-index:10;right:12px;top:70px;width:min(360px,calc(100vw - 24px));max-height:calc(100vh - 240px);display:flex;flex-direction:column;background:rgba(10,15,24,.96);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.18);border-radius:12px;color:#fff;box-shadow:0 14px 36px rgba(0,0,0,.55);opacity:0;pointer-events:none;transform:translateX(12px);transition:opacity .15s,transform .15s;font-size:13px}
#placePanel.show{opacity:1;pointer-events:auto;transform:none}
#placePanel .ph{display:flex;gap:8px;align-items:flex-start;padding:12px 12px 6px}
#placePanel .pt1{flex:1;min-width:0}#placePanel .pn{font-size:16px;font-weight:600;line-height:1.25;word-break:break-word}#placePanel .ps{font-size:11.5px;color:#9aa6b2;margin-top:2px}
#placePanel .pbtn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#fff;border-radius:7px;padding:3px 8px;cursor:pointer;font-size:12px}#placePanel .pbtn:hover{background:rgba(255,255,255,.16)}
#placePanel .ptabs{display:flex;gap:4px;padding:0 12px 6px;border-bottom:1px solid rgba(255,255,255,.1)}
#placePanel .ptab{flex:1;background:transparent;border:0;border-bottom:2px solid transparent;color:#9aa6b2;padding:6px 4px;cursor:pointer;font-size:12.5px}#placePanel .ptab.on{color:#fff;border-color:#f5a524}
#placePanel .pbody{overflow:auto;padding:8px 12px 12px}
#placePanel .pdesc{color:#c5ced8;line-height:1.45;margin-bottom:8px}
#placePanel .kvr{display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px dashed rgba(255,255,255,.08)}#placePanel .kvr span{color:#9aa6b2}#placePanel .kvr b{font-weight:600;text-align:right}
#placePanel h5{margin:12px 0 5px;font-size:11.5px;color:#f5a524;letter-spacing:.6px;font-weight:600}
#placePanel .fb{display:grid;grid-template-columns:96px 1fr 34px;gap:6px;align-items:center;margin:3px 0;font-size:12px}#placePanel .fb i{display:block;height:6px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden}#placePanel .fb i u{display:block;height:100%}#placePanel .fb em{font-style:normal;color:#9aa6b2;text-align:right}
#placePanel .big{display:flex;align-items:baseline;gap:8px;margin:2px 0 4px}#placePanel .big b{font-size:26px}#placePanel .star{color:#ffc83d;letter-spacing:1px}#placePanel .dim{color:#8794a1;font-size:11.5px}
#placePanel .rv{padding:8px 0;border-top:1px solid rgba(255,255,255,.08)}#placePanel .rv .w{font-weight:600;font-size:12.5px}#placePanel .rv .x{color:#c5ced8;margin-top:2px;line-height:1.4;word-break:break-word}#placePanel .rv .me{font-size:10.5px;color:#7bd88f;margin-left:6px}
#placePanel textarea,#placePanel input.nm{width:100%;box-sizing:border-box;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);border-radius:8px;color:#fff;padding:7px 9px;font:inherit;resize:vertical}
#placePanel .pick{display:flex;gap:2px;margin:6px 0}#placePanel .pick button{background:transparent;border:0;font-size:22px;color:#4a5563;cursor:pointer;padding:0 2px}#placePanel .pick button.on{color:#ffc83d}
#placePanel .row2{display:flex;gap:6px;margin-top:6px}`;
  document.head.appendChild(st);

  let cur = -1, tab = 'info', draftStars = 5, draftText = '';
  // คอมเมนต์ออนไลน์ (เพื่อนที่เข้ามาดูเมืองก็เขียนได้): โหลดตอนเปิดแท็บรีวิว
  let remote = { mi: -1, rows: null, err: false, busy: false };
  const kindOf = mi => { const tl = h.state().tiles[mi]; return tl ? tl.t + ':' + (tl.v || '') : ''; };
  function loadRemote(force) {
    if (!h.remote || cur < 0) return;
    if (!force && remote.mi === cur && remote.rows) return;
    const mi = cur;
    remote = { mi, rows: remote.mi === mi ? remote.rows : null, err: false, busy: true };
    h.remote.list(mi, kindOf(mi)).then(rows => { if (cur === mi) { remote = { mi, rows, err: false, busy: false }; render(); } })
      .catch(() => { if (cur === mi) { remote = { mi, rows: [], err: true, busy: false }; render(); } });
  }
  const places = () => (h.state().places ||= {});
  const entry = mi => {
    const tl = h.state().tiles[mi], key = tl ? tl.t + ':' + (tl.v || '') : '';
    const P = places();
    if (!P[mi] || P[mi].k !== key) P[mi] = { k: key, cm: [] };   // รื้อแล้วสร้างใหม่ = ที่ใหม่ ไม่เอาคอมเมนต์เก่ามา
    return P[mi];
  };
  const stars = n => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
  const col = v => (v >= 70 ? '#66bb6a' : v >= 45 ? '#ffb300' : '#ff5252');

  // รีวิวอัตโนมัติจากสภาพแวดล้อมจริงรอบสถานที่นี้
  function autoReviews(mi, D) {
    const r = rng(mi * 7919 + 13), out = [];
    const base = D.score / 20;   // 0..5
    const n = 3 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      const s = Math.max(1, Math.min(5, Math.round(base + (r() - 0.5) * 2.2)));
      // รีวิวดาวสูงพูดถึงข้อดี ดาวต่ำพูดถึงข้อเสีย ให้ข้อความสอดคล้องกับคะแนน
      const pool = D.factors.filter(x => (s >= 4 ? x.v >= 50 : s <= 2 ? x.v < 50 : true));
      const list = pool.length ? pool : D.factors;
      const f = list[Math.floor(r() * list.length)];
      const topic = t(`pl.f.${f.k}.${f.v >= 50 ? 'pos' : 'neg'}`);
      out.push({ w: h.villagerName(mi * 31 + k * 17), s, x: t('pl.open.' + s) + ' ' + topic, d: Math.max(0, h.state().day - Math.floor(r() * 12) - k) });
    }
    return out;
  }

  function render() {
    if (cur < 0) return;
    const D = h.describe(cur);
    if (!D) return hide();
    const E = entry(cur), readOnly = h.readOnly();
    const title = E.name || D.name;
    const auto = autoReviews(cur, D), mine = E.cm || [];
    const rrows = h.remote && remote.mi === cur && remote.rows ? remote.rows.map(r => ({ w: r.author_name || t('pl.anon'), s: r.stars, x: maskBad(r.body), d: new Date(r.created_at).toLocaleDateString(), id: r.id, au: r.author, net: true })) : [];
    const all = [...auto, ...mine, ...rrows];
    const avg = all.reduce((a, b) => a + b.s, 0) / Math.max(1, all.length);
    let body = '';
    if (tab === 'info') {
      body += `<div class="pdesc">${escH(D.desc)}</div>`;
      body += D.rows.map(([k, v]) => `<div class="kvr"><span>${escH(k)}</span><b>${escH(v)}</b></div>`).join('');
      body += `<h5>${escH(t('pl.living'))}</h5><div class="big"><b style="color:${col(D.score)}">${Math.round(D.score)}</b><span class="dim">/100 · ${escH(t('pl.living.' + (D.score >= 75 ? 'great' : D.score >= 55 ? 'ok' : D.score >= 35 ? 'poor' : 'bad')))}</span></div>`;
      body += D.factors.map(f => `<div class="fb"><span>${escH(t('pl.fn.' + f.k))}</span><i><u style="width:${f.v}%;background:${col(f.v)}"></u></i><em>${Math.round(f.v)}</em></div>`).join('');
      if (D.residents?.length) body += `<h5>${escH(t('pl.residents'))}</h5><div class="dim" style="line-height:1.6">${D.residents.map(escH).join(' · ')}</div>`;
      if (!readOnly) body += `<h5>${escH(t('pl.rename'))}</h5><div class="row2"><input class="nm" maxlength="30" value="${escH(E.name || '')}" placeholder="${escH(D.name)}"><button class="pbtn" data-a="rename">${escH(t('pl.save'))}</button></div>`
        + (D.canUpgrade ? `<div class="row2"><button class="pbtn" data-a="upgrade" style="flex:1">${escH(t('pl.upgrade'))}</button></div>` : '');
    } else {
      body += `<div class="big"><b>${avg.toFixed(1)}</b><span class="star">${stars(avg)}</span><span class="dim">(${all.length})</span></div>`;
      if (!readOnly || h.remote) {
        body += `<h5>${escH(t('pl.write'))}</h5><div class="pick">${[1, 2, 3, 4, 5].map(n => `<button data-a="star" data-n="${n}" class="${n <= draftStars ? 'on' : ''}">★</button>`).join('')}</div>`
          + `<textarea rows="3" maxlength="200" placeholder="${escH(t('pl.hint'))}">${escH(draftText)}</textarea><div class="row2"><button class="pbtn" data-a="post">${escH(t('pl.post'))}</button></div>`;
      }
      body += `<h5>${escH(t('pl.reviews'))}</h5>`;
      if (h.remote && remote.err) body += `<div class="dim">${escH(t('pl.remote.off'))}</div>`;
      if (h.remote && remote.busy && !remote.rows) body += `<div class="dim">${escH(t('fr.loading'))}</div>`;
      const meId = h.remote?.me?.(), ownerId = h.remote?.ownerId?.();
      body += [...rrows.map(x => ({ ...x, me: !!x.au && x.au === meId, del: x.au === meId || (!!ownerId && ownerId === meId) || !!h.remote?.isAdmin?.() })), ...mine.map(x => ({ ...x, me: true })).reverse(), ...auto]
        .map(x => `<div class="rv"><div class="w">${escH(x.w)}${x.me ? `<span class="me">${escH(t('pl.you'))}</span>` : ''} <span class="star">${stars(x.s)}</span> <span class="dim">· ${escH(x.net ? x.d : t('pl.day', { n: x.d }))}</span>${x.del ? ` <button class="pbtn" data-a="rdel" data-id="${x.id}" style="padding:0 6px;font-size:11px">✕</button>` : ''}</div><div class="x">${escH(maskBad(x.x))}</div></div>`).join('');
    }
    el.innerHTML = `<div class="ph"><div class="pt1"><div class="pn">${escH(title)}</div><div class="ps">${escH(D.sub)} · <span class="star">★</span> ${avg.toFixed(1)}</div></div><button class="pbtn" data-a="close">✕</button></div>`
      + `<div class="ptabs"><button class="ptab ${tab === 'info' ? 'on' : ''}" data-a="tab" data-t="info">${escH(t('pl.tab.info'))}</button><button class="ptab ${tab === 'rev' ? 'on' : ''}" data-a="tab" data-t="rev">${escH(t('pl.tab.rev'))} (${all.length})</button></div>`
      + `<div class="pbody">${body}</div>`;
  }

  el.addEventListener('click', e => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    h.sfx?.('click');
    if (a === 'close') return hide();
    if (a === 'tab') { tab = b.dataset.t; if (tab === 'rev') loadRemote(); return render(); }
    if (a === 'star') { draftText = el.querySelector('textarea')?.value ?? draftText; draftStars = +b.dataset.n; return render(); }
    if (a === 'rdel' && h.remote) { h.remote.del(+b.dataset.id).then(() => loadRemote(true)).catch(() => {}); return; }
    if (a === 'post' && h.remote) {
      const txt = (el.querySelector('textarea')?.value || '').trim().slice(0, 200);
      if (!txt) return;
      if (hasBad(txt)) { alert(t('pl.badword')); return; }
      b.disabled = true;
      h.remote.post(cur, kindOf(cur), draftStars, txt).then(() => { draftText = ''; loadRemote(true); render(); }).catch(() => {   // เซิร์ฟเวอร์ใช้ไม่ได้ (ยังไม่ได้สร้างตาราง ฯลฯ): เมืองตัวเองเก็บคอมเมนต์ในเซฟแทน
        remote.err = true;
        if (!h.readOnly()) { const E = entry(cur); E.cm.push({ w: h.playerName() || t('pl.anon'), s: draftStars, x: txt, d: h.state().day }); if (E.cm.length > 30) E.cm.shift(); draftText = ''; h.changed(); }
        b.disabled = false; render();
      });
      return;
    }
    if (cur < 0 || h.readOnly()) return;
    const E = entry(cur);
    if (a === 'rename') { E.name = el.querySelector('input.nm').value.trim().slice(0, 30) || undefined; h.changed(); return render(); }
    if (a === 'upgrade') { const r = b.getBoundingClientRect(); return h.upgrade(cur, r.left, r.top); }
    if (a === 'post') {
      const txt = (el.querySelector('textarea')?.value || '').trim().slice(0, 200);
      if (!txt) return;
      if (hasBad(txt)) { alert(t('pl.badword')); return; }
      E.cm.push({ w: h.playerName() || t('pl.anon'), s: draftStars, x: txt, d: h.state().day });
      if (E.cm.length > 30) E.cm.shift();
      draftText = ''; h.changed(); render();
    }
  });
  el.addEventListener('keydown', e => e.stopPropagation());   // พิมพ์คอมเมนต์ได้โดยไม่ไปกดแป้นลัดของเกม (1-9, Q/E ฯลฯ)

  function show(mi) {
    if (mi !== cur) { tab = 'info'; draftText = ''; draftStars = 5; }
    cur = mi; render(); el.classList.add('show');
    if (tab === 'rev') loadRemote();
  }
  function hide() { cur = -1; el.classList.remove('show'); }
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && cur >= 0 && !el.contains(document.activeElement)) hide(); });
  return { show, hide, refresh: () => { if (cur >= 0 && !el.contains(document.activeElement)) render(); }, get current() { return cur; }, FACTORS };
}
