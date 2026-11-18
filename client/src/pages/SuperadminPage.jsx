import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api/api';
import { Button, Card } from '../components/ui';

const sections = [
  ['dashboard', 'Platform dashboard'], ['plans', 'Plans'], ['subscriptions', 'Subscriptions'], ['settings', 'System settings'], ['audit', 'Audit logs'],
];

export default function SuperadminPage() {
  const { pathname } = useLocation();
  const section = pathname.split('/')[2] || 'dashboard';
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({});
  const title = sections.find(([key]) => key === section)?.[1] || 'Platform dashboard';

  const load = useCallback(async () => {
    setError('');
    const path = section === 'dashboard' ? '/superadmin/dashboard'
      : section === 'plans' ? '/superadmin/plans'
        : section === 'subscriptions' ? '/superadmin/subscriptions'
          : section === 'settings' ? '/superadmin/system-settings'
            : '/superadmin/audit-logs';
    const result = await api.get(path);
    if (!result.ok) { setError(result.data?.error || 'Could not load data.'); return; }
    const payload = result.data?.data || {};
    setData(payload);
    setRows(payload.plans || payload.items || []);
  }, [section]);

  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    let path; let payload;
    if (section === 'plans') {
      path = '/superadmin/plans';
      payload = { name: form.name, maxStudents: Number(form.maxStudents), maxTeachers: Number(form.maxTeachers), priceMonthly: Number(form.priceMonthly), features: {} };
    } else if (section === 'subscriptions') {
      path = '/superadmin/subscriptions';
      payload = { schoolId: form.schoolId, planId: form.planId, status: 'ACTIVE', startsAt: new Date().toISOString(), endsAt: new Date(form.endsAt).toISOString() };
    } else {
      path = '/superadmin/system-settings';
      payload = { maintenanceMode: Boolean(form.maintenanceMode), gracePeriodDays: Number(form.gracePeriodDays), defaultPlanId: form.defaultPlanId || null };
    }
    const result = await api.post(path, payload);
    if (!result.ok && section === 'settings') {
      const updated = await api.patch(path, payload);
      if (!updated.ok) setError(updated.data?.error || 'Could not save settings.');
      else setNotice('Settings saved.');
    } else if (!result.ok) setError(result.data?.error || 'Could not save.');
    else setNotice('Saved successfully.');
    await load(); setBusy(false);
  };

  const saveSettings = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const result = await api.patch('/superadmin/system-settings', {
      maintenanceMode: Boolean(form.maintenanceMode ?? data?.settings?.maintenanceMode),
      gracePeriodDays: Number(form.gracePeriodDays ?? data?.settings?.gracePeriodDays ?? 7),
      defaultPlanId: form.defaultPlanId ?? data?.settings?.defaultPlanId ?? null,
    });
    if (!result.ok) setError(result.data?.error || 'Could not save settings.'); else setNotice('Settings saved.');
    await load(); setBusy(false);
  };

  return <div className="min-h-screen bg-slate-100 md:flex">
    <aside className="bg-slate-950 p-4 text-white md:min-h-screen md:w-64">
      <Link to="/platform" className="mb-5 block text-lg font-bold">Platform admin</Link>
      <nav className="flex gap-2 overflow-x-auto md:flex-col">{sections.map(([key, label]) => <NavLink key={key} to={`/platform/${key}`} className={({ isActive }) => `whitespace-nowrap rounded-md px-3 py-2 text-sm ${isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-900'}`}>{label}</NavLink>)}</nav>
    </aside>
    <main className="min-w-0 flex-1 space-y-5 p-4 md:p-8">
      <header className="flex items-center justify-between"><h1 className="text-2xl font-bold text-slate-900">{title}</h1><Button variant="outline" onClick={load}>Refresh</Button></header>
      {error && <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-red-800">{error}</div>}
      {notice && <div role="status" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">{notice}</div>}

      {section === 'dashboard' && data && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[['Schools', data.totalSchools], ['Active schools', data.activeSchools], ['Students', data.totalStudents], ['Monthly subscription revenue (kobo)', data.totalRevenue], ['School fee collections (kobo)', data.schoolCollections]].map(([label, value]) => <Card key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{Number(value || 0).toLocaleString()}</p></Card>)}</div>
        <Card><h2 className="mb-4 font-semibold">New schools by month</h2><div className="h-72" role="img" aria-label="Bar chart of new schools per month"><ResponsiveContainer width="100%" height="100%"><BarChart data={(data.newSchoolsPerMonth || []).map((item) => ({ ...item, month: new Date(item.month).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) }))}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="month"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="count" fill="#2563eb"/></BarChart></ResponsiveContainer></div></Card>
      </>}

      {section === 'plans' && <><Card><h2 className="mb-4 font-semibold">Add plan</h2><form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['name','Plan name','text'],['maxStudents','Student limit','number'],['maxTeachers','Teacher limit','number'],['priceMonthly','Monthly price (kobo)','number']].map(([key,label,type]) => <label key={key} className="text-sm">{label}<input required type={type} min={type === 'number' ? 0 : undefined} step="1" value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="mt-1 w-full rounded border p-2"/></label>)}<Button disabled={busy}>Create plan</Button></form></Card><RecordTable rows={rows}/></>}

      {section === 'subscriptions' && <><Card><h2 className="mb-4 font-semibold">Assign a subscription</h2><form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><label className="text-sm">School ID<input required value={form.schoolId || ''} onChange={(e) => setForm({ ...form, schoolId: e.target.value })} className="mt-1 w-full rounded border p-2"/></label><label className="text-sm">Plan ID<input required value={form.planId || ''} onChange={(e) => setForm({ ...form, planId: e.target.value })} className="mt-1 w-full rounded border p-2"/></label><label className="text-sm">Ends at<input required type="date" value={form.endsAt || ''} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="mt-1 w-full rounded border p-2"/></label><Button disabled={busy}>Assign plan</Button></form></Card><RecordTable rows={rows}/></>}

      {section === 'settings' && <Card><form onSubmit={saveSettings} className="max-w-xl space-y-4"><label className="flex items-center gap-3"><input type="checkbox" checked={Boolean(form.maintenanceMode ?? data?.settings?.maintenanceMode)} onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })}/> Maintenance mode</label><label className="block text-sm">Subscription grace period (days)<input type="number" min="0" max="90" value={form.gracePeriodDays ?? data?.settings?.gracePeriodDays ?? 7} onChange={(e) => setForm({ ...form, gracePeriodDays: e.target.value })} className="mt-1 w-full rounded border p-2"/></label><label className="block text-sm">Default plan ID<input value={form.defaultPlanId ?? data?.settings?.defaultPlanId ?? ''} onChange={(e) => setForm({ ...form, defaultPlanId: e.target.value })} className="mt-1 w-full rounded border p-2"/></label><Button disabled={busy}>Save settings</Button></form></Card>}

      {section === 'audit' && <><Card><p className="text-sm text-slate-600">Audit events are filterable by school, user, action, and date in the API. CSV export is available from the audit endpoint.</p></Card><RecordTable rows={rows}/></>}
    </main>
  </div>;
}

function RecordTable({ rows }) {
  if (!rows.length) return <Card><p className="py-8 text-center text-sm text-slate-500">No records found.</p></Card>;
  const fields = Object.keys(rows[0]).filter((field) => typeof rows[0][field] !== 'object').slice(0, 6);
  return <Card><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b">{fields.map((field) => <th key={field} className="px-3 py-2">{field}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id || index} className="border-b last:border-0">{fields.map((field) => <td key={field} className="px-3 py-3">{String(row[field] ?? '—')}</td>)}</tr>)}</tbody></table></div></Card>;
}
