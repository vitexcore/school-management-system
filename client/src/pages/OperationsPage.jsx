import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, API_BASE } from '../api/api';
import { Button, Card } from '../components/ui';

const pages = {
  '/school/attendance': { title: 'Attendance', endpoint: '/school/attendance' },
  '/school/fee-items': { title: 'Fee items', endpoint: '/school/fees/items' },
  '/school/invoices': { title: 'Invoices', endpoint: '/school/fees/invoices' },
  '/school/payments': { title: 'Payments', endpoint: '/school/payments/list' },
  '/school/debtors': { title: 'Debtors', endpoint: '/school/fees/debtors' },
  '/school/fee-summary': { title: 'Fee collection summary', endpoint: '/school/fees/summary' },
  '/school/report-cards': { title: 'Report cards', endpoint: '/school/report-cards' },
  '/school/timetable': { title: 'Weekly timetable', endpoint: '/school/timetable' },
  '/school/announcements': { title: 'Announcements', endpoint: '/school/announcements' },
};

const listKey = (data) => data?.items || data?.cards || data?.slots || data?.debtors || [];

export default function OperationsPage() {
  const { pathname } = useLocation();
  const page = pages[pathname] || pages['/school/attendance'];
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [termId, setTermId] = useState('');
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [exportJobId, setExportJobId] = useState('');
  const [exportJob, setExportJob] = useState(null);

  const queryPath = useMemo(() => {
    if (['/school/debtors', '/school/fee-summary'].includes(pathname) && termId) {
      return `${page.endpoint}?termId=${encodeURIComponent(termId)}`;
    }
    return page.endpoint;
  }, [page.endpoint, pathname, termId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await api.get(queryPath);
    if (!result.ok) {
      setError(result.data?.error || 'Could not load this page.');
      setRows([]);
    } else {
      setRows(listKey(result.data?.data || result.data));
    }
    setLoading(false);
  }, [queryPath]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!exportJobId) return undefined;
    let stopped = false;
    const poll = async () => {
      const result = await api.get(`/school/report-cards/bulk-pdf/${exportJobId}`);
      const job = result.data?.job;
      if (job && !stopped) {
        setExportJob({ ...job, downloadUrl: result.data.downloadUrl });
        if (job.status === 'COMPLETED' || job.status === 'FAILED') stopped = true;
      }
    };
    poll();
    const timer = window.setInterval(() => { if (!stopped) poll(); }, 2000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [exportJobId]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    const route = pathname === '/school/fee-items' ? '/school/fees/items'
      : pathname === '/school/payments' ? '/school/payments/record' : null;
    if (!route) { setNotice('Choose an available action below to continue.'); setBusy(false); return; }
    const payload = pathname === '/school/fee-items'
      ? { ...form, amount: Number(form.amount), isOptional: Boolean(form.isOptional) }
      : { ...form, amount: Number(form.amount) };
    const result = await api.post(route, payload);
    if (!result.ok) setError(result.data?.error || 'The action could not be completed.');
    else { setNotice('Saved successfully.'); setForm({}); await load(); }
    setBusy(false);
  };

  const action = async (path, payload, done) => {
    setBusy(true); setError(''); setNotice('');
    const result = await api.post(path, payload);
    if (!result.ok) setError(result.data?.error || 'The action could not be completed.');
    else { setNotice(done); await load(); }
    setBusy(false);
  };

  const requestBulkPdf = async () => {
    setBusy(true); setError(''); setNotice(''); setExportJob(null);
    const result = await api.post('/school/report-cards/bulk-pdf', { classId: form.classId, termId: form.termId });
    if (!result.ok) setError(result.data?.error || 'Could not queue PDF export.');
    else { setExportJobId(result.data.job.id); setNotice('Class report PDF queued.'); }
    setBusy(false);
  };

  const renderValue = (value) => {
    if (value == null) return '—';
    if (typeof value === 'object') return value.name || value.title || JSON.stringify(value);
    return String(value);
  };

  return <main className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-slate-900">{page.title}</h1><p className="mt-1 text-sm text-slate-600">School records and actions are limited to your school.</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={load} disabled={loading}>Refresh</Button>{pathname === '/school/timetable' && <Button variant="outline" onClick={() => window.print()}>Print timetable</Button>}</div>
    </header>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

    {['/school/debtors', '/school/fee-summary'].includes(pathname) && <Card>
      <label className="block text-sm font-medium text-slate-700" htmlFor="term-id">Term ID</label>
      <input id="term-id" value={termId} onChange={(e) => setTermId(e.target.value)} placeholder="Enter a term ID" className="mt-1 w-full rounded-md border border-slate-300 p-2 focus:outline-2 focus:outline-blue-600" />
      {pathname === '/school/debtors' && <a className="mt-3 inline-block text-sm text-blue-700 underline" href={`${API_BASE}/school/fees/debtors?termId=${encodeURIComponent(termId)}&format=csv`} target="_blank" rel="noreferrer">Download debtors CSV</a>}
    </Card>}

    {pathname === '/school/fee-items' && <Card><h2 className="mb-4 font-semibold">Add a fee item</h2><form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
      <label className="text-sm">Name<input required value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label>
      <label className="text-sm">Amount (kobo)<input required type="number" min="1" step="1" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label>
      <label className="text-sm">Term ID<input required value={form.termId || ''} onChange={(e) => setForm({ ...form, termId: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label>
      <label className="text-sm">Class ID (leave blank for all classes)<input value={form.classId || ''} onChange={(e) => setForm({ ...form, classId: e.target.value || null })} className="mt-1 w-full rounded-md border p-2" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.isOptional)} onChange={(e) => setForm({ ...form, isOptional: e.target.checked })} /> Optional fee</label>
      <Button disabled={busy}>Save fee item</Button>
    </form></Card>}

    {pathname === '/school/payments' && <Card><h2 className="mb-4 font-semibold">Record a payment</h2><form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
      <label className="text-sm">Invoice ID<input required value={form.invoiceId || ''} onChange={(e) => setForm({ ...form, invoiceId: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label>
      <label className="text-sm">Amount (kobo)<input required type="number" min="1" step="1" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label>
      <label className="text-sm">Method<select required value={form.method || 'CASH'} onChange={(e) => setForm({ ...form, method: e.target.value })} className="mt-1 w-full rounded-md border p-2"><option>CASH</option><option>TRANSFER</option></select></label>
      <label className="text-sm">Reference<input required value={form.reference || ''} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label>
      <Button disabled={busy}>Record payment</Button>
    </form></Card>}

    {pathname === '/school/invoices' && <Card><h2 className="font-semibold">Generate term invoices</h2><p className="my-2 text-sm text-slate-600">Enter the term ID. To generate for one class, add its class ID. Optional fee IDs can be comma separated.</p><form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); action('/school/fees/invoices/generate', { termId: form.termId, classId: form.classId || undefined, optionalFeeItemIds: (form.optionalFeeItemIds || '').split(',').map((id) => id.trim()).filter(Boolean), dueDate: form.dueDate }, 'Invoice generation finished.'); }}>
      <label className="text-sm">Term ID<input required value={form.termId || ''} onChange={(e) => setForm({ ...form, termId: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label><label className="text-sm">Class ID (optional)<input value={form.classId || ''} onChange={(e) => setForm({ ...form, classId: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label><label className="text-sm">Due date<input required type="date" value={form.dueDate?.slice(0, 10) || ''} onChange={(e) => setForm({ ...form, dueDate: e.target.value ? new Date(`${e.target.value}T00:00:00.000Z`).toISOString() : '' })} className="mt-1 w-full rounded-md border p-2" /></label><label className="text-sm">Optional fee item IDs<input value={form.optionalFeeItemIds || ''} onChange={(e) => setForm({ ...form, optionalFeeItemIds: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label><Button disabled={busy}>Generate invoices</Button>
    </form></Card>}

    {pathname === '/school/report-cards' && <Card><h2 className="mb-3 font-semibold">Build, comment on, and publish report cards</h2><form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); action('/school/report-cards/generate', { classId: form.classId, termId: form.termId }, 'Draft report cards generated.'); }}><label className="text-sm">Class ID<input required value={form.classId || ''} onChange={(e) => setForm({ ...form, classId: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label><label className="text-sm">Term ID<input required value={form.termId || ''} onChange={(e) => setForm({ ...form, termId: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label><Button disabled={busy}>Generate drafts</Button><Button type="button" variant="outline" disabled={busy || !form.classId || !form.termId} onClick={requestBulkPdf}>Queue class PDF</Button></form>{exportJob && <p role="status" className="mt-3 text-sm text-slate-700">PDF export: {exportJob.status}{exportJob.downloadUrl && <> · <a className="text-blue-700 underline" href={`${API_BASE.replace(/\/api$/, '')}${exportJob.downloadUrl}`} target="_blank" rel="noreferrer">Download PDF</a></>}</p>}<form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); action('/school/report-cards/bulk-comment', { classId: form.classId, termId: form.termId, classTeacherComment: form.classTeacherComment || null, principalComment: form.principalComment || null }, 'Draft comments saved.'); }}><label className="text-sm">Class teacher comment<input value={form.classTeacherComment || ''} onChange={(e) => setForm({ ...form, classTeacherComment: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label><label className="text-sm">Principal comment<input value={form.principalComment || ''} onChange={(e) => setForm({ ...form, principalComment: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label><Button disabled={busy}>Apply class comments</Button><Button type="button" disabled={busy} onClick={() => action('/school/report-cards/publish', { classId: form.classId, termId: form.termId }, 'Report cards published.')}>Publish class cards</Button></form></Card>}

    {pathname === '/school/timetable' && <Card><h2 className="mb-4 font-semibold">Add weekly timetable slot</h2><form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={(e) => { e.preventDefault(); action('/school/timetable', { classId: form.classId, classSubjectId: form.classSubjectId, dayOfWeek: Number(form.dayOfWeek), startTime: form.startTime, endTime: form.endTime, room: form.room || null }, 'Timetable slot saved.'); }}><label className="text-sm">Class ID<input required value={form.classId || ''} onChange={(e) => setForm({ ...form, classId: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label><label className="text-sm">Class subject ID<input required value={form.classSubjectId || ''} onChange={(e) => setForm({ ...form, classSubjectId: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label><label className="text-sm">Day<select value={form.dayOfWeek ?? 0} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })} className="mt-1 w-full rounded-md border p-2">{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><label className="text-sm">Room<input value={form.room || ''} onChange={(e) => setForm({ ...form, room: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label><label className="text-sm">Start<input required type="time" value={form.startTime || ''} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label><label className="text-sm">End<input required type="time" value={form.endTime || ''} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label><Button disabled={busy}>Add slot</Button></form></Card>}

    {pathname === '/school/announcements' && <Card><h2 className="mb-4 font-semibold">Create announcement</h2><form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); action('/school/announcements', { title: form.title, body: form.body, audience: form.audience || 'ALL', classId: form.audience === 'CLASS' ? form.classId : null, pinned: Boolean(form.pinned), publishAt: form.publishAt || new Date().toISOString(), expiresAt: form.expiresAt || null }, 'Announcement saved.'); }}><label className="text-sm">Title<input required maxLength="200" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label><label className="text-sm">Audience<select value={form.audience || 'ALL'} onChange={(e) => setForm({ ...form, audience: e.target.value })} className="mt-1 w-full rounded-md border p-2"><option>ALL</option><option>TEACHERS</option><option>STUDENTS</option><option>CLASS</option></select></label>{form.audience === 'CLASS' && <label className="text-sm">Class ID<input required value={form.classId || ''} onChange={(e) => setForm({ ...form, classId: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label>}<label className="text-sm sm:col-span-2">Message<textarea required rows="4" value={form.body || ''} onChange={(e) => setForm({ ...form, body: e.target.value })} className="mt-1 w-full rounded-md border p-2" /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.pinned)} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> Pin announcement</label><label className="text-sm">Publish at<input type="datetime-local" value={form.publishAt || ''} onChange={(e) => setForm({ ...form, publishAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} className="mt-1 w-full rounded-md border p-2" /></label><label className="text-sm">Expires at<input type="datetime-local" value={form.expiresAt || ''} onChange={(e) => setForm({ ...form, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} className="mt-1 w-full rounded-md border p-2" /></label><Button disabled={busy}>Save announcement</Button></form></Card>}

    <Card>
      {loading ? <div className="animate-pulse space-y-3" aria-label="Loading"><div className="h-5 w-40 rounded bg-slate-200"/><div className="h-24 rounded bg-slate-100"/></div> : rows.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No records yet. Use the actions above or add records through the school modules.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-slate-500">{Object.keys(rows[0]).slice(0, 7).map((key) => <th key={key} className="px-3 py-2 font-medium">{key}</th>)}{['/school/payments', '/school/report-cards'].includes(pathname) && <th className="px-3 py-2">Document</th>}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id || index} className="border-b last:border-0">{Object.keys(rows[0]).slice(0, 7).map((key) => <td key={key} className="max-w-64 truncate px-3 py-3">{renderValue(row[key])}</td>)}{row.id && <>{pathname === '/school/payments' && <td className="px-3 py-3"><a className="text-blue-700 underline" href={`${API_BASE}/school/payments/${row.id}/receipt`} target="_blank" rel="noreferrer">Receipt PDF</a></td>}{pathname === '/school/report-cards' && <td className="px-3 py-3"><a className="text-blue-700 underline" href={`${API_BASE}/school/report-cards/${row.id}/pdf`} target="_blank" rel="noreferrer">Preview PDF</a></td>}</>}</tr>)}</tbody></table></div>}
    </Card>
  </main>;
}
