// ไอคอนแบบเส้น (SVG) ใช้แทนอีโมจิ สีตามตัวอักษรรอบข้าง (currentColor)
const svg = d =>
  `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const CLOUD = 'M7 17.5h10.3a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.5 8.4 4.6 4.6 0 0 0 7 17.5z';
const CLOUD_UP = 'M7 14.5h10.3a3.8 3.8 0 0 0 .6-7.55A5.8 5.8 0 0 0 6.6 5.8 4.4 4.4 0 0 0 7 14.5z';

export const ICON = {
  // ส่วนติดต่อผู้ใช้ (UI เกม)
  info: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  news: svg('<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v8a2 2 0 0 1-2 2"/><path d="M7.5 9h6M7.5 12h6M7.5 15h4"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  chevL: svg('<path d="m14.5 6-6 6 6 6"/>'),
  chevR: svg('<path d="m9.5 6 6 6-6 6"/>'),
  chevD: svg('<path d="m6 9.5 6 6 6-6"/>'),
  chevU: svg('<path d="m6 14.5 6-6 6 6"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  book: svg('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>'),
  coins: svg('<ellipse cx="9" cy="7" rx="5" ry="2.5"/><path d="M4 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7"/><path d="M4 11v4c0 1.4 2.2 2.5 5 2.5 1 0 1.9-.1 2.7-.4"/><path d="M15 10.2c2.6.2 5 1.1 5 2.3v4c0 1.4-2.2 2.5-5 2.5s-5-1.1-5-2.5v-4"/>'),
  // เครื่องมือ
  select: svg('<path d="M6 3v16l4.2-4 3 6.2 2.6-1.2-3-6.1H19z"/>'),
  road: svg('<path d="M8.5 3 4 21M15.5 3 20 21"/><path d="M12 4v3M12 10.5v3M12 17v3"/>'),
  res: svg('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5.5h4V20"/>'),
  city: svg('<path d="M3 21V10l5-3v14M8 21V5l7-2.5V21M15 21v-9l6 2.5V21"/><path d="M2 21h20M11 8h1M11 12h1M11 16h1"/>'),
  com: svg('<path d="M4 21V9l8-5 8 5v12"/><path d="M2.5 21h19"/><path d="M8 12h2M14 12h2M8 16h2M14 16h2"/>'),
  ind: svg('<path d="M3 21V11l6 3.5V11l6 3.5V6h4v15z"/><path d="M7 18h1.5M12 18h1.5M17 18h1"/>'),
  power: svg('<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z"/>'),
  water: svg('<path d="M12 3s6.5 6.6 6.5 11.2a6.5 6.5 0 0 1-13 0C5.5 9.6 12 3 12 3z"/><path d="M9 14.5a3 3 0 0 0 3 3"/>'),
  park: svg('<path d="M12 21v-6"/><path d="M12 3.5c-3.5 0-6 2.6-6 5.8 0 2.8 2.2 5 6 5s6-2.2 6-5c0-3.2-2.5-5.8-6-5.8z"/><path d="M12 11.5 9.5 9.5M12 13.5l2.5-2"/>'),
  service: svg('<path d="M12 3v18M3 12h18"/><rect x="4" y="4" width="16" height="16" rx="3"/>'),
  farm: svg('<path d="M3 20h18"/><path d="M4 20v-8l4-3 4 3v8"/><path d="M14 20V8l3-3 3 3v12"/><path d="M6.5 20v-4h3v4"/>'),
  bulldoze: svg('<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 13h9l1-13"/><path d="M10 11v6M14 11v6"/>'),

  // สถิติ
  money: svg('<circle cx="12" cy="12" r="9"/><path d="M14.8 9c-.5-1-1.6-1.6-2.9-1.6-1.7 0-2.9.9-2.9 2.2 0 3 6 1.5 6 4.6 0 1.4-1.3 2.4-3.1 2.4-1.4 0-2.6-.7-3.1-1.8M12 6v1.4M12 16.6V18"/>'),
  pop: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.4 2.7-5.8 6-5.8s6 2.4 6 5.8"/><path d="M16 5.2a3.1 3.1 0 0 1 0 5.8M18 14.6c2 .7 3.5 2.6 3.5 5.4"/>'),
  jobs: svg('<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M9 7.5V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5v2M3 13h18M11 13v2h2v-2"/>'),
  net: svg('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  car: svg('<path d="M4 16v-4l2-5h12l2 5v4z"/><path d="M4 12h16"/><circle cx="8" cy="16.5" r="1.7"/><circle cx="16" cy="16.5" r="1.7"/>'),
  walker: svg('<circle cx="12" cy="4.5" r="1.8"/><path d="M12 8v6M12 10l-3 3M12 10l3 2.5M12 14l-2.5 6M12 14l2.5 6"/>'),
  paw: svg('<circle cx="7" cy="9" r="1.7"/><circle cx="11" cy="6" r="1.7"/><circle cx="15.5" cy="6.5" r="1.7"/><circle cx="18.5" cy="10" r="1.7"/><path d="M8.5 17c0-3 2.2-5 4-5s4.5 2 4.5 5c0 1.8-1.8 2.5-4.2 2.5S8.5 18.8 8.5 17z"/>'),

  // อากาศ
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8"/>'),
  cloud: svg(`<path d="${CLOUD}"/>`),
  rain: svg(`<path d="${CLOUD_UP}"/><path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>`),
  storm: svg(`<path d="${CLOUD_UP}"/><path d="M12.8 13.5 10 18h3l-1.4 3.8 3.8-5.3h-3z"/>`),
  wind: svg('<path d="M3 9h11a2.5 2.5 0 1 0-2.4-3.1"/><path d="M3 13h15a2.5 2.5 0 1 1-2.4 3.1"/><path d="M3 17h7"/>'),
  auto: svg('<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5"/>'),

  // ปุ่มกล้อง / ความเร็ว
  rotL: svg('<path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.5"/><path d="M3.5 3.5v5h5"/>'),
  rotR: svg('<path d="M20.5 12a8.5 8.5 0 1 1-2.8-6.3l2.8 2.8"/><path d="M20.5 3.5v5h-5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  home: svg('<path d="M3 11l9-7.5 9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>'),
  pause: svg('<path d="M8.5 5v14M15.5 5v14"/>'),
  play: svg('<path d="M7 4.8v14.4L19 12z"/>'),
  fast: svg('<path d="M3.5 5v14L12 12zM12 5v14l8.5-7z"/>'),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  reset: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>'),
};

// แทนที่ <span data-ic="ชื่อ"> ทั้งหน้าด้วยไอคอน
export function mountIcons(root = document) {
  root.querySelectorAll('[data-ic]').forEach(el => {
    const ic = ICON[el.dataset.ic];
    if (ic) el.innerHTML = ic;
  });
}
