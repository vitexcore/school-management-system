import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { Card, CardHeader, Button, Input, Table, Badge, SelectInput } from '../components/ui';

export default function ResultsPage() {
  const [classes, setClasses] = useState([]);
  const [terms, setTerms] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadClasses(); loadTerms(); }, []);

  async function loadClasses() {
    const res = await api.get('/school/classes?limit=100');
    if (res.ok) setClasses(res.data.items);
  }
  async function loadTerms() {
    const res = await api.get('/school/academic/terms?limit=100');
    if (res.ok) setTerms(res.data.items);
  }
  async function loadResults() {
    if (!selectedClass || !selectedTerm) return;
    setLoading(true);
    const res = await api.get(`/school/results/${selectedClass}/${selectedTerm}`);
    setResults(res.ok ? res.data.results : []);
    setLoading(false);
  }
  useEffect(() => { if (selectedClass && selectedTerm) loadResults(); }, [selectedClass, selectedTerm]);

  return (
    <Card>
      <CardHeader title="Term Results" subtitle="View class results and rankings" />
      <div className="flex gap-3 mb-4 items-end">
        <SelectInput id="class" label="Class" value={selectedClass} onChange={setSelectedClass} placeholder="Class">
          {classes.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </SelectInput>
        <SelectInput id="term" label="Term" value={selectedTerm} onChange={setSelectedTerm} placeholder="Term">
          {terms.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </SelectInput>
        <Button variant="primary" onClick={loadResults} disabled={!selectedClass || !selectedTerm}>Load Results</Button>
      </div>
      {loading ? <div className="p-4">Loading...</div> : results.length === 0 ? (
        <div className="p-4 text-slate-500">No results.</div>
      ) : (
        <Table
          columns={[
            { key: 'rank', label: 'Rank' },
            { key: 'name', label: 'Student' },
            { key: 'percentage', label: 'Percentage' },
            { key: 'grade', label: 'Grade' },
            { key: 'remark', label: 'Remark' }
          ]}
          rows={results.map((r) => ({
            rank: r.rank,
            name: `${r.student.firstName} ${r.student.lastName}`,
            percentage: r.percentage,
            grade: r.grade,
            remark: r.remark
          }))}
          />
      )}
    </Card>
  );
}
