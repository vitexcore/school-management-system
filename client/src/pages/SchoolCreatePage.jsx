import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Card, CardHeader, Button, Input } from '../components/ui';
import { api, ensureCsrf } from '../api/api';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens only'),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().optional(),
  address: z.string().optional(),
  logoUrl: z.string().url('Enter a valid URL').optional().or(z.literal('')),
});

export default function SchoolCreatePage() {
  const [form, setForm] = useState({ name: '', slug: '', email: '', phone: '', address: '', logoUrl: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const parsed = schema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.errors[0]?.message || 'Invalid input'); return; }
    setLoading(true);
    try {
      await ensureCsrf();
      const res = await api.post('/superadmin/schools', form);
      if (res.ok) navigate(`/superadmin/schools/${res.data.school.id}`);
      else setError(res.data.error || 'Failed to create school');
    } catch {
      setError('Failed to create school');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Create school" subtitle="Add a new school" />
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input id="name" label="School name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Lagos International School" required />
        <Input id="slug" label="Slug" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} placeholder="e.g. lagos-international" required />
        <Input id="email" label="Email address" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="e.g. info@school.ng" required />
        <Input id="phone" label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="e.g. 08012345678" />
        <Input id="address" label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} placeholder="e.g. 123 Adeola Odeku" />
        <Input id="logoUrl" label="Logo URL" value={form.logoUrl} onChange={(v) => setForm({ ...form, logoUrl: v })} placeholder="e.g. https://example.com/logo.png" />
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
        <div className="flex gap-3">
          <Button type="submit" variant="primary" disabled={loading}>{loading ? 'Creating...' : 'Create school'}</Button>
          <Link to="/superadmin/schools"><Button variant="outline" type="button">Cancel</Button></Link>
        </div>
      </form>
    </Card>
  );
}
