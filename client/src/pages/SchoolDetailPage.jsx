import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Card, CardHeader, Button, Input, Table, Badge } from '../components/ui';
import { api } from '../api/api';

export default function SchoolDetailPage() {
  const { id } = useParams();
  const [school, setSchool] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    const [s, a] = await Promise.all([
      api.get(`/superadmin/schools/${id}`),
      api.get(`/superadmin/schools/${id}/admins`),
    ]);
    if (s.ok) setSchool(s.data.school);
    else setError(s.data.error || 'School not found');
    if (a.ok) setAdmins(a.data.admins);
    setLoading(false);
  }

  async function toggle(active) {
    const res = await api.post(`/superadmin/schools/${id}/${active ? 'reactivate' : 'suspend'}`);
    if (res.ok) {
      setSchool((prev) => (prev ? { ...prev, status: active ? 'ACTIVE' : 'SUSPENDED' } : null));
    }
  }

  if (loading) return <p className="text-slate-500">Loading school...</p>;
  if (!school) return <div className="Card p-6">{error || 'School not found.'}</div>;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <Card className="lg:w-96 shrink-0">
        <CardHeader title={school.name} subtitle={school.slug} />
        <div className="space-y-4 text-sm">
          <div><span className="font-medium text-slate-600 block">Email</span> {school.email}</div>
          <div><span className="font-medium text-slate-600 block">Phone</span> {school.phone || '—'}</div>
          <div><span className="font-medium text-slate-600 block">Address</span> {school.address || '—'}</div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-600 block">Status</span>
            <Badge variant={school.status === 'ACTIVE' ? 'success' : 'danger'}>{school.status}</Badge>
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          <Button variant={school.status === 'ACTIVE' ? 'danger' : 'primary'} onClick={() => toggle(school.status !== 'ACTIVE')} disabled={loading}>
            {school.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
          </Button>
          <Link to="/superadmin/schools"><Button variant="outline">Back</Button></Link>
        </div>
      </Card>
      <div className="flex-1">
        <Card>
          <CardHeader title="School admins" subtitle={admins.length === 0 ? 'No admins yet' : `Manage admins for ${school.name}`} />
          <div className="flex gap-3 mb-4">
            <Link to="/superadmin/schools/create"><Button variant="outline">Add admin</Button></Link>
          </div>
          <Table
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'email', label: 'Email' },
              { key: 'isActive', label: 'Active', render: (r) => <Badge variant={r.isActive ? 'success' : 'danger'}>{r.isActive ? 'Yes' : 'No'}</Badge> },
            ]}
            rows={admins.map((a) => ({ ...a, id: a.id }))}
          />
          {admins.length === 0 && <p className="text-slate-500 text-center py-4">No admins assigned to this school.</p>}
        </Card>
      </div>
    </div>
  );
}
