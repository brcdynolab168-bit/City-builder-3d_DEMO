import { defineConfig } from 'vite';

// รหัสเวอร์ชันของการ build ครั้งนี้: ฝังในเกม (__BUILD_ID__) และเขียนลง version.json คู่กัน
// เกมจะเช็ค version.json บนเว็บเป็นระยะ ถ้าไม่ตรงกับของตัวเอง = มีเวอร์ชันใหม่ขึ้นแล้ว แจ้งให้กดรีเฟรช
const BUILD_ID = Date.now().toString(36);

// base './' ทำให้เปิดได้ทั้งบน GitHub Pages (https://user.github.io/repo/) และรันในเครื่อง
// พอร์ต 8080 ตรงกับ .vscode/launch.json (กด F5 เปิด Chrome ได้เลย)
export default defineConfig({
  base: './',
  server: { port: 8080, strictPort: true },
  assetsInclude: ['**/*.glb'],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [{
    name: 'version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID, at: new Date().toISOString() }) });
    },
  }],
});
