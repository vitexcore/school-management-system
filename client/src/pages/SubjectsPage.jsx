import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { Card, CardHeader, Button, Input, Table, Badge, Modal, ConfirmDialog, SelectInput } from '../components/ui';
import { z } from 'zod';

const subjectSchema = z.object({
  name: z.string().min(1, 'Required'),
  code: z.string().min(1, 'Required')
});

const classSubjectSchema = z.object({
  classId: z.string().min(1, 'Required'),
  subjectId: z.string().min(1, 'Required'),
  teacherId: z.string().optional()
});

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState([]);
  const [classSubjects, setClassSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subOpen, setSubOpen] = useState(false);
  const [subForm, setSubForm] = useState({ name: '', code: '' });
  const [csOpen, setCsOpen] = useState(false);
  const [csForm, setCsForm] = useState({ classId: '', subjectId: '', teacherId: '' });
  const [delId, setDelId] = useState(null);
  const [delType, setDelType] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [s, cs, c, t] = await Promise.all([
      api.get('/school/subjects'), api.get('/school/class-subjects'),
      api.get('/school/classes?limit=100'), api.get('/school/teachers?limit=100')
    ]);
    setSubjects(s.ok ? s.data.items : []);
    setClassSubjects(cs.ok ? cs.data.items : []);
    setClasses(c.ok ? c.data.items : []);
    setTeachers(t.ok ? t.data.items : []);
    setLoading(false);
  }

  async function createSubject() {
    const parsed = subjectSchema.safeParse(subForm);
    if (!parsed.success) return;
    const res = await api.post('/school/subjects', subForm);
    if (res.ok) { setSubOpen(false); setSubForm({ name: '', code: '' }); load(); }
  }

  async function createClassSubject() {
    const parsed = classSubjectSchema.safeParse(csForm);
    if (!parsed.success) return;
    const res = await api.post('/school/class-subjects', csForm);
    if (res.ok) { setCsOpen(false); setCsForm({ classId: '', subjectId: '', teacherId: '' }); load(); }
  }

  async function del() {
    if (delType === 'subject') {
      const res = await api.delete(`/school/subjects/${delId}`);
      if (res.ok) { setDelId(null); setDelType(''); load(); }
    } else {
      const res = await api.delete(`/school/class-subjects/${delId}`);
      if (res.ok) { setDelId(null); setDelType(''); load(); }
    }
  }

  return (
    <Card>
      <CardHeader title="Subjects & Assignments" subtitle="Subjects and class-subject assignments" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="font-semibold text-slate-900 mb-3">Subjects</div>
          {loading ? <div className="text-slate-500">Loading...</div> : subjects.length === 0 ? (
            <div className="text-slate-500">No subjects.</div>
          ) : (
            <Table
              columns={[
                { key: 'name', label: 'Name' },
                { key: 'code', label: 'Code' },
                { key: 'actions', label: 'Actions', render: (r) => (
                  <div className="flex gap-2">
                    <Button variant="danger" size="sm" onClick={() => { setDelId(r.id); setDelType('subject'); }}>Delete</Button>
                  </div>
                )}
              ]
            }
            rows={subjects.map((s) => ({ ...s, id: s.id }))}
            />
          )}
          <div className="mt-3 flex gap-2">
            <Input id="subName" label="Name" value={subForm.name} onChange={(v) => setSubForm({ ...subForm, name: v })} placeholder="Subject name" />
            <Input id="subCode" label="Code" value={subForm.code} onChange={(v) => setSubForm({ ...subForm, code: v })} placeholder="Code" />
            <Button variant="primary" onClick={createSubject}>Add</Button>
          </div>
        </div>
        <div>
          <div className="font-semibold text-slate-900 mb-3">Class Subject Assignments</div>
          {loading ? <div className="text-slate-500">Loading...</div> : (
            <Table
              columns={[
                { key: 'class', label: 'Class' },
                { key: 'subject', label: 'Subject' },
                { key: 'teacher', label: 'Teacher' },
                { key: 'actions', label: 'Actions', render: (r) => (
                  <div className="flex gap-2">
                    <Button variant="danger" size="sm" onClick={() => { setDelId(r.id); setDelType('classsubject'); }}>Remove</Button>
                  </div>
                )}
              ]
            }
            rows={classSubjects.map((cs) => ({
              id: cs.id,
              class: `${cs.class?.name} (${cs.class?.level}${cs.class?.arm})`,
              subject: `${cs.subject?.name} (${cs.subject?.code})`,
              teacher: cs.teacher?.name || '—'
            }))}
            />
          )}
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <SelectInput id="csClass" label="Class" value={csForm.classId} onChange={(v) => setCsForm({ ...csForm, classId: v })} placeholder="Class">
              {classes.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </SelectInput>
            <SelectInput id="csSubject" label="Subject" value={csForm.subjectId} onChange={(v) => setCsForm({ ...csForm, subjectId: v })} placeholder="Subject">
              {subjects.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </SelectInput>
            <SelectInput id="csTeacher" label="Teacher" value={csForm.teacherId} onChange={(v) => setCsForm({ ...csForm, teacherId: v })} placeholder="Teacher (optional)">
              <option value="">None</option>
              {teachers.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
            </SelectInput>
            <Button variant="primary" onClick={createClassSubject}>Assign</Button>
          </div>
        </div>
      </div>
      <ConfirmDialog open={!!delId} onClose={() => setDelId(null)} title="Delete" message="Are you sure?" onConfirm={del} label="Delete" />
    </Card>
  );
}
