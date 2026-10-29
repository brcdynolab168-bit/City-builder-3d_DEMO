import { defineConfig } from 'vite';

// base './' ทำให้เปิดได้ทั้งบน GitHub Pages (https://user.github.io/repo/) และรันในเครื่อง
// พอร์ต 8080 ตรงกับ .vscode/launch.json (กด F5 เปิด Chrome ได้เลย)
export default defineConfig({
  base: './',
  server: { port: 8080, strictPort: true },
  assetsInclude: ['**/*.glb'],
});
