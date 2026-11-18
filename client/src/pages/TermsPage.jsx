import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { Card, CardHeader, Button, Input, Table, Badge, Modal, ConfirmDialog, SelectInput } from '../components/ui';
import { z } from 'zod';

const termSchema = z.object({
  academicYearId: z.string().min(1, 'Required'),
  name: z.string().min(1, 'Required'),
  startDate: z.string().min(1, 'Required'),
  endDate: z.string().min(1, 'Required'),
  isCurrent: z.boolean().optional()
});

export default function TermsPage() {
  const [terms, setTerms] = useState([]);
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ academicYearId: '', name: '', startDate: '', endDate: '', isCurrent: false });
  const [delId, setDelId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [t, y] = await Promise.all([api.get('/school/academic/terms'), api.get('/school/academic/years')]);
    setTerms(t.ok ? t.data.items : []);
    setYears(y.ok ? y.data.items : []);
    setLoading(false);
  }

  async function create() {
    setError('');
    const parsed = termSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.errors[0].message); return; }
    const res = await api.post('/school/academic/terms', form);
    if (res.ok) { setOpen(false); setForm({ academicYearId: '', name: '', startDate: '', endDate: '', isCurrent: false }); load(); }
    else setError(res.data.error || 'Failed');
  }

  async function del() {
    const res = await api.delete(`/school/academic/terms/${delId}`);
    if (res.ok) { setDelId(null); load(); }
  }

  async function setCurrent(id) {
    const res = await api.post(`/school/academic/terms/${id}/set-current`);
    if (res.ok) load();
  }

  return (
    <Card>
      <CardHeader title="Terms" subtitle="Manage academic terms" />
      <div className="flex gap-3 mb-4">
        <Button variant="primary" onClick={() => { setEditId(null); setForm({ academicYearId: '', name: '', startDate: '', endDate: '', isCurrent: false }); setOpen(true); }}>Add Term</Button>
      </div>
      {loading ? <div className="p-4">Loading...</div> : terms.length === 0 ? (
        <div className="p-4 text-slate-500">No terms.</div>
      ) : (
        <>
          <Table
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'academicYear', label: 'Academic Year', render: (r) => r.academicYear?.name || '-' },
              { key: 'status', label: 'Status', render: (r) => <Badge variant={r.isCurrent ? 'success' : 'default'}>{r.isCurrent ? 'Current' : 'Inactive'}</Badge> },
              { key: 'actions', label: 'Actions', render: (r) => (
                <div className="flex gap-2">
                  {!r.isCurrent && <Button variant="outline" size="sm" onClick={() => setCurrent(r.id)}>Set Current</Button>}
                  <Button variant="outline" size="sm" onClick={() => { setEditId(r.id); setForm({ academicYearId: r.academicYearId, name: r.name, startDate: r.startDate, endDate: r.endDate, isCurrent: r.isCurrent }); setOpen(true); }}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => setDelId(r.id)}>Delete</Button>
                </div>
              )}
            ]
          }
          rows={terms.map((t) => ({ ...t, id: t.id }))}
          />
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Edit Term' : 'Add Term'}>
        <form onSubmit={(e) => { e.preventDefault(); create(); }} className="space-y-3">
          <SelectInput id="academicYearId" label="Academic Year" value={form.academicYearId} onChange={(v) => setForm({ ...form, academicYearId: v })} placeholder="Select year" required>
            {years.map((y) => (<option key={y.id} value={y.id}>{y.name}</option>))}
          </SelectInput>
          <Input id="name" label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Input id="startDate" label="Start Date" type="date" value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} required />
          <Input id="endDate" label="End Date" type="date" value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} required />
          <div className="flex items-center gap-2">
            <input id="isCurrent" type="checkbox" checked={form.isCurrent} onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })} />
            <label className="text-sm text-slate-700" htmlFor="isCurrent">Set as current term</label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" variant="primary">{editId ? 'Update' : 'Create'}</Button>
        </form>
      </Modal>
      <ConfirmDialog open={!!delId} onClose={() => setDelId(null)} title="Delete Term" message="Are you sure?" onConfirm={del} label="Delete" />
    </Card>
  );
}
