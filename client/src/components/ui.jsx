export function Button({ type = 'button', variant = 'primary', size = 'md', children, disabled, className = '', onClick }) {
  const base = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-offset-2';
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-4 py-2', lg: 'px-6 py-3' };
  const variants = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
    outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus:ring-slate-500',
    ghost: 'text-slate-600 hover:bg-slate-200 focus:ring-slate-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500'
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Input({ id, label, type = 'text', value, onChange, placeholder, required, error, className = '' }) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor={id}>{label}</label>}
      <input id={id} type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required}
        className={`block w-full rounded border px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent ${
          error ? 'border-red-500 focus:ring-red-500' : 'border-slate-300'
        } ${className}`} />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function Select({ id, label, value, onChange, placeholder, required, error, className = '', children }) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor={id}>{label}</label>}
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={required}
        className={`block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:border-transparent ${
          error ? 'border-red-500 focus:ring-red-500' : ''
        } ${className}`}>
        {placeholder && <option value="" disabled hidden>{placeholder}</option>}
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-xl border border-slate-200 shadow-sm p-6 ${className}`}>{children}</div>;
}

export function CardHeader({ title, subtitle }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

export function Badge({ children, variant = 'default' }) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold';
  const variants = { default: 'bg-slate-100 text-slate-700', success: 'bg-green-100 text-green-700', warning: 'bg-amber-100 text-amber-700', danger: 'bg-red-100 text-red-700', info: 'bg-blue-100 text-blue-700' };
  return <span className={`${base} ${variants[variant]}`}>{children}</span>;
}

export function Table({ columns, rows, className = '' }) {
  return (
    <div className={`overflow-auto border border-slate-200 rounded-lg ${className}`}>
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-50">
          <tr>{columns.map((c) => (<th key={c.key} className="px-4 py-3 font-medium text-slate-600 border-b border-slate-200">{c.label}</th>))}</tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row) => (
            <tr key={row.id} className="bg-white">
              {columns.map((c) => (<td key={c.key} className="px-4 py-3 border-b border-slate-100">{typeof c.render === 'function' ? c.render(row) : row[c.key]}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ open, onClose, title, children, className = '' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-2xl p-4 m-4 bg-white rounded-xl shadow-xl ${className}`}>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>&times;</Button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, title = 'Confirm', message = 'Are you sure?', onConfirm, label = 'Delete' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md p-4 m-4 bg-white rounded-xl shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
        <p className="text-slate-600 mb-6">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>{label}</Button>
        </div>
      </div>
    </div>
  );
}

export function Toast({ message, type = 'success', duration = 3000 }) {
  return (
    <div className={`fixed bottom-4 right-4 z-50 p-4 rounded shadow-lg ${
      type === 'success' ? 'bg-green-600 text-white' : type === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
    }`}>{message}</div>
  );
}

export function SelectInput({ id, label, value, onChange, placeholder, error, className = '' }) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor={id}>{label}</label>}
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={error ? false : undefined}
        className={`block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:border-transparent ${
          error ? 'border-red-500 focus:ring-red-500' : 'border-slate-300'
        } ${className}`}>
        {placeholder && <option value="" disabled hidden>{placeholder}</option>}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function EmptyState({ title, subtitle }) {
  return (
    <div className="text-center py-12">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`}></div>;
}

export function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-2 mt-6">
      <Button variant="outline" size="sm" onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}>Prev</Button>
      <span className="px-2 text-sm text-slate-600">Page {page} of {pages}</span>
      <Button variant="outline" size="sm" onClick={() => onChange(Math.min(pages, page + 1))} disabled={page >= pages}>Next</Button>
    </div>
  );
}
