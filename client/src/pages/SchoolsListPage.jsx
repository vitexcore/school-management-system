import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardHeader, Button, Input, Table, Badge } from '../components/ui';
import { api } from '../api/api';

export default function SchoolsListPage() {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => { load(); }, [search, status]);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    const res = await api.get(`/superadmin/schools?${params}`);
    setSchools(res.ok ? res.data.items : []);
    setLoading(false);
  }

  async function toggle(id, active) {
    const res = await api.post(`/superadmin/schools/${id}/${active ? 'reactivate' : 'suspend'}`);
    if (res.ok) load();
  }

  return (
    <Card>
      <CardHeader title="Schools" subtitle="Create, suspend or reactivate schools" />
      <div className="flex flex-col md:flex-row gap-4 mb-6 items-end">
        <div className="flex-1">
          <Input id="search" label="Search" placeholder="Name, slug or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-full md:w-48">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">All status</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>
        <Link to="/superadmin/schools/create"><Button variant="primary">Create school</Button></Link>
      </div>
      {loading ? (
        <p className="text-slate-500">Loading schools...</p>
      ) : schools.length === 0 ? (
        <p className="text-slate-500">No schools found.</p>
      ) : (
        <Table
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'slug', label: 'Slug' },
            { key: 'email', label: 'Email' },
            { key: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : 'danger'}>{r.status}</Badge> },
            { key: 'users', label: 'Admins', render: (r) => String(r._count?.users ?? 0) },
          ]}
          rows={schools.map((s) => ({
            ...s,
            id: s.id,
            users: s._count?.users ?? 0,
          }))}
        />
      )}
      {schools.length > 0 && (
        <div className="mt-6 flex gap-2">
          {schools.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <Link to={`/superadmin/schools/${s.id}`} className="text-sm font-medium text-primary-600 hover:underline">{s.name}</Link>
              <Button variant="outline" onClick={() => toggle(s.id, s.status === 'SUSPENDED')} disabled={loading}>
                {s.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
