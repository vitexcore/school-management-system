import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/api';
import { Card, Badge, Button } from '../components/ui';
import { Link } from 'react-router-dom';

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ students: 0, teachers: 0, classes: 0, attendance: 0 });
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [s, t, c] = await Promise.all([
        api.get('/school/students?limit=1'),
        api.get('/school/teachers?limit=1'),
        api.get('/school/classes?limit=1')
      ]);
      const announcementsResult = await api.get('/school/announcements?active=true&limit=5');
      if (announcementsResult.ok && mounted) setAnnouncements(announcementsResult.data?.items || []);
      let attendance = 0;
      if (c.ok && c.data.items.length) {
        const sum = await api.get(`/school/attendance/summary?classId=${c.data.items[0].id}`);
        if (sum.ok) attendance = sum.data.overall || 0;
      }
      if (mounted) {
        setStats({ students: s.ok ? s.data.total : 0, teachers: t.ok ? t.data.total : 0, classes: c.ok ? c.data.total : 0, attendance });
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) return <div className="p-6">Loading...</div>;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <Badge variant="info">{user.role}</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4"><div className="text-2xl font-bold text-slate-900">{stats.students}</div><div className="text-sm text-slate-500">Students</div></Card>
        <Card className="p-4"><div className="text-2xl font-bold text-slate-900">{stats.teachers}</div><div className="text-sm text-slate-500">Teachers</div></Card>
        <Card className="p-4"><div className="text-2xl font-bold text-slate-900">{stats.classes}</div><div className="text-sm text-slate-500">Classes</div></Card>
        <Card className="p-4"><div className="text-2xl font-bold text-slate-900">{stats.attendance}%</div><div className="text-sm text-slate-500">Today's attendance</div></Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {announcements.length > 0 && <Card className="md:col-span-3"><div className="mb-3 font-semibold text-slate-900">Latest announcements</div><div className="grid gap-3 md:grid-cols-2">{announcements.map((announcement) => <article key={announcement.id} className="rounded-lg border border-slate-200 p-3"><h2 className="font-medium text-slate-800">{announcement.title}</h2><p className="mt-1 text-sm text-slate-600">{announcement.body.replace(/<[^>]*>/g, '')}</p></article>)}</div></Card>}
        <Card>
          <div className="font-semibold text-slate-900 mb-3">Quick links</div>
          <div className="flex flex-col gap-2">
            <Link to="/school/students"><Button variant="outline" className="w-full">Manage Students</Button></Link>
            <Link to="/school/classes"><Button variant="outline" className="w-full">Manage Classes</Button></Link>
            <Link to="/school/attendance"><Button variant="outline" className="w-full">Mark Attendance</Button></Link>
          </div>
        </Card>
        <Card>
          <div className="font-semibold text-slate-900 mb-3">Academic Years</div>
          <div className="flex flex-col gap-2">
            <Link to="/school/academic-years"><Button variant="outline" className="w-full">Manage Academic Years</Button></Link>
            <Link to="/school/terms"><Button variant="outline" className="w-full">Manage Terms</Button></Link>
          </div>
        </Card>
        <Card>
          <div className="font-semibold text-slate-900 mb-3">Settings</div>
          <div className="flex flex-col gap-2">
            <Link to="/school/settings"><Button variant="outline" className="w-full">School Settings</Button></Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
