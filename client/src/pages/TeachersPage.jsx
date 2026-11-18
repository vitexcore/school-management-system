import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { Card, CardHeader, Button, Input, Table, Badge, Modal, ConfirmDialog, SelectInput } from '../components/ui';
import { z } from 'zod';

const teacherSchema = z.object({
  name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  staffId: z.string().optional(),
  gender: z.string().optional(),
  qualification: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional()
});

export default function TeachersPage() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', staffId: '', gender: '', qualification: '', status: 'ACTIVE' });
  const [delId, setDelId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, [search, status, page]);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 20 });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    const res = await api.get(`/school/teachers?${params}`);
    setTeachers(res.ok ? res.data.items : []);
    setLoading(false);
  }

  async function create() {
    setError('');
    const parsed = teacherSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.errors[0].message); return; }
    const res = await api.post('/school/teachers', form);
    if (res.ok) { setOpen(false); setForm({ name: '', email: '', phone: '', staffId: '', gender: '', qualification: '', status: 'ACTIVE' }); load(); }
    else setError(res.data.error || 'Failed');
  }

  async function del() {
    const res = await api.delete(`/school/teachers/${delId}`);
    if (res.ok) { setDelId(null); load(); }
  }

  return (
    <Card>
      <CardHeader title="Teachers" subtitle="Manage teachers" />
      <div className="flex flex-col sm:flex-row gap-3 mb-4 items-end">
        <div className="flex-1">
          <Input id="search" label="Search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Name, staff ID, email" />
        </div>
        <div className="w-full sm:w-48">
          <SelectInput id="status" label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="All statuses">
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </SelectInput>
        </div>
        <Button variant="primary" onClick={() => { setEditId(null); setForm({ name: '', email: '', phone: '', staffId: '', gender: '', qualification: '', status: 'ACTIVE' }); setOpen(true); }}>Add Teacher</Button>
      </div>
      {loading ? <div className="p-4">Loading...</div> : teachers.length === 0 ? (
        <div className="p-4 text-slate-500">No teachers.</div>
      ) : (
        <>
          <Table
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'email', label: 'Email' },
              { key: 'staffId', label: 'Staff ID' },
              { key: 'gender', label: 'Gender' },
              { key: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : 'danger'}>{r.status}</Badge> },
              { key: 'actions', label: 'Actions', render: (r) => (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setEditId(r.id); setForm({ name: r.name, email: r.email || '', phone: r.phone || '', staffId: r.staffId || '', gender: r.gender || '', qualification: r.qualification || '', status: r.status }); setOpen(true); }}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => setDelId(r.id)}>Delete</Button>
                </div>
              )}
            ]
          }
          rows={teachers.map((t) => ({ ...t, id: t.id }))}
          />
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Edit Teacher' : 'Add Teacher'}>
        <form onSubmit={(e) => { e.preventDefault(); create(); }} className="space-y-3">
          <Input id="name" label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Input id="email" label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Input id="phone" label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <Input id="staffId" label="Staff ID" value={form.staffId} onChange={(v) => setForm({ ...form, staffId: v })} />
          <Input id="gender" label="Gender" value={form.gender} onChange={(v) => setForm({ ...form, gender: v })} />
          <Input id="qualification" label="Qualification" value={form.qualification} onChange={(v) => setForm({ ...form, qualification: v })} />
          <SelectInput id="status" label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </SelectInput>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" variant="primary">{editId ? 'Update' : 'Create'}</Button>
        </form>
      </Modal>
      <ConfirmDialog open={!!delId} onClose={() => setDelId(null)} title="Delete Teacher" message="Are you sure?" onConfirm={del} label="Delete" />
    </Card>
  );
}
