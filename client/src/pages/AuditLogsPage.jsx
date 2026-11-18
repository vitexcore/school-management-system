import { useState, useEffect } from 'react';
import { Card, CardHeader, Button, Input, Table, Badge } from '../components/ui';
import { api } from '../api/api';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [filters, setFilters] = useState({ action: '', entity: '', userId: '', schoolId: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [filters.action, filters.entity, filters.userId, filters.schoolId, meta.page]);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(meta.page), limit: '20' });
    if (filters.action) params.set('action', filters.action);
    if (filters.entity) params.set('entity', filters.entity);
    if (filters.userId) params.set('userId', filters.userId);
    if (filters.schoolId) params.set('schoolId', filters.schoolId);
    const res = await api.get(`/superadmin/audit-logs?${params}`);
    if (res.ok) {
      setLogs(res.data.items);
      setMeta({ page: res.data.page, limit: res.data.limit, total: res.data.total, pages: res.data.pages });
    }
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader title="Audit logs" subtitle="Superadmin actions" />
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 sm:w-64">
          <Input id="action" label="Action" placeholder="e.g. CREATE_SCHOOL" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} />
        </div>
        <div className="flex-1 sm:w-64">
          <Input id="entity" label="Entity" placeholder="e.g. School" value={filters.entity} onChange={(e) => setFilters({ ...filters, entity: e.target.value })} />
        </div>
        <Button variant="outline" onClick={() => setFilters({ action: '', entity: '', userId: '', schoolId: '' })}>Clear filters</Button>
      </div>
      {loading ? (
        <p className="text-slate-500">Loading audit logs...</p>
      ) : logs.length === 0 ? (
        <p className="text-slate-500">No audit logs found.</p>
      ) : (
        <>
          <Table
            columns={[
              { key: 'createdAt', label: 'Date', render: (r) => new Date(r.createdAt).toLocaleString() },
              { key: 'action', label: 'Action' },
              { key: 'entity', label: 'Entity' },
              { key: 'entityId', label: 'Entity ID' },
              { key: 'user', label: 'User', render: (r) => (r.user ? r.user.name : '—') },
              { key: 'school', label: 'School', render: (r) => (r.school ? r.school.name : '—') },
              { key: 'ip', label: 'IP', render: (r) => r.ip || '—' },
            ]}
            rows={logs}
          />
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Page {meta.page} of {Math.max(meta.pages, 1)} ({meta.total} records)
            </div>
            <div className="flex gap-1">
              <Button variant="outline" onClick={() => setMeta((m) => ({ ...m, page: Math.max(1, m.page - 1)}))} disabled={meta.page <= 1 || loading}>Prev</Button>
              <Button variant="primary" onClick={() => setMeta((m) => ({ ...m, page: m.page + 1}))} disabled={meta.page >= meta.pages || loading}>Next</Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
