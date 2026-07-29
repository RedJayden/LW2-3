/**
 * @file main.tsx
 * @brief React 
 *
 * CEF:
 * - StyledEngineProvider injectFirst: Tailwind  MUI CSS
 * - createHashRouter: CEF file://
 */
import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createHashRouter } from "react-router-dom";
import { StyledEngineProvider } from "@mui/material/styles";
import { MantineProvider, createTheme } from '@mantine/core';
import "@mantine/core/styles.css";
import "./index.css";

import { CustomThemeProvider } from "./ui/hooks/useTheme";
import SplashPage from "./ui/pages/Splash"; // 정적 임포트로 변경 (초기 로드 속도 향상)

const AppShell = lazy(() => import("./ui/shell/AppShell"));
const MainPage = lazy(() => import("./ui/pages/Main"));
const RecipePage = lazy(() => import("./ui/pages/Recipe"));
const ParameterPage = lazy(() => import("./ui/pages/Parameter"));
const CalibrationPage = lazy(() => import("./ui/pages/Calibration"));

/**
 * @brief 라우트 전환 시 청크 로딩 중 표시할 폴백 UI.
 * 배경색을 앱 테마와 동일하게 유지하여 검은 화면 깜박임을 방지합니다.
 */
const LoadingFallback = () => (
  <div style={{
    display: 'flex',
    width: '100vw',
    height: '100vh',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827'
  }}>
    <div style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.15)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

const router = createHashRouter([
  {
    path: "/",
    element: <SplashPage />
  },
  {
    path: "/splash",
    element: <SplashPage />
  },
  {
    path: "/",
    element: (
      <Suspense fallback={<LoadingFallback />}>
        <AppShell />
      </Suspense>
    ),
    children: [
      { path: "main", element: <MainPage /> },
      { path: "recipe", element: <RecipePage /> },
      { path: "parameter", element: <ParameterPage /> },
      { path: "calibration", element: <CalibrationPage /> },
    ],
  },
  { path: "*", element: <SplashPage /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider defaultColorScheme="dark">
    <StyledEngineProvider injectFirst>
      <CustomThemeProvider>
        <RouterProvider router={router} />
      </CustomThemeProvider>
    </StyledEngineProvider>
  </MantineProvider>
);
