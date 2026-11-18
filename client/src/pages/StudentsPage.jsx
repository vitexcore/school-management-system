import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import { Card, CardHeader, Button, Input, Table, Badge, Pagination } from '../components/ui';
import { z } from 'zod';

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [classes, setClasses] = useState([]);

  useEffect(() => { loadClasses(); load(); }, [search, classId, status, page]);

  async function loadClasses() {
    const res = await api.get('/school/classes?limit=100');
    if (res.ok) setClasses(res.data.items);
  }

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 20 });
    if (search) params.set('search', search);
    if (classId) params.set('classId', classId);
    if (status) params.set('status', status);
    const res = await api.get(`/school/students?${params}`);
    setStudents(res.ok ? res.data.items : []);
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader title="Students" subtitle="Manage students" />
      <div className="flex flex-col sm:flex-row gap-3 mb-4 items-end">
        <div className="flex-1 sm:w-80">
          <Input id="search" label="Search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Name or admission number" />
        </div>
        <div className="w-full sm:w-64">
          <SelectInput id="classId" label="Class" value={classId} onChange={(v) => { setClassId(v); setPage(1); }} placeholder="All classes">
            {classes.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </SelectInput>
        </div>
        <div className="w-full sm:w-48">
          <SelectInput id="status" label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="All statuses">
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="GRADUATED">Graduated</option>
            <option value="TRANSFERRED">Transferred</option>
          </SelectInput>
        </div>
        <Button variant="primary" asChild>
          <a href="/school/students/create">Add Student</a>
        </Button>
      </div>
      {loading ? <div className="p-4">Loading...</div> : students.length === 0 ? (
        <div className="p-4 text-slate-500">No students.</div>
      ) : (
        <>
          <Table
            columns={[
              { key: 'admissionNumber', label: 'Admission No.' },
              { key: 'name', label: 'Name' },
              { key: 'gender', label: 'Gender' },
              { key: 'status', label: 'Status', render: (r) => <Badge variant={r.status === 'ACTIVE' ? 'success' : r.status === 'SUSPENDED' ? 'danger' : 'default'}>{r.status}</Badge> },
              { key: 'actions', label: 'Actions', render: (r) => (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild><a href={`/school/students/${r.id}`}>View</a></Button>
                </div>
              )}
            ]
          }
          rows={students.map((s) => ({ id: s.id, admissionNumber: s.admissionNumber, name: `${s.firstName} ${s.lastName}`, gender: s.gender || '—', status: s.status }))}
          />
          <Pagination page={page} pages={Math.ceil((students.length || 0) / 20)} onChange={setPage} />
        </>
      )}
    </Card>
  );
}
