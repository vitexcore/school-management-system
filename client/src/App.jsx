import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import SchoolLayout from './layouts/SchoolLayout';
import DashboardPage from './pages/DashboardPage';
import AcademicYearsPage from './pages/AcademicYearsPage';
import TermsPage from './pages/TermsPage';
import ClassesPage from './pages/ClassesPage';
import SubjectsPage from './pages/SubjectsPage';
import TeachersPage from './pages/TeachersPage';
import StudentsPage from './pages/StudentsPage';
import StudentCreatePage from './pages/StudentCreatePage';
import StudentEditPage from './pages/StudentEditPage';
import AssessmentsPage from './pages/AssessmentsPage';
import ResultsPage from './pages/ResultsPage';
import SettingsPage from './pages/SettingsPage';
import OperationsPage from './pages/OperationsPage';
import SuperadminPage from './pages/SuperadminPage';

const RequireAdmin = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user || user.role !== 'ADMIN') return <Navigate to={user?.role === 'SUPERADMIN' ? '/platform' : '/login'} replace />;
  return children;
};

const RequireSuperadmin = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user || user.role !== 'SUPERADMIN') return <Navigate to={user?.role === 'ADMIN' ? '/school' : '/login'} replace />;
  return children;
};

export default function App() {
  const { loading } = useAuth();
  if (loading) return null;
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/platform/*" element={<RequireSuperadmin><SuperadminPage /></RequireSuperadmin>} />
        <Route path="/school" element={
          <RequireAdmin><SchoolLayout /></RequireAdmin>
        }>
          <Route index element={<DashboardPage />} />
          <Route path="academic-years" element={<RequireAdmin><AcademicYearsPage /></RequireAdmin>} />
          <Route path="terms" element={<RequireAdmin><TermsPage /></RequireAdmin>} />
          <Route path="classes" element={<RequireAdmin><ClassesPage /></RequireAdmin>} />
          <Route path="subjects" element={<RequireAdmin><SubjectsPage /></RequireAdmin>} />
          <Route path="teachers" element={<RequireAdmin><TeachersPage /></RequireAdmin>} />
          <Route path="students" element={<RequireAdmin><StudentsPage /></RequireAdmin>} />
          <Route path="students/create" element={<RequireAdmin><StudentCreatePage /></RequireAdmin>} />
          <Route path="students/:id" element={<RequireAdmin><StudentEditPage /></RequireAdmin>} />
          <Route path="assessments" element={<RequireAdmin><AssessmentsPage /></RequireAdmin>} />
          <Route path="results" element={<RequireAdmin><ResultsPage /></RequireAdmin>} />
          <Route path="settings" element={<RequireAdmin><SettingsPage /></RequireAdmin>} />
          <Route path="attendance" element={<RequireAdmin><OperationsPage /></RequireAdmin>} />
          <Route path="fee-items" element={<RequireAdmin><OperationsPage /></RequireAdmin>} />
          <Route path="invoices" element={<RequireAdmin><OperationsPage /></RequireAdmin>} />
          <Route path="payments" element={<RequireAdmin><OperationsPage /></RequireAdmin>} />
          <Route path="debtors" element={<RequireAdmin><OperationsPage /></RequireAdmin>} />
          <Route path="fee-summary" element={<RequireAdmin><OperationsPage /></RequireAdmin>} />
          <Route path="report-cards" element={<RequireAdmin><OperationsPage /></RequireAdmin>} />
          <Route path="timetable" element={<RequireAdmin><OperationsPage /></RequireAdmin>} />
          <Route path="announcements" element={<RequireAdmin><OperationsPage /></RequireAdmin>} />
        </Route>
        <Route path="*" element={<Navigate to="/school" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
