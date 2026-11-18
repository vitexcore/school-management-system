import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Card, CardHeader, Button, Input, SelectInput } from '../components/ui';
import { api, ensureCsrf } from '../api/api';

const schema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  gender: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'GRADUATED', 'TRANSFERRED']).optional()
});

export default function StudentCreatePage() {
  const [form, setForm] = useState({ firstName: '', lastName: '', gender: '', dateOfBirth: '', address: '', photoUrl: '', status: 'ACTIVE' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const parsed = schema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.errors[0].message); return; }
    setLoading(true);
    try {
      await ensureCsrf();
      const res = await api.post('/school/students', form);
      if (res.ok) navigate('/school/students');
      else setError(res.data.error || 'Failed');
    } catch { setError('Failed'); }
    finally { setLoading(false); }
  };

  return (
    <Card>
      <CardHeader title="Create Student" subtitle="Add a new student" />
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input id="firstName" label="First Name" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} required />
        <Input id="lastName" label="Last Name" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} required />
        <div className="grid grid-cols-2 gap-3">
          <SelectInput id="gender" label="Gender" value={form.gender} onChange={(v) => setForm({ ...form, gender: v })}>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </SelectInput>
          <SelectInput id="status" label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })}>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="GRADUATED">Graduated</option>
            <option value="TRANSFERRED">Transferred</option>
          </SelectInput>
        </div>
        <Input id="dateOfBirth" label="Date of Birth" type="date" value={form.dateOfBirth} onChange={(v) => setForm({ ...form, dateOfBirth: v })} />
        <Input id="address" label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
        <Input id="photoUrl" label="Photo URL" value={form.photoUrl} onChange={(v) => setForm({ ...form, photoUrl: v })} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <Button type="submit" variant="primary" disabled={loading}>{loading ? 'Creating...' : 'Create Student'}</Button>
          <Link to="/school/students"><Button variant="outline" type="button">Cancel</Button></Link>
        </div>
      </form>
    </Card>
  );
}
