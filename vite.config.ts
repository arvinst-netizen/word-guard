import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Web 版打包成单个 HTML，便于直接分享和发布。
// 以后接 Capacitor（iOS/Android）或小游戏平台时，另加构建目标即可，核心代码不动。
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 3000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
