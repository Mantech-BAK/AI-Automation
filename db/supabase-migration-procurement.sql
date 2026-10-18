-- Procurement spend for the Project Tracking module (Procurement page).
-- Run in the Supabase SQL Editor AFTER db/supabase-migration.sql. Run once; re-running duplicates the rows.

CREATE TABLE IF NOT EXISTS public.project_procurement (
  id SERIAL PRIMARY KEY,
  project_id TEXT REFERENCES public.projects(project_id),
  customer TEXT,
  vendor TEXT,
  description TEXT,
  amount_bhd NUMERIC(14,2),
  date DATE,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_procurement_project_id ON public.project_procurement(project_id);

INSERT INTO public.project_procurement (project_id, customer, vendor, description, amount_bhd, date, category) VALUES ('P-001', 'ABC Contracting', 'Gulf Steel Trading W.L.L', 'Structural steel and brackets', 38450.00, '2026-02-12', 'Materials');
INSERT INTO public.project_procurement (project_id, customer, vendor, description, amount_bhd, date, category) VALUES ('P-001', 'ABC Contracting', 'Khalifa Labour Services', 'Site labour - mobilisation phase', 21600.00, '2026-03-05', 'Labour');
INSERT INTO public.project_procurement (project_id, customer, vendor, description, amount_bhd, date, category) VALUES ('P-002', 'Gulf Facilities', 'Bahrain Cables Co.', 'Power and control cabling', 27840.50, '2026-03-20', 'Materials');
INSERT INTO public.project_procurement (project_id, customer, vendor, description, amount_bhd, date, category) VALUES ('P-004', 'Al Noor Trading', 'Arabian Fiber Networks', 'Telematics backbone subcontract', 54200.00, '2026-04-02', 'Subcontract');
INSERT INTO public.project_procurement (project_id, customer, vendor, description, amount_bhd, date, category) VALUES ('P-004', 'Al Noor Trading', 'Manama Equipment Rental', 'Crane and lifting equipment hire', 12750.00, '2026-04-18', 'Equipment');
INSERT INTO public.project_procurement (project_id, customer, vendor, description, amount_bhd, date, category) VALUES ('P-006', 'Gulf Logistics', 'Delta Project Services', 'Commissioning subcontract', 33900.00, '2026-05-06', 'Subcontract');
INSERT INTO public.project_procurement (project_id, customer, vendor, description, amount_bhd, date, category) VALUES ('P-008', 'Prime Engineering', 'Al Hilal Electrical Supplies', 'Switchgear and distribution boards', 46120.00, '2026-05-21', 'Materials');
INSERT INTO public.project_procurement (project_id, customer, vendor, description, amount_bhd, date, category) VALUES ('P-009', 'National Utilities', 'Ocean Industrial Supplies', 'Telematics units and antennas', 29330.75, '2026-06-03', 'Equipment');
INSERT INTO public.project_procurement (project_id, customer, vendor, description, amount_bhd, date, category) VALUES ('P-010', 'Al Safa Group', 'Khalifa Labour Services', 'Installation crew - infrastructure works', 41800.00, '2026-06-17', 'Labour');
INSERT INTO public.project_procurement (project_id, customer, vendor, description, amount_bhd, date, category) VALUES ('P-011', 'ABC Contracting', 'Gulf Steel Trading W.L.L', 'Mounting frames and fixings', 18420.00, '2026-07-02', 'Materials');
INSERT INTO public.project_procurement (project_id, customer, vendor, description, amount_bhd, date, category) VALUES ('P-012', 'Gulf Facilities', 'Delta Project Services', 'Civil and trenching subcontract', 63500.00, '2026-07-15', 'Subcontract');
INSERT INTO public.project_procurement (project_id, customer, vendor, description, amount_bhd, date, category) VALUES ('P-015', 'Modern Industries', 'Bahrain Cables Co.', 'Fibre and copper cable supply', 14980.00, '2026-07-29', 'Materials');
INSERT INTO public.project_procurement (project_id, customer, vendor, description, amount_bhd, date, category) VALUES ('P-019', 'National Utilities', 'Manama Equipment Rental', 'Excavator and generator hire', 22410.00, '2026-08-11', 'Equipment');
INSERT INTO public.project_procurement (project_id, customer, vendor, description, amount_bhd, date, category) VALUES ('P-020', 'Al Safa Group', 'Arabian Fiber Networks', 'Network rollout subcontract', 71250.00, '2026-08-25', 'Subcontract');
INSERT INTO public.project_procurement (project_id, customer, vendor, description, amount_bhd, date, category) VALUES ('P-022', 'Gulf Facilities', 'Khalifa Labour Services', 'Skilled technicians - stage 1', 16720.00, '2026-09-08', 'Labour');
INSERT INTO public.project_procurement (project_id, customer, vendor, description, amount_bhd, date, category) VALUES ('P-026', 'Gulf Logistics', 'Ocean Industrial Supplies', 'Replacement equipment and spares', 35600.00, '2026-09-22', 'Equipment');
INSERT INTO public.project_procurement (project_id, customer, vendor, description, amount_bhd, date, category) VALUES ('P-029', 'National Utilities', 'Al Hilal Electrical Supplies', 'Transformers and protection relays', 58900.00, '2026-10-06', 'Materials');
