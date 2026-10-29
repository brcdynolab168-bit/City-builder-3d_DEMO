// ---------------------------------------------------------------
// หลายภาษา: ไทย / English / 中文
// ใช้ t('key', {n: 5}) ในโค้ด และ data-i18n="key" / data-i18n-title="key" ใน HTML
// ---------------------------------------------------------------

export const LANGS = [
  { id: 'th', name: 'ไทย' },
  { id: 'en', name: 'English' },
  { id: 'zh', name: '中文' },
];

const D = {
  th: {
    'app.title': 'Mini City 3D',
    // เครื่องมือ
    'tool.select': 'ดูเมือง', 'tool.road': 'ถนน', 'tool.res': 'ที่อยู่อาศัย', 'tool.com': 'พาณิชย์', 'tool.ind': 'อุตสาหกรรม',
    'tool.power': 'โรงไฟฟ้า', 'tool.water': 'โรงประปา', 'tool.park': 'สวน', 'tool.service': 'บริการ', 'tool.bulldoze': 'รื้อ',
    'tip.select': 'เลื่อนดูเมือง ไม่สร้างอะไร',
    'tip.road': 'ถนน (บนแม่น้ำ = สะพาน $40) ทางแยกมีไฟจราจรและทางม้าลายให้เอง',
    'tip.ind': 'โซนโรงงาน', 'tip.park': 'สวนสาธารณะ ผู้คนมาเดินเล่น ที่อยู่อาศัยรอบๆโตเร็วขึ้น',
    'tip.bulldoze': 'รื้อถอน',
    'free': 'ฟรี',
    // ตัวเลือกย่อย
    'v.res.zone': 'โซนบ้าน (โตเอง)', 'v.res.zone.note': 'บ้านเล็กโตเป็นคอนโดเองตามความต้องการ',
    'v.res.house': 'บ้านเดี่ยว', 'v.res.twin': 'ทาวน์เฮาส์', 'v.res.apt': 'อพาร์ตเมนต์', 'v.res.condo': 'คอนโด',
    'v.com.zone': 'โซนพาณิชย์ (โตเอง)', 'v.com.zone.note': 'ร้านค้า/สำนักงาน โตเองตามความต้องการ',
    'v.com.seven': '7-Eleven', 'v.com.seven.note': 'ร้านสะดวกซื้อ', 'v.com.cj': 'CJ', 'v.com.cj.note': 'ร้านสะดวกซื้อ',
    'v.com.kfc': 'KFC', 'v.com.kfc.note': 'ร้านอาหารจานด่วน', 'v.com.gas': 'ปั๊มน้ำมัน',
    'v.com.lotus': 'โลตัส', 'v.com.lotus.note': 'ซูเปอร์มาร์เก็ต', 'v.com.mall': 'ห้างสรรพสินค้า',
    'v.power.solar': 'โซลาร์ฟาร์ม (เล็ก)', 'v.power.gas': 'โรงไฟฟ้าก๊าซ (กลาง)', 'v.power.thermal': 'โรงไฟฟ้าใหญ่',
    'v.water.pump': 'สถานีสูบน้ำ (เล็ก)', 'v.water.plant': 'โรงประปา (กลาง)', 'v.water.big': 'โรงประปาใหญ่',
    'v.service.school': 'โรงเรียน', 'v.service.school.note': 'บ้านรอบๆโตเร็วขึ้น',
    'v.service.hospital': 'โรงพยาบาล', 'v.service.hospital.note': 'บ้านรอบๆโตเร็วขึ้น',
    'v.service.bu': 'ม.กรุงเทพ', 'v.service.bu.note': 'มหาวิทยาลัย (จำลองแบบสไตล์ มหาวิทยาลัยกรุงเทพ)', 'sign.bu': 'มหาวิทยาลัยกรุงเทพ',
    'tip.power': 'โรงไฟฟ้าหลายขนาด (เอาเมาส์ชี้เพื่อเลือก)', 'tip.water': 'โรงประปาหลายขนาด ต้องตั้งใกล้แม่น้ำ/ทะเล/ทะเลสาบ (ภายใน 3 ช่อง)',
    'tip.res': 'เอาเมาส์ชี้เพื่อเลือกแบบบ้าน', 'tip.com': 'เอาเมาส์ชี้เพื่อเลือกร้านค้า', 'tip.service': 'โรงเรียน / โรงพยาบาล: จ้างงาน และทำให้บ้านรอบๆโตเร็วขึ้น',
    'st.pop': 'อยู่ได้ {n} คน', 'st.jobs': 'งาน {n}', 'st.cap': 'ผลิต {n}', 'st.use': 'ใช้ไฟ {p} · น้ำ {w}', 'st.upkeep': 'ดูแล ${n}/วัน',
    // ป้ายบนอาคาร
    'sign.gas': 'น้ำมัน', 'sign.lotus': 'โลตัส', 'sign.mall': 'ห้างสรรพสินค้า', 'sign.school': 'โรงเรียน', 'sign.hospital': 'โรงพยาบาล', 'sign.road': 'ถ.',
    // HUD
    'hud.money': 'เงิน', 'hud.pop': 'ประชากร', 'hud.jobs': 'งาน', 'hud.power': 'ไฟฟ้า', 'hud.water': 'น้ำประปา', 'hud.net': 'รายได้สุทธิ/วัน', 'hud.day': 'วันที่',
    'hud.powerTip': 'ไฟฟ้า ใช้/ผลิต', 'hud.waterTip': 'น้ำประปา ใช้/ผลิต', 'hud.demandTip': 'ความต้องการ: R=ที่อยู่อาศัย C=พาณิชย์ I=อุตสาหกรรม',
    'wind': 'ลม {n} กม./ชม.',
    'wx.clear': 'แจ่มใส', 'wx.cloudy': 'เมฆมาก', 'wx.rain': 'ฝนตก', 'wx.storm': 'พายุฝนฟ้าคะนอง',
    // แผงข้าง
    'side.graphics': 'กราฟิก', 'side.weather': 'สภาพอากาศ', 'side.control': 'ควบคุม',
    'q.low': 'ต่ำ', 'q.med': 'กลาง', 'q.high': 'สูง',
    'q.low.desc': 'เบาที่สุด: ไม่มีเงา รถไม่กี่คัน เหมาะกับเครื่องช้า',
    'q.med.desc': 'สมดุล: เงานุ่ม ไฟจราจร ป้าย ฝน ป่าไม้ รถ ผู้คน และสัตว์เลี้ยงพอเหมาะ',
    'q.high.desc': 'สมจริงสุด: เงาละเอียด แสงเรืองกลางคืน ฝนหนา ป่าเต็มภูเขา ไฟจราจรและป้ายครบ รถ คน หมา แมว จำนวนมาก',
    'w.auto': 'อัตโนมัติ (เปลี่ยนเอง)', 'w.clear': 'แจ่มใส', 'w.cloudy': 'เมฆมาก', 'w.rain': 'ฝนตก', 'w.storm': 'พายุฝนฟ้าคะนอง',
    'm.trackpad': 'ทัชแพด', 'm.mouse': 'เมาส์',
    'help.trackpad': 'ลากสองนิ้ว = เลื่อนแผนที่<br>หนีบนิ้ว (pinch) = ซูม<br>Alt/Option + ลากสองนิ้ว = หมุน<br>คลิก/ลากนิ้วเดียว = สร้าง<br>1–9 เลือกเครื่องมือ, 0 รื้อ, Esc ยกเลิก, Space หยุด',
    'help.mouse': 'ซ้าย (ลาก) = สร้าง<br>ขวา (ลาก) = หมุนกล้อง<br>ล้อเมาส์ = ซูม, ลูกศร = เลื่อน<br>1–9 เลือกเครื่องมือ, 0 รื้อ, Esc ยกเลิก, Space หยุด',
    'cam.left': 'หมุนซ้าย (Q)', 'cam.right': 'หมุนขวา (E)', 'cam.in': 'ซูมเข้า (+)', 'cam.out': 'ซูมออก (-)', 'cam.home': 'กลับมุมมองเริ่มต้น',
    'live': 'รถ {car} · คน {person} · หมา {dog} · แมว {cat}',
    'btn.menu': 'เมนูหลัก', 'btn.reset': 'เริ่มเมืองนี้ใหม่', 'btn.sideTab': 'เก็บ/แสดงแผงข้าง', 'btn.toolTab': 'เก็บ/แสดงแถบเครื่องมือ',
    'ui.hide': 'ซ่อน UI (H)', 'ui.show': 'แสดง UI (H)',
    'speed.pause': 'หยุด',
    // ข้อความแจ้ง
    'toast.nomoney': 'เงินไม่พอ', 'toast.water': 'สร้างบนน้ำไม่ได้ (ทำได้แค่สะพาน)', 'toast.road': 'อาคารนี้ต้องตั้งติดถนน',
    'toast.nearwater': 'โรงประปาต้องอยู่ใกล้น้ำ (แม่น้ำ/ทะเล/ทะเลสาบ ภายใน 3 ช่อง)', 'toast.saved': 'บันทึกแล้ว',
    'confirm.reset': 'เริ่มเมืองนี้ใหม่? ข้อมูลเมืองนี้จะหายทั้งหมด',
    // เมนู
    'menu.tagline': 'สร้างเมืองของคุณเอง', 'menu.continue': 'เล่นต่อ', 'menu.new': 'เกมใหม่', 'menu.load': 'โหลดเกม', 'menu.settings': 'ตั้งค่า',
    'menu.back': 'ย้อนกลับ', 'menu.resume': 'กลับเข้าเกม', 'menu.footer': 'เซฟเก็บในเครื่องของคุณเท่านั้น (เบราว์เซอร์นี้)',
    'new.title': 'เลือกแผนที่', 'new.name': 'ชื่อเมือง', 'new.start': 'เริ่มสร้างเมือง', 'new.defaultName': 'เมือง {n}',
    'map.river': 'แม่น้ำคดเคี้ยว', 'map.river.desc': 'แม่น้ำไหลผ่านกลางที่ราบ ล้อมด้วยภูเขา มีเรือแล่น ทะเลอยู่ไกลๆ',
    'map.coast': 'เมืองชายฝั่ง', 'map.coast.desc': 'หาดทรายและทะเลทางตะวันออก ที่ราบกว้างทางตะวันตก',
    'map.lake': 'ทะเลสาบกลางหุบเขา', 'map.lake.desc': 'ทะเลสาบใหญ่ใกล้ใจกลางเมือง เนินเขาโอบล้อม',
    'map.island': 'เกาะ', 'map.island.desc': 'เมืองบนเกาะกลางทะเล ใช้สะพานเชื่อมไม่ได้ ต้องวางแผนดีๆ',
    'load.title': 'โหลดเกม', 'load.empty': 'ยังไม่มีเมืองที่เซฟไว้', 'load.play': 'เล่น', 'load.rename': 'ชื่อ', 'load.delete': 'ลบ',
    'load.renamePrompt': 'ตั้งชื่อใหม่', 'load.deleteConfirm': 'ลบเมือง “{name}” ถาวร? ย้อนกลับไม่ได้', 'load.dup': 'คัดลอก',
    'load.info': 'วันที่ {day} · {pop} คน · ${money}', 'load.updated': 'เล่นล่าสุด {t}',
    'set.title': 'ตั้งค่า', 'set.language': 'ภาษา', 'set.sound': 'เสียง', 'set.master': 'เสียงรวม', 'set.sfx': 'เสียงในเกม', 'set.music': 'ดนตรี',
    'set.graphics': 'กราฟิก', 'set.mute': 'ปิดเสียง',
    'about': 'Mini City 3D · สร้างด้วย Three.js',
    'daylen': '1 วันในเกม = 5 นาที',
  },
  en: {
    'app.title': 'Mini City 3D',
    'tool.select': 'View', 'tool.road': 'Road', 'tool.res': 'Residential', 'tool.com': 'Commercial', 'tool.ind': 'Industrial',
    'tool.power': 'Power', 'tool.water': 'Water', 'tool.park': 'Park', 'tool.service': 'Services', 'tool.bulldoze': 'Bulldoze',
    'tip.select': 'Look around, build nothing',
    'tip.road': 'Road (over water = bridge $40). Junctions get traffic lights and zebra crossings automatically',
    'tip.ind': 'Industrial zone', 'tip.park': 'Public park: people stroll, nearby housing grows faster',
    'tip.bulldoze': 'Demolish',
    'free': 'Free',
    'v.res.zone': 'Housing zone (auto-grows)', 'v.res.zone.note': 'Small houses grow into condos with demand',
    'v.res.house': 'House', 'v.res.twin': 'Townhouses', 'v.res.apt': 'Apartments', 'v.res.condo': 'Condo tower',
    'v.com.zone': 'Commercial zone (auto-grows)', 'v.com.zone.note': 'Shops and offices that grow with demand',
    'v.com.seven': '7-Eleven', 'v.com.seven.note': 'Convenience store', 'v.com.cj': 'CJ', 'v.com.cj.note': 'Convenience store',
    'v.com.kfc': 'KFC', 'v.com.kfc.note': 'Fast food', 'v.com.gas': 'Gas station',
    'v.com.lotus': 'Lotus’s', 'v.com.lotus.note': 'Supermarket', 'v.com.mall': 'Shopping mall',
    'v.power.solar': 'Solar farm (small)', 'v.power.gas': 'Gas plant (medium)', 'v.power.thermal': 'Large power station',
    'v.water.pump': 'Pumping station (small)', 'v.water.plant': 'Water plant (medium)', 'v.water.big': 'Large water plant',
    'v.service.school': 'School', 'v.service.school.note': 'Nearby housing grows faster',
    'v.service.hospital': 'Hospital', 'v.service.hospital.note': 'Nearby housing grows faster',
    'v.service.bu': 'Bangkok University', 'v.service.bu.note': 'University campus (stylised model)', 'sign.bu': 'BANGKOK UNIVERSITY',
    'tip.power': 'Power plants in several sizes (hover to choose)', 'tip.water': 'Water plants in several sizes. Must be within 3 tiles of a river, sea or lake',
    'tip.res': 'Hover to choose a housing type', 'tip.com': 'Hover to choose a shop type', 'tip.service': 'School / hospital: provide jobs and boost nearby housing',
    'st.pop': 'Houses {n} people', 'st.jobs': 'Jobs {n}', 'st.cap': 'Produces {n}', 'st.use': 'Uses power {p} · water {w}', 'st.upkeep': 'Upkeep ${n}/day',
    'sign.gas': 'FUEL', 'sign.lotus': 'Lotus’s', 'sign.mall': 'DEPARTMENT STORE', 'sign.school': 'SCHOOL', 'sign.hospital': 'HOSPITAL', 'sign.road': 'Rd.',
    'hud.money': 'Money', 'hud.pop': 'Population', 'hud.jobs': 'Jobs', 'hud.power': 'Power', 'hud.water': 'Water', 'hud.net': 'Net income/day', 'hud.day': 'Day',
    'hud.powerTip': 'Power used / produced', 'hud.waterTip': 'Water used / produced', 'hud.demandTip': 'Demand: R=Residential C=Commercial I=Industrial',
    'wind': 'Wind {n} km/h',
    'wx.clear': 'Clear', 'wx.cloudy': 'Cloudy', 'wx.rain': 'Rain', 'wx.storm': 'Thunderstorm',
    'side.graphics': 'Graphics', 'side.weather': 'Weather', 'side.control': 'Controls',
    'q.low': 'Low', 'q.med': 'Medium', 'q.high': 'High',
    'q.low.desc': 'Lightest: no shadows, few cars. For slow machines',
    'q.med.desc': 'Balanced: soft shadows, traffic lights, signs, rain, forests, cars, people and pets',
    'q.high.desc': 'Most realistic: detailed shadows, night glow, heavy rain, full forests, lots of cars, people, dogs and cats',
    'w.auto': 'Automatic', 'w.clear': 'Clear', 'w.cloudy': 'Cloudy', 'w.rain': 'Rain', 'w.storm': 'Thunderstorm',
    'm.trackpad': 'Trackpad', 'm.mouse': 'Mouse',
    'help.trackpad': 'Two-finger drag = pan<br>Pinch = zoom<br>Alt/Option + two-finger drag = rotate<br>Click / one-finger drag = build<br>1–9 select tool, 0 bulldoze, Esc cancel, Space pause',
    'help.mouse': 'Left drag = build<br>Right drag = rotate camera<br>Wheel = zoom, arrow keys = pan<br>1–9 select tool, 0 bulldoze, Esc cancel, Space pause',
    'cam.left': 'Rotate left (Q)', 'cam.right': 'Rotate right (E)', 'cam.in': 'Zoom in (+)', 'cam.out': 'Zoom out (-)', 'cam.home': 'Reset view',
    'live': 'Cars {car} · People {person} · Dogs {dog} · Cats {cat}',
    'btn.menu': 'Main menu', 'btn.reset': 'Restart this city', 'btn.sideTab': 'Toggle side panel', 'btn.toolTab': 'Toggle toolbar',
    'ui.hide': 'Hide UI (H)', 'ui.show': 'Show UI (H)',
    'speed.pause': 'Pause',
    'toast.nomoney': 'Not enough money', 'toast.water': 'Can’t build on water (bridges only)', 'toast.road': 'This building must be next to a road',
    'toast.nearwater': 'Water plants must be near water (river/sea/lake within 3 tiles)', 'toast.saved': 'Saved',
    'confirm.reset': 'Restart this city? All progress in it will be lost.',
    'menu.tagline': 'Build your own city', 'menu.continue': 'Continue', 'menu.new': 'New game', 'menu.load': 'Load game', 'menu.settings': 'Settings',
    'menu.back': 'Back', 'menu.resume': 'Back to game', 'menu.footer': 'Saves are stored only on your device (this browser)',
    'new.title': 'Choose a map', 'new.name': 'City name', 'new.start': 'Start building', 'new.defaultName': 'City {n}',
    'map.river': 'Winding River', 'map.river.desc': 'A river crosses the plain, ringed by mountains, with boats. The sea lies far off',
    'map.coast': 'Coastal City', 'map.coast.desc': 'Beach and sea to the east, wide plains to the west',
    'map.lake': 'Valley Lake', 'map.lake.desc': 'A big lake near downtown, surrounded by hills',
    'map.island': 'Island', 'map.island.desc': 'A city on an island in the sea. No way to expand across water, so plan carefully',
    'load.title': 'Load game', 'load.empty': 'No saved cities yet', 'load.play': 'Play', 'load.rename': 'Rename', 'load.delete': 'Delete',
    'load.renamePrompt': 'New name', 'load.deleteConfirm': 'Permanently delete “{name}”? This cannot be undone.', 'load.dup': 'Copy',
    'load.info': 'Day {day} · {pop} people · ${money}', 'load.updated': 'Last played {t}',
    'set.title': 'Settings', 'set.language': 'Language', 'set.sound': 'Sound', 'set.master': 'Master', 'set.sfx': 'Game sounds', 'set.music': 'Music',
    'set.graphics': 'Graphics', 'set.mute': 'Mute',
    'about': 'Mini City 3D · built with Three.js',
    'daylen': '1 in-game day = 5 minutes',
  },
  zh: {
    'app.title': 'Mini City 3D',
    'tool.select': '浏览', 'tool.road': '道路', 'tool.res': '住宅', 'tool.com': '商业', 'tool.ind': '工业',
    'tool.power': '发电厂', 'tool.water': '水厂', 'tool.park': '公园', 'tool.service': '公共服务', 'tool.bulldoze': '拆除',
    'tip.select': '只浏览，不建造',
    'tip.road': '道路（水上＝桥梁 $40）。路口自动设置红绿灯和斑马线',
    'tip.ind': '工业区', 'tip.park': '公共公园：市民散步，周围住宅发展更快',
    'tip.bulldoze': '拆除',
    'free': '免费',
    'v.res.zone': '住宅区（自动发展）', 'v.res.zone.note': '小房子会随需求发展成公寓楼',
    'v.res.house': '独栋住宅', 'v.res.twin': '联排住宅', 'v.res.apt': '公寓', 'v.res.condo': '高层公寓',
    'v.com.zone': '商业区（自动发展）', 'v.com.zone.note': '商店和写字楼随需求发展',
    'v.com.seven': '7-Eleven', 'v.com.seven.note': '便利店', 'v.com.cj': 'CJ', 'v.com.cj.note': '便利店',
    'v.com.kfc': 'KFC', 'v.com.kfc.note': '快餐店', 'v.com.gas': '加油站',
    'v.com.lotus': 'Lotus’s 莲花', 'v.com.lotus.note': '超市', 'v.com.mall': '购物中心',
    'v.power.solar': '太阳能电站（小）', 'v.power.gas': '燃气电厂（中）', 'v.power.thermal': '大型电厂',
    'v.water.pump': '抽水站（小）', 'v.water.plant': '水厂（中）', 'v.water.big': '大型水厂',
    'v.service.school': '学校', 'v.service.school.note': '周围住宅发展更快',
    'v.service.hospital': '医院', 'v.service.hospital.note': '周围住宅发展更快',
    'v.service.bu': '曼谷大学', 'v.service.bu.note': '大学校园（风格化模型）', 'sign.bu': '曼谷大学',
    'tip.power': '多种规模的发电厂（鼠标悬停选择）', 'tip.water': '多种规模的水厂，须在河流/海/湖 3 格以内',
    'tip.res': '悬停选择住宅类型', 'tip.com': '悬停选择商店类型', 'tip.service': '学校/医院：提供就业并促进周围住宅发展',
    'st.pop': '可住 {n} 人', 'st.jobs': '岗位 {n}', 'st.cap': '产量 {n}', 'st.use': '耗电 {p} · 耗水 {w}', 'st.upkeep': '维护 ${n}/天',
    'sign.gas': '加油站', 'sign.lotus': '莲花', 'sign.mall': '百货商场', 'sign.school': '学校', 'sign.hospital': '医院', 'sign.road': '路',
    'hud.money': '资金', 'hud.pop': '人口', 'hud.jobs': '就业', 'hud.power': '电力', 'hud.water': '自来水', 'hud.net': '每日净收入', 'hud.day': '第几天',
    'hud.powerTip': '电力 用量/产量', 'hud.waterTip': '自来水 用量/产量', 'hud.demandTip': '需求：R＝住宅 C＝商业 I＝工业',
    'wind': '风速 {n} 公里/时',
    'wx.clear': '晴朗', 'wx.cloudy': '多云', 'wx.rain': '下雨', 'wx.storm': '雷暴雨',
    'side.graphics': '画质', 'side.weather': '天气', 'side.control': '操作',
    'q.low': '低', 'q.med': '中', 'q.high': '高',
    'q.low.desc': '最流畅：无阴影，车辆很少，适合配置较低的设备',
    'q.med.desc': '均衡：柔和阴影、红绿灯、路牌、雨、森林、适量车辆行人和宠物',
    'q.high.desc': '最逼真：精细阴影、夜间光晕、大雨、满山森林、大量车辆、行人、狗和猫',
    'w.auto': '自动', 'w.clear': '晴朗', 'w.cloudy': '多云', 'w.rain': '下雨', 'w.storm': '雷暴雨',
    'm.trackpad': '触控板', 'm.mouse': '鼠标',
    'help.trackpad': '双指拖动＝平移<br>捏合＝缩放<br>Alt/Option＋双指拖动＝旋转<br>单击/单指拖动＝建造<br>1–9 选择工具，0 拆除，Esc 取消，空格 暂停',
    'help.mouse': '左键拖动＝建造<br>右键拖动＝旋转视角<br>滚轮＝缩放，方向键＝平移<br>1–9 选择工具，0 拆除，Esc 取消，空格 暂停',
    'cam.left': '向左旋转 (Q)', 'cam.right': '向右旋转 (E)', 'cam.in': '放大 (+)', 'cam.out': '缩小 (-)', 'cam.home': '重置视角',
    'live': '车 {car} · 人 {person} · 狗 {dog} · 猫 {cat}',
    'btn.menu': '主菜单', 'btn.reset': '重新开始此城市', 'btn.sideTab': '收起/展开侧栏', 'btn.toolTab': '收起/展开工具栏',
    'ui.hide': '隐藏界面 (H)', 'ui.show': '显示界面 (H)',
    'speed.pause': '暂停',
    'toast.nomoney': '资金不足', 'toast.water': '不能在水上建造（只能建桥）', 'toast.road': '此建筑必须靠近道路',
    'toast.nearwater': '水厂必须靠近水源（河/海/湖 3 格以内）', 'toast.saved': '已保存',
    'confirm.reset': '重新开始此城市？该城市的所有进度将丢失。',
    'menu.tagline': '建造属于你的城市', 'menu.continue': '继续游戏', 'menu.new': '新游戏', 'menu.load': '读取存档', 'menu.settings': '设置',
    'menu.back': '返回', 'menu.resume': '回到游戏', 'menu.footer': '存档仅保存在你的设备上（此浏览器）',
    'new.title': '选择地图', 'new.name': '城市名称', 'new.start': '开始建城', 'new.defaultName': '城市 {n}',
    'map.river': '蜿蜒河流', 'map.river.desc': '河流穿过平原，群山环绕，河上有船。大海在远方',
    'map.coast': '海滨城市', 'map.coast.desc': '东面是沙滩和大海，西面是广阔平原',
    'map.lake': '山谷湖泊', 'map.lake.desc': '市中心附近有一个大湖，四周丘陵环绕',
    'map.island': '海岛', 'map.island.desc': '海中孤岛上的城市，无法跨海扩张，需要精心规划',
    'load.title': '读取存档', 'load.empty': '还没有存档', 'load.play': '进入', 'load.rename': '改名', 'load.delete': '删除',
    'load.renamePrompt': '新名称', 'load.deleteConfirm': '永久删除“{name}”？此操作无法撤销。', 'load.dup': '复制',
    'load.info': '第 {day} 天 · {pop} 人 · ${money}', 'load.updated': '上次游玩 {t}',
    'set.title': '设置', 'set.language': '语言', 'set.sound': '声音', 'set.master': '总音量', 'set.sfx': '游戏音效', 'set.music': '音乐',
    'set.graphics': '画质', 'set.mute': '静音',
    'about': 'Mini City 3D · 使用 Three.js 制作',
    'daylen': '游戏内 1 天 ＝ 5 分钟',
  },
};

let lang = 'th';
const listeners = [];

export function getLang() { return lang; }
export function setLang(l) {
  if (!D[l]) l = 'th';
  lang = l;
  try { document.documentElement.lang = l; } catch {}
  applyDOM(document);
  listeners.forEach(f => f(l));
}
export function onLang(f) { listeners.push(f); }
export function t(key, p) {
  let s = D[lang][key] ?? D.th[key] ?? key;
  if (p) for (const k in p) s = s.replaceAll('{' + k + '}', p[k]);
  return s;
}
export function hasKey(key) { return key in D.th; }

export function applyDOM(root) {
  root.querySelectorAll?.('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll?.('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll?.('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
}
