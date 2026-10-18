-- AR adjustments (credit notes, debit notes, write-offs, discounts) for the Adjustments page.
-- Run in the Supabase SQL Editor AFTER db/supabase-migration.sql. Run once; re-running duplicates the rows.

CREATE TABLE IF NOT EXISTS public.project_adjustments (
  id SERIAL PRIMARY KEY,
  project_id TEXT REFERENCES public.projects(project_id),
  customer TEXT,
  description TEXT,
  adjustment_type TEXT,
  amount_bhd NUMERIC(14,2),
  date DATE,
  reference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_adjustments_project_id ON public.project_adjustments(project_id);

INSERT INTO public.project_adjustments (project_id, customer, description, adjustment_type, amount_bhd, date, reference) VALUES ('P-001', 'ABC Contracting', 'Credit for returned brackets', 'Credit Note', 3250.00, '2026-04-10', 'CN-2026-001');
INSERT INTO public.project_adjustments (project_id, customer, description, adjustment_type, amount_bhd, date, reference) VALUES ('P-002', 'Gulf Facilities', 'Early payment discount', 'Discount', 2900.00, '2026-04-22', 'DSC-2026-001');
INSERT INTO public.project_adjustments (project_id, customer, description, adjustment_type, amount_bhd, date, reference) VALUES ('P-004', 'Al Noor Trading', 'Additional telematics units supplied', 'Debit Note', 8400.00, '2026-05-14', 'DN-2026-001');
INSERT INTO public.project_adjustments (project_id, customer, description, adjustment_type, amount_bhd, date, reference) VALUES ('P-006', 'Gulf Logistics', 'Credit for billing error on stage 1', 'Credit Note', 1850.00, '2026-06-02', 'CN-2026-002');
INSERT INTO public.project_adjustments (project_id, customer, description, adjustment_type, amount_bhd, date, reference) VALUES ('P-009', 'National Utilities', 'Uncollectable balance written off', 'Write-off', 4120.00, '2026-06-30', 'WO-2026-001');
INSERT INTO public.project_adjustments (project_id, customer, description, adjustment_type, amount_bhd, date, reference) VALUES ('P-011', 'ABC Contracting', 'Variation order - extra cabling', 'Debit Note', 6700.00, '2026-07-18', 'DN-2026-002');
INSERT INTO public.project_adjustments (project_id, customer, description, adjustment_type, amount_bhd, date, reference) VALUES ('P-012', 'Gulf Facilities', 'Volume discount on supply', 'Discount', 5200.00, '2026-08-03', 'DSC-2026-002');
INSERT INTO public.project_adjustments (project_id, customer, description, adjustment_type, amount_bhd, date, reference) VALUES ('P-019', 'National Utilities', 'Credit for delayed delivery', 'Credit Note', 2400.00, '2026-08-27', 'CN-2026-003');
INSERT INTO public.project_adjustments (project_id, customer, description, adjustment_type, amount_bhd, date, reference) VALUES ('P-020', 'Al Safa Group', 'Re-measurement of completed works', 'Debit Note', 9650.00, '2026-09-12', 'DN-2026-003');
INSERT INTO public.project_adjustments (project_id, customer, description, adjustment_type, amount_bhd, date, reference) VALUES ('P-022', 'Gulf Facilities', 'Small balance written off', 'Write-off', 950.00, '2026-09-30', 'WO-2026-002');
INSERT INTO public.project_adjustments (project_id, customer, description, adjustment_type, amount_bhd, date, reference) VALUES ('P-026', 'Gulf Logistics', 'Goodwill discount - margin protection', 'Discount', 1500.00, '2026-10-05', 'DSC-2026-003');
INSERT INTO public.project_adjustments (project_id, customer, description, adjustment_type, amount_bhd, date, reference) VALUES ('P-029', 'National Utilities', 'Penalty charge recovery', 'Debit Note', 3300.00, '2026-10-11', 'DN-2026-004');
