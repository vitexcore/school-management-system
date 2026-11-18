import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Card, CardHeader, Button, Input, SelectInput, Table, Badge } from '../components/ui';
import { api, ensureCsrf } from '../api/api';
import { Link } from 'react-router-dom';

const schema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  gender: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'GRADUATED', 'TRANSFERRED']).optional()
});

export default function StudentEditPage() {
  const { id } = useParams();
  const [student, setStudent] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', gender: '', dateOfBirth: '', address: '', photoUrl: '', status: 'ACTIVE' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => { load(); }, [id]);

  async function load() {
    const res = await api.get(`/school/students/${id}`);
    if (res.ok) {
      const s = res.data.student;
      setStudent(s);
      setForm({ firstName: s.firstName, lastName: s.lastName, gender: s.gender || '', dateOfBirth: s.dateOfBirth || '', address: s.address || '', photoUrl: s.photoUrl || '', status: s.status });
    }
    setLoading(false);
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const parsed = schema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.errors[0].message); return; }
    setLoading(true);
    try {
      await ensureCsrf();
      const res = await api.patch(`/school/students/${id}`, form);
      if (res.ok) navigate('/school/students');
      else setError(res.data.error || 'Failed');
    } catch { setError('Failed'); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (!student) return <div className="p-4 text-slate-500">Student not found.</div>;

  return (
    <Card>
      <CardHeader title="Edit Student" subtitle={student.admissionNumber} />
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1">
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
              <Button type="submit" variant="primary" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</Button>
              <Link to="/school/students"><Button variant="outline" type="button">Cancel</Button></Link>
            </div>
          </form>
        </div>
        <div className="md:w-96 shrink-0">
          <Card>
            <div className="font-semibold text-slate-900 mb-3">Guardians</div>
            <Table
              columns={[
                { key: 'name', label: 'Name' },
                { key: 'relationship', label: 'Relationship' },
                { key: 'phone', label: 'Phone' },
                { key: 'email', label: 'Email' }
              ]}
              rows={student.guardians.map((g) => ({ ...g, id: g.id }))}
            />
          </Card>
          <Card className="mt-4">
            <div className="font-semibold text-slate-900 mb-3">Current Enrollment</div>
            <div className="space-y-2">
              {student.enrollments.slice(0, 3).map((e) => (
                <div key={e.id} className="text-sm">
                  <div className="font-medium">{e.class?.name}</div>
                  <div className="text-xs text-slate-500">{e.academicYear?.name}</div>
                </div>
              ))}
              {student.enrollments.length === 0 && <div className="text-xs text-slate-500">No enrollment.</div>}
            </div>
          </Card>
        </div>
      </div>
    </Card>
  );
}
