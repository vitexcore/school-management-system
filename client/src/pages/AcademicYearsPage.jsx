import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { Card, CardHeader, Button, Input, Table, Badge, Modal, ConfirmDialog } from '../components/ui';
import { z } from 'zod';

const yearSchema = z.object({
  name: z.string().min(1, 'Required'),
  startDate: z.string().min(1, 'Required'),
  endDate: z.string().min(1, 'Required'),
  isCurrent: z.boolean().optional()
});

export default function AcademicYearsPage() {
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', isCurrent: false });
  const [delId, setDelId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await api.get('/school/academic/years');
    setYears(res.ok ? res.data.items : []);
    setLoading(false);
  }

  async function create() {
    setError('');
    const parsed = yearSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.errors[0].message); return; }
    const res = await api.post('/school/academic/years', form);
    if (res.ok) { setOpen(false); setForm({ name: '', startDate: '', endDate: '', isCurrent: false }); load(); }
    else setError(res.data.error || 'Failed');
  }

  async function del() {
    const res = await api.delete(`/school/academic/years/${delId}`);
    if (res.ok) { setDelId(null); load(); }
  }

  async function setCurrent(id) {
    const res = await api.post(`/school/academic/years/${id}/set-current`);
    if (res.ok) load();
  }

  return (
    <Card>
      <CardHeader title="Academic Years" subtitle="Manage academic years" />
      <div className="flex gap-3 mb-4">
        <Button variant="primary" onClick={() => { setEditId(null); setForm({ name: '', startDate: '', endDate: '', isCurrent: false }); setOpen(true); }}>Add Year</Button>
      </div>
      {loading ? <div className="p-4">Loading...</div> : years.length === 0 ? (
        <div className="p-4 text-slate-500">No academic years.</div>
      ) : (
        <>
          <Table
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'status', label: 'Status', render: (r) => <Badge variant={r.isCurrent ? 'success' : 'default'}>{r.isCurrent ? 'Current' : 'Inactive'}</Badge> },
              { key: 'actions', label: 'Actions', render: (r) => (
                <div className="flex gap-2">
                  {!r.isCurrent && <Button variant="outline" size="sm" onClick={() => setCurrent(r.id)}>Set Current</Button>}
                  <Button variant="outline" size="sm" onClick={() => { setEditId(r.id); setForm({ name: r.name, startDate: r.startDate, endDate: r.endDate, isCurrent: r.isCurrent }); setOpen(true); }}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => setDelId(r.id)}>Delete</Button>
                </div>
              )}
            ]
            }
          rows={years.map((y) => ({ ...y, id: y.id }))}
          />
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Edit Academic Year' : 'Add Academic Year'}>
        <form onSubmit={(e) => { e.preventDefault(); create(); }} className="space-y-3">
          <Input id="name" label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Input id="startDate" label="Start Date" type="date" value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} required />
          <Input id="endDate" label="End Date" type="date" value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} required />
          <div className="flex items-center gap-2">
            <input id="isCurrent" type="checkbox" checked={form.isCurrent} onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })} />
            <label className="text-sm text-slate-700" htmlFor="isCurrent">Set as current year</label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" variant="primary">{editId ? 'Update' : 'Create'}</Button>
        </form>
      </Modal>
      <ConfirmDialog open={!!delId} onClose={() => setDelId(null)} title="Delete Year" message="Are you sure?" onConfirm={del} label="Delete" />
    </Card>
  );
}
