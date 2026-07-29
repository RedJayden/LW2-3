/**
 * @file vite.config.ts
 * @brief CEF 환경 최적화 Vite 설정
 *
 * 디자인 패턴: Strategy (환경별 설정 분기)
 *
 * CEF 환경에서 중요한 설정:
 * - resolve.tsconfigPaths: tsconfig 경로 별칭 자동 인식
 * - server.cors: CEF 로딩 시 CORS 문제 방지
 * - server.hmr: WebSocket 프로토콜/호스트 명시 (CEF ws 제한 대응)
 * - build.target: CEF Chromium 버전에 맞춘 빌드 타겟
 * - optimizeDeps: 사전 번들링으로 dev 서버 안정성 향상
 */
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const isDev = mode === "development";
  const isProd = mode === "production";

  return {
    plugins: [react()],

    resolve: {
      tsconfigPaths: true,
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },

    // CEF에서 file:// 경로로 로드하므로 base="./" 유지
    base: "./",

    server: {
      port: 5173,
      strictPort: true,
      host: "0.0.0.0",
      open: false,
      cors: true,
      hmr: {
        protocol: "ws",
        host: "localhost",
      },
    },

    build: {
      outDir: "dist",
      target: "chrome114",
      sourcemap: isDev,
      minify: isProd ? "esbuild" : false,
      chunkSizeWarningLimit: 1000,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          // CEF/Browser 환경에서 로딩 성능을 위해 청크 분할 전략 수립
          manualChunks(id) {
            // React & Core Framework
            if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/react-router")) {
              return "vendor";
            }
            // Material UI & Emotion
            if (id.includes("node_modules/@mui") || id.includes("node_modules/@emotion")) {
              return "ui-framework";
            }
            // Heavy Graphics Libraries
            if (id.includes("node_modules/fabric") || id.includes("node_modules/paper")) {
              return "graphics-libs";
            }
            // Particle Effects (Preload 시 무거움)
            if (id.includes("node_modules/tsparticles") || id.includes("node_modules/react-tsparticles")) {
              return "particles";
            }
            // Other node_modules
            if (id.includes("node_modules")) {
              return "libs";
            }
          },
        },
      },
    },

    // CEF dev 서버 안정성: 주요 의존성 사전 번들링
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-router-dom",
        "@mui/material",
        "@mui/icons-material",
        "@emotion/react",
        "@emotion/styled",
        "zustand",
      ],
    },

    define: {
      __APP_HOST__: JSON.stringify(env.VITE_APP_HOST),
    },
  };
});
