import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useState } from 'react';
import { api } from '../api/api';
import { Button, Badge } from '../components/ui';

export default function SchoolLayout() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchError, setSearchError] = useState('');

  const handleLogout = async () => {
    await api.post('/auth/logout');
    navigate('/login');
  };

  const search = async (event) => {
    event.preventDefault();
    if (!query.trim()) return;
    const result = await api.get(`/school/search?q=${encodeURIComponent(query.trim())}`);
    if (!result.ok) { setSearchError(result.data?.error || 'Search failed.'); setSearchResults(null); return; }
    setSearchError('');
    setSearchResults(result.data?.data || result.data);
  };

  const links = [
    { to: '/school', label: 'Dashboard' },
    { to: '/school/academic-years', label: 'Academic Years' },
    { to: '/school/terms', label: 'Terms' },
    { to: '/school/classes', label: 'Classes' },
    { to: '/school/subjects', label: 'Subjects' },
    { to: '/school/teachers', label: 'Teachers' },
    { to: '/school/students', label: 'Students' },
    { to: '/school/attendance', label: 'Attendance' },
    { to: '/school/results', label: 'Results' },
    { to: '/school/fee-items', label: 'Fee items' },
    { to: '/school/invoices', label: 'Invoices' },
    { to: '/school/payments', label: 'Payments' },
    { to: '/school/debtors', label: 'Debtors' },
    { to: '/school/fee-summary', label: 'Fee summary' },
    { to: '/school/report-cards', label: 'Report cards' },
    { to: '/school/timetable', label: 'Timetable' },
    { to: '/school/announcements', label: 'Announcements' },
    { to: '/school/settings', label: 'Settings' }
  ];

  return (
    <div className="flex h-screen bg-slate-50 max-md:h-auto max-md:min-h-screen max-md:flex-col">
      <aside className="flex w-72 shrink-0 flex-col bg-slate-900 text-white max-md:max-h-48 max-md:w-full">
        <div className="p-6 flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary-600 flex items-center justify-center font-bold text-white">S</div>
          <span className="font-semibold text-lg tracking-tight">SchoolMgmt</span>
        </div>
        <div className="px-4 py-2 text-xs text-slate-400 uppercase tracking-wider">{user?.role}</div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 max-md:flex max-md:gap-1 max-md:overflow-x-auto max-md:overflow-y-hidden max-md:space-y-0">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `block px-3 py-3 rounded-md text-sm font-medium transition ${
              isActive ? 'bg-slate-800 text-primary-300' : 'text-slate-300 hover:bg-slate-800'
            } whitespace-nowrap`}>{l.label}</NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-700">
          <button onClick={handleLogout} className="w-full px-3 py-2 text-sm font-medium text-red-200 hover:bg-red-900/30 rounded-md transition">Sign out</button>
          <button onClick={refresh} className="mt-2 w-full px-3 py-2 text-xs text-slate-400 hover:text-slate-200 transition">Refresh session</button>
        </div>
      </aside>
      <div className="min-w-0 flex-1 overflow-auto bg-slate-50 p-4 md:p-6">
        <form onSubmit={search} role="search" className="relative mx-auto mb-5 max-w-2xl">
          <label htmlFor="global-search" className="sr-only">Search students and teachers</label>
          <input id="global-search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setSearchResults(null); }} placeholder="Search students and teachers" className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 pr-24 focus:outline-2 focus:outline-blue-600" />
          <button type="submit" className="absolute right-2 top-1.5 rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white focus:outline-2 focus:outline-blue-600">Search</button>
          {(searchResults || searchError) && <div className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-slate-200 bg-white p-3 shadow-lg" aria-live="polite">
            {searchError && <p role="alert" className="text-sm text-red-700">{searchError}</p>}
            {['students', 'teachers'].map((kind) => <section key={kind}><h2 className="mt-2 text-xs font-semibold uppercase text-slate-500">{kind}</h2>{(searchResults?.[kind] || []).map((item) => <button type="button" key={item.id} onClick={() => { navigate(kind === 'students' ? `/school/students/${item.id}` : '/school/teachers'); setSearchResults(null); }} className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-slate-100 focus:bg-slate-100">{kind === 'students' ? `${item.firstName} ${item.lastName} · ${item.admissionNumber}` : `${item.name} · ${item.email || item.staffId || ''}`}</button>)}</section>)}
            {searchResults && !(searchResults.students?.length || searchResults.teachers?.length) && <p className="py-2 text-sm text-slate-500">No matching students or teachers.</p>}
            <button type="button" onClick={() => setSearchResults(null)} className="mt-2 text-xs text-blue-700 underline">Close results</button>
          </div>}
        </form>
        <Outlet />
      </div>
    </div>
  );
}
