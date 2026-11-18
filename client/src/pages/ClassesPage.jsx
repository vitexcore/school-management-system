import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { Card, CardHeader, Button, Input, Table, Badge, Modal, ConfirmDialog } from '../components/ui';
import { z } from 'zod';

const clsSchema = z.object({
  name: z.string().min(1, 'Required'),
  level: z.string().min(1, 'Required'),
  arm: z.string().min(1, 'Required'),
  capacity: z.string().optional()
});

export default function ClassesPage() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', level: '', arm: '', capacity: '' });
  const [delId, setDelId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await api.get('/school/classes');
    setClasses(res.ok ? res.data.items : []);
    setLoading(false);
  }

  async function create() {
    setError('');
    const parsed = clsSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.errors[0].message); return; }
    const res = await api.post('/school/classes', { ...form, capacity: form.capacity ? Number(form.capacity) : undefined });
    if (res.ok) { setOpen(false); setForm({ name: '', level: '', arm: '', capacity: '' }); load(); }
    else setError(res.data.error || 'Failed');
  }

  async function del() {
    const res = await api.delete(`/school/classes/${delId}`);
    if (res.ok) { setDelId(null); load(); }
  }

  return (
    <Card>
      <CardHeader title="Classes" subtitle="Manage classes" />
      <div className="flex gap-3 mb-4">
        <Button variant="primary" onClick={() => { setEditId(null); setForm({ name: '', level: '', arm: '', capacity: '' }); setOpen(true); }}>Add Class</Button>
      </div>
      {loading ? <div className="p-4">Loading...</div> : classes.length === 0 ? (
        <div className="p-4 text-slate-500">No classes.</div>
      ) : (
        <>
          <Table
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'level', label: 'Level' },
              { key: 'arm', label: 'Arm' },
              { key: 'studentCount', label: 'Students' },
              { key: 'actions', label: 'Actions', render: (r) => (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setEditId(r.id); setForm({ name: r.name, level: r.level, arm: r.arm || '', capacity: r.capacity?.toString() || '' }); setOpen(true); }}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => setDelId(r.id)}>Delete</Button>
                </div>
              )}
            ]
          }
          rows={classes.map((c) => ({ ...c, id: c.id, studentCount: c.studentCount ?? 0 }))}
          />
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'Edit Class' : 'Add Class'}>
        <form onSubmit={(e) => { e.preventDefault(); create(); }} className="space-y-3">
          <Input id="name" label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Input id="level" label="Level" value={form.level} onChange={(v) => setForm({ ...form, level: v })} required />
          <Input id="arm" label="Arm" value={form.arm} onChange={(v) => setForm({ ...form, arm: v })} required />
          <Input id="capacity" label="Capacity" type="number" value={form.capacity} onChange={(v) => setForm({ ...form, capacity: v })} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" variant="primary">{editId ? 'Update' : 'Create'}</Button>
        </form>
      </Modal>
      <ConfirmDialog open={!!delId} onClose={() => setDelId(null)} title="Delete Class" message="Are you sure?" onConfirm={del} label="Delete" />
    </Card>
  );
}
