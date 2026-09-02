import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin({ exclude: ["@xnovel/theme"] })] },
  // 沙箱 preload 只能以 CommonJS 执行，ESM 产物会直接加载失败
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: { plugins: [react()] },
});
