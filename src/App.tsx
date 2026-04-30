import { useEffect, Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useStore } from '@/store';
import { useTheme } from '@/hooks/useTheme';
import { AppLayout } from '@/components/Layout/AppLayout';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail'));
const GanttPage = lazy(() => import('@/pages/GanttPage'));
const TimelinePage = lazy(() => import('@/pages/TimelinePage'));
const WorkloadPage = lazy(() => import('@/pages/WorkloadPage'));
const BurnoutPage = lazy(() => import('@/pages/BurnoutPage'));
const UsersPage = lazy(() => import('@/pages/UsersPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));

function LoadingFallback() {
  return <div style={{ padding: '32px', color: 'var(--color-text-muted)' }}>Loading…</div>;
}

export default function App() {
  const loadData = useStore((s) => s.loadData);
  useTheme();

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <AppLayout>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/gantt" element={<GanttPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/workload" element={<WorkloadPage />} />
          <Route path="/burnout" element={<BurnoutPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}
