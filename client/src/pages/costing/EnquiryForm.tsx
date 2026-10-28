import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { ENQUIRY_STATUSES, costingApi, errorText, jsonInit, statusLabel, type Department, type Enquiry, type MasUser } from '../../lib/costing';
import { Card, ErrorBanner, Field, Loading, PageHeader, inputCls, primaryBtn, secondaryBtn } from './ui';

interface Lookup {
  departments: Department[];
  assignable: MasUser[];
  salesmen: MasUser[];
}

interface FormState {
  client_name: string;
  project_name: string;
  project_location: string;
  consultant: string;
  main_contractor: string;
  department_id: string;
  assigned_to: string;
  salesman_id: string;
  submission_date: string;
  estimated_value: string;
  status: string;
  notes: string;
}

const blank = (me: MasUser): FormState => ({
  client_name: '',
  project_name: '',
  project_location: '',
  consultant: '',
  main_contractor: '',
  department_id: me.department_id ? String(me.department_id) : '',
  assigned_to: String(me.id),
  salesman_id: '',
  submission_date: '',
  estimated_value: '',
  status: 'open',
  notes: '',
});

export default function EnquiryForm({ me, enquiryId, onNavigate }: { me: MasUser; enquiryId?: number; onNavigate: (path: string) => void }) {
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [form, setForm] = useState<FormState>(blank(me));
  const [loading, setLoading] = useState(Boolean(enquiryId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Enquiry | null>(null);

  useEffect(() => {
    costingApi<Lookup>('/lookup').then(setLookup).catch((e) => setError(errorText(e, 'Failed to load the form options')));
  }, []);

  useEffect(() => {
    if (!enquiryId) return;
    costingApi<{ enquiry: Enquiry }>(`/enquiries/${enquiryId}`)
      .then(({ enquiry }) =>
        setForm({
          client_name: enquiry.client_name,
          project_name: enquiry.project_name,
          project_location: enquiry.project_location ?? '',
          consultant: enquiry.consultant ?? '',
          main_contractor: enquiry.main_contractor ?? '',
          department_id: enquiry.department_id ? String(enquiry.department_id) : '',
          assigned_to: enquiry.assigned_to ? String(enquiry.assigned_to) : '',
          salesman_id: enquiry.salesman_id ? String(enquiry.salesman_id) : '',
          submission_date: enquiry.submission_date?.slice(0, 10) ?? '',
          estimated_value: enquiry.estimated_value === null ? '' : String(enquiry.estimated_value),
          status: enquiry.status,
          notes: enquiry.notes ?? '',
        })
      )
      .catch((e) => setError(errorText(e, 'Failed to load the enquiry')))
      .finally(() => setLoading(false));
  }, [enquiryId]);

  const set = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form };
      if (enquiryId) {
        await costingApi<Enquiry>(`/enquiries/${enquiryId}`, jsonInit('PUT', payload));
        onNavigate(`/costing/enquiries/${enquiryId}`);
      } else {
        setCreated(await costingApi<Enquiry>('/enquiries', jsonInit('POST', payload)));
      }
    } catch (e) {
      setError(errorText(e, 'Failed to save the enquiry'));
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    return (
      <div className="max-w-xl mx-auto mt-8 bg-white rounded-2xl border border-emerald-200 shadow-sm p-8 text-center space-y-4">
        <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
        <h1 className="text-xl font-bold text-slate-800">Enquiry created</h1>
        <p className="text-slate-600 text-sm">
          <button onClick={() => onNavigate(`/costing/enquiries/${created.id}`)} className="font-semibold text-teal-600 hover:underline">{created.enquiry_no}</button>{' '}
          was created for {created.project_name}. Two tasks (Prepare Costing Sheet, Submit for Review) were added to {created.assigned_to_name}'s list.
        </p>
        <div className="flex justify-center gap-3">
          <button onClick={() => onNavigate(`/costing/enquiries/${created.id}`)} className={primaryBtn}>Open enquiry</button>
          <button onClick={() => { setCreated(null); setForm(blank(me)); }} className={secondaryBtn}>Create another</button>
        </div>
      </div>
    );
  }

  if (loading || !lookup) return <Loading />;

  const text = (label: string, key: keyof FormState, opts: { required?: boolean; type?: string; span?: boolean } = {}) => (
    <div className={opts.span ? 'sm:col-span-2' : ''}>
      <Field label={label} required={opts.required}>
        <input type={opts.type ?? 'text'} value={form[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<FormState>)} className={inputCls} />
      </Field>
    </div>
  );

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <button onClick={() => onNavigate(enquiryId ? `/costing/enquiries/${enquiryId}` : '/costing/enquiries')} className="flex items-center gap-1 text-sm text-teal-600 hover:underline mb-1">
          <ArrowLeft size={14} /> {enquiryId ? 'Enquiry' : 'Enquiries'}
        </button>
        <PageHeader title={enquiryId ? 'Edit Enquiry' : 'New Enquiry'} />
      </div>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <Card title="Enquiry details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {text('Client Name', 'client_name', { required: true })}
          {text('Project Name', 'project_name', { required: true })}
          {text('Project Location', 'project_location')}
          {text('Consultant', 'consultant')}
          {text('Main Contractor', 'main_contractor')}
          <Field label="Department" required>
            <select value={form.department_id} onChange={(e) => set({ department_id: e.target.value })} className={inputCls} aria-label="Department">
              <option value="">Select a department...</option>
              {lookup.departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Assigned To">
            <select value={form.assigned_to} onChange={(e) => set({ assigned_to: e.target.value })} className={inputCls} aria-label="Assigned To">
              {lookup.assignable.map((u) => (
                <option key={u.id} value={u.id}>{u.name} - {u.role_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Salesman">
            <select value={form.salesman_id} onChange={(e) => set({ salesman_id: e.target.value })} className={inputCls} aria-label="Salesman">
              <option value="">None</option>
              {lookup.salesmen.map((u) => (
                <option key={u.id} value={u.id}>{u.name} - {u.role_name}</option>
              ))}
            </select>
          </Field>
          {text('Submission Deadline', 'submission_date', { type: 'date' })}
          {text('Estimated Value (BHD)', 'estimated_value', { type: 'number' })}
          {enquiryId && (
            <Field label="Status">
              <select value={form.status} onChange={(e) => set({ status: e.target.value })} className={inputCls} aria-label="Status">
                {ENQUIRY_STATUSES.map((s) => (
                  <option key={s} value={s}>{statusLabel(s)}</option>
                ))}
              </select>
            </Field>
          )}
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea value={form.notes} rows={3} onChange={(e) => set({ notes: e.target.value })} className={inputCls} />
            </Field>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <button onClick={() => onNavigate(enquiryId ? `/costing/enquiries/${enquiryId}` : '/costing/enquiries')} className={secondaryBtn}>Cancel</button>
        <button onClick={save} disabled={saving || !form.client_name.trim() || !form.project_name.trim() || !form.department_id} className={primaryBtn}>
          {saving ? 'Saving...' : enquiryId ? 'Save changes' : 'Create enquiry'}
        </button>
      </div>
    </div>
  );
}
