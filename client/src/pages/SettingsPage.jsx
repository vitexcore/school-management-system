import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { Card, CardHeader, Button, Input, Table, Badge } from '../components/ui';
import { z } from 'zod';

const gradeScaleSchema = z.object({
  minScore: z.string().min(1, 'Required'),
  maxScore: z.string().min(1, 'Required'),
  grade: z.string().min(1, 'Required'),
  remark: z.string().optional()
});

export default function SettingsPage() {
  const [gradeScale, setGradeScale] = useState([]);
  const [school, setSchool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gsForm, setGsForm] = useState({ minScore: '', maxScore: '', grade: '', remark: '' });
  const [profileForm, setProfileForm] = useState({ name: '', email: '', phone: '', address: '', admissionPrefix: '', blockReportCardsForUnpaid: false });
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [g, s] = await Promise.all([api.get('/school/settings/grade-scale'), api.get('/school/settings/school')]);
    setGradeScale(g.ok ? g.data.gradeScale : []);
    setSchool(s.ok ? s.data.school : null);
    if (s.ok && s.data.school) setProfileForm({ name: s.data.school.name || '', email: s.data.school.email || '', phone: s.data.school.phone || '', address: s.data.school.address || '', admissionPrefix: s.data.school.admissionPrefix || '', blockReportCardsForUnpaid: Boolean(s.data.school.blockReportCardsForUnpaid) });
    setLoading(false);
  }

  async function createGradeScale() {
    setError('');
    const parsed = gradeScaleSchema.safeParse(gsForm);
    if (!parsed.success) { setError(parsed.error.errors[0].message); return; }
    const res = await api.post('/school/settings/grade-scale', { minScore: Number(gsForm.minScore), maxScore: Number(gsForm.maxScore), grade: gsForm.grade, remark: gsForm.remark });
    if (res.ok) { setGsForm({ minScore: '', maxScore: '', grade: '', remark: '' }); load(); }
    else setError(res.data.error || 'Failed');
  }

  async function seedDefault() {
    const res = await api.post('/school/settings/grade-scale/seed-default');
    if (res.ok) load();
  }

  async function updateProfile() {
    const res = await api.patch('/school/settings/school', profileForm);
    if (res.ok) { setSchool(res.data.school); setProfileForm({ name: res.data.school.name || '', email: res.data.school.email || '', phone: res.data.school.phone || '', address: res.data.school.address || '', admissionPrefix: res.data.school.admissionPrefix || '', blockReportCardsForUnpaid: Boolean(res.data.school.blockReportCardsForUnpaid) }); }
  }

  return (
    <Card>
      <CardHeader title="Settings" subtitle="School settings" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="font-semibold text-slate-900 mb-3">Grade Scale</div>
          {loading ? <div className="text-slate-500">Loading...</div> : (
            <>
              <Table
                columns={[
                  { key: 'minScore', label: 'Min' },
                  { key: 'maxScore', label: 'Max' },
                  { key: 'grade', label: 'Grade' },
                  { key: 'remark', label: 'Remark' }
                ]}
                rows={gradeScale.map((g) => ({ ...g, id: g.id }))}
              />
              <div className="mt-3 flex gap-2">
                <Input id="gsMin" label="Min Score" type="number" value={gsForm.minScore} onChange={(v) => setGsForm({ ...gsForm, minScore: v })} />
                <Input id="gsMax" label="Max Score" type="number" value={gsForm.maxScore} onChange={(v) => setGsForm({ ...gsForm, maxScore: v })} />
                <Input id="gsGrade" label="Grade" value={gsForm.grade} onChange={(v) => setGsForm({ ...gsForm, grade: v })} />
                <Input id="gsRemark" label="Remark" value={gsForm.remark} onChange={(v) => setGsForm({ ...gsForm, remark: v })} />
                <Button variant="primary" onClick={createGradeScale}>Add</Button>
                <Button variant="outline" onClick={seedDefault}>Seed Default</Button>
              </div>
            </>
          )}
        </div>
        <div>
          <div className="font-semibold text-slate-900 mb-3">School Profile</div>
          <form onSubmit={(e) => { e.preventDefault(); updateProfile(); }} className="space-y-3">
            <Input id="sName" label="School Name" value={profileForm.name} onChange={(v) => setProfileForm({ ...profileForm, name: v })} />
            <Input id="sEmail" label="Email" type="email" value={profileForm.email} onChange={(v) => setProfileForm({ ...profileForm, email: v })} />
            <Input id="sPhone" label="Phone" value={profileForm.phone} onChange={(v) => setProfileForm({ ...profileForm, phone: v })} />
            <Input id="sAddress" label="Address" value={profileForm.address} onChange={(v) => setProfileForm({ ...profileForm, address: v })} />
            <Input id="sPrefix" label="Admission Prefix" value={profileForm.admissionPrefix} onChange={(v) => setProfileForm({ ...profileForm, admissionPrefix: v })} />
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={profileForm.blockReportCardsForUnpaid} onChange={(e) => setProfileForm({ ...profileForm, blockReportCardsForUnpaid: e.target.checked })} /> Block report card publishing when a student has unpaid fees</label>
            <Button variant="primary" type="submit">Update Profile</Button>
          </form>
        </div>
      </div>
    </Card>
  );
}
