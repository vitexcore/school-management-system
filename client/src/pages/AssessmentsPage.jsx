import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { Card, CardHeader, Button, Input, Table, Badge, Modal, ConfirmDialog, SelectInput } from '../components/ui';
import { z } from 'zod';

const assessmentSchema = z.object({
  classSubjectId: z.string().min(1, 'Required'),
  termId: z.string().min(1, 'Required'),
  name: z.string().min(1, 'Required'),
  type: z.enum(['CA', 'TEST', 'EXAM']),
  maxScore: z.string().min(1, 'Required'),
  weight: z.string().min(1, 'Required')
});

export default function AssessmentsPage() {
  const [assessments, setAssessments] = useState([]);
  const [classSubjects, setClassSubjects] = useState([]);
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ classSubjectId: '', termId: '', name: '', type: 'CA', maxScore: '', weight: '1' });
  const [delId, setDelId] = useState(null);

  // bulk score entry
  const [selAssessment, setSelAssessment] = useState(null);
  const [scoreStudents, setScoreStudents] = useState([]);
  const [scores, setScores] = useState({});
  const [scoreLoading, setScoreLoading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [a, cs, t] = await Promise.all([api.get('/school/assessments'), api.get('/school/class-subjects'), api.get('/school/academic/terms')]);
    setAssessments(a.ok ? a.data.items : []);
    setClassSubjects(cs.ok ? cs.data.items : []);
    setTerms(t.ok ? t.data.items : []);
    setLoading(false);
  }

  async function create() {
    const parsed = assessmentSchema.safeParse(form);
    if (!parsed.success) return;
    const res = await api.post('/school/assessments', { ...form, maxScore: Number(form.maxScore), weight: Number(form.weight) });
    if (res.ok) { setOpen(false); setForm({ classSubjectId: '', termId: '', name: '', type: 'CA', maxScore: '', weight: '1' }); load(); }
  }

  async function del() {
    const res = await api.delete(`/school/assessments/${delId}`);
    if (res.ok) { setDelId(null); load(); }
  }

  async function loadScores() {
    if (!selAssessment) return;
    setScoreLoading(true);
    const [sRes] = await Promise.all([api.get(`/school/scores?assessmentId=${selAssessment}`)]);
    const scoreMap = {};
    (sRes.ok ? sRes.data.items : []).forEach((s) => { scoreMap[s.studentId] = s.value; });
    setScores(scoreMap);
    const a = assessments.find((x) => x.id === selAssessment);
    if (a) {
      const stRes = await api.get(`/school/students?classId=${a.classSubject.classId}&limit=100`);
      setScoreStudents(stRes.ok ? stRes.data.items : []);
    }
    setScoreLoading(false);
  }

  useEffect(() => { if (selAssessment) loadScores(); }, [selAssessment]);

  async function saveScores() {
    const records = scoreStudents.map((s) => ({ studentId: s.id, value: scores[s.id] ?? 0 }));
    const res = await api.post('/school/scores/bulk', { assessmentId: selAssessment, scores: records });
    if (res.ok) alert('Scores saved');
  }

  return (
    <Card>
      <CardHeader title="Assessments" subtitle="Create assessments and enter scores" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <div className="font-semibold text-slate-900 mb-3">Assessments</div>
          {loading ? <div className="text-slate-500">Loading...</div> : assessments.length === 0 ? (
            <div className="text-slate-500">No assessments.</div>
          ) : (
            <Table
              columns={[
                { key: 'name', label: 'Name' },
                { key: 'type', label: 'Type' },
                { key: 'maxScore', label: 'Max Score' },
                { key: 'weight', label: 'Weight' }
              ]}
              rows={assessments.map((a) => ({ ...a, id: a.id }))}
              />
          )}
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={() => { setOpen(true); }}>Add Assessment</Button>
          </div>
        </div>
        <div>
          <div className="font-semibold text-slate-900 mb-3">Bulk Score Entry</div>
          <SelectInput id="sa" label="Assessment" value={selAssessment} onChange={setSelAssessment} placeholder="Select assessment">
            {assessments.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
          </SelectInput>
          {selAssessment && (
            <div className="mt-3">
              <div className="font-medium text-slate-900 mb-2">Scores</div>
              {scoreLoading ? <div className="text-slate-500">Loading...</div> : (
                <div>
                  <Table
                  columns={[
                    { key: 'name', label: 'Student' },
                    { key: 'value', label: 'Score' }
                  ]}
                  rows={scoreStudents.map((s) => ({
                    id: s.id,
                    name: `${s.firstName} ${s.lastName}`,
                    value: (
                      <input
                        type="number"
                        className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none"
                        value={scores[s.id] ?? ''}
                        onChange={(ev) => setScores({ ...scores, [s.id]: ev.target.value })}
                      />
                    )
                  }))}
                  />
                  <Button variant="primary" onClick={saveScores} disabled={scoreLoading}>{scoreLoading ? 'Saving...' : 'Save All Scores'}</Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Assessment">
        <form onSubmit={(e) => { e.preventDefault(); create(); }} className="space-y-3">
          <SelectInput id="cs" label="Class Subject" value={form.classSubjectId} onChange={(v) => setForm({ ...form, classSubjectId: v })} required>
            {classSubjects.map((cs) => (<option key={cs.id} value={cs.id}>{`${cs.class.name} - ${cs.subject.name}`}</option>))}
          </SelectInput>
          <SelectInput id="term" label="Term" value={form.termId} onChange={(v) => setForm({ ...form, termId: v })} required>
            {terms.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </SelectInput>
          <Input id="name" label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <SelectInput id="type" label="Type" value={form.type} onChange={(v) => setForm({ ...form, type: v })} required>
            <option value="CA">CA</option>
            <option value="TEST">Test</option>
            <option value="EXAM">Exam</option>
          </SelectInput>
          <Input id="maxScore" label="Max Score" type="number" value={form.maxScore} onChange={(v) => setForm({ ...form, maxScore: v })} required />
          <Input id="weight" label="Weight" type="number" value={form.weight} onChange={(v) => setForm({ ...form, weight: v })} />
          <Button type="submit" variant="primary">{open ? 'Create' : 'Create'}</Button>
        </form>
      </Modal>
      <ConfirmDialog open={!!delId} onClose={() => setDelId(null)} title="Delete Assessment" message="Are you sure?" onConfirm={del} label="Delete" />
    </Card>
  );
}
