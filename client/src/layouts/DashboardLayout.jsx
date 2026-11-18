import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/api';

export default function DashboardLayout() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await api.post('/auth/logout');
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <aside className="w-72 bg-slate-900 text-white shrink-0 flex flex-col">
        <div className="p-6 flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary-600 flex items-center justify-center font-bold text-white">S</div>
          <span className="font-semibold text-lg tracking-tight">SchoolMgmt</span>
        </div>
        <div className="px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">
          {user?.role}
        </div>
        <nav className="flex-1 px-3 space-y-1">
          <Link to="/superadmin" className={({ isActive }) => `block px-3 py-3 rounded-md text-sm font-medium transition ${isActive ? 'bg-slate-800 text-primary-300' : 'text-slate-300 hover:bg-slate-800'}`}>
            Schools
          </Link>
          <Link to="/superadmin/audit-logs" className={({ isActive }) => `block px-3 py-3 rounded-md text-sm font-medium transition ${isActive ? 'bg-slate-800 text-primary-300' : 'text-slate-300 hover:bg-slate-800'}`}>
            Audit Logs
          </Link>
        </nav>
        <div className="p-4 border-t border-slate-700">
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 text-sm font-medium text-red-200 hover:bg-red-900/30 rounded-md transition"
          >
            Sign out
          </button>
          <button
            onClick={refresh}
            className="mt-2 w-full px-3 py-2 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            Refresh session
          </button>
        </div>
      </aside>
      <div className="flex-1 overflow-auto bg-slate-50 p-6">
        <Outlet />
      </div>
    </div>
  );
}
