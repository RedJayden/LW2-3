import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { CircularProgress } from "@mui/material";

import AppShell from "./ui/shell/AppShell";

// Lazy-load pages to split chunks
const SplashPage = lazy(() => import("./ui/pages/Splash"));
const MainPage = lazy(() => import("./ui/pages/Main"));
const RecipePage = lazy(() => import("./ui/pages/Recipe"));
const ParameterPage = lazy(() => import("./ui/pages/Parameter"));
const CalibrationPage = lazy(() => import("./ui/pages/Calibration"));
const SemiconCommandPage = lazy(() => import("./ui/pages/SemiconCommand/SemiconCommandPage"));
const DashboardPage = lazy(() => import("./ui/pages/Dashboard/DashboardPage"));

const LoadingFallback = () => (
  <div style={{
    display: 'flex',
    width: '100vw',
    height: '100vh',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000'
  }}>
    <CircularProgress color="primary" />
  </div>
);

export default function AppRouter() {
  return (
    <HashRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* 최상위 레이아웃 */}
          <Route path="/" element={<AppShell />}>
            {/* 기본 진입을 splash로 */}
            <Route index element={<SplashPage />} />
            <Route path="splash" element={<SplashPage />} />
            <Route path="main" element={<MainPage />} />
            <Route path="recipe" element={<RecipePage />} />
            <Route path="parameter" element={<ParameterPage />} />
            <Route path="calibration" element={<CalibrationPage />} />
            <Route path="semicon" element={<SemiconCommandPage />} />
            <Route path="dashboard" element={<DashboardPage />} />

            {/* 안전망: 알 수 없는 경로는 splash로 */}
            <Route path="*" element={<Navigate to="/splash" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
