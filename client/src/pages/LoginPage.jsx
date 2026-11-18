import { useState } from 'react';
import { z } from 'zod';
import { Card, CardHeader, Button, Input } from '../components/ui';
import { api, ensureCsrf } from '../api/api';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password')
});

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const parsed = schema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.errors[0].message); return; }
    setLoading(true);
    try {
      await ensureCsrf();
      const res = await api.post('/auth/login', { email: form.email, password: form.password });
      if (res.ok) {
        const role = res.data.user.role;
        if (role === 'SUPERADMIN') {
          window.location.assign('/platform');
        } else {
          window.location.assign('/school');
        }
      } else {
        setError(res.data.error || 'Login failed. Please try again.');
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full md:w-[420px]">
        <CardHeader title="Sign in" subtitle="School management" />
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input id="email" label="Email address" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="you@school.ng" required />
          <Input id="password" label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="••••••••" required />
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
