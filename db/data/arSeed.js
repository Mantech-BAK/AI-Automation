// Sample receivable invoices for the Project Tracking module. Amounts are BHD.
// transaction_ref is the invoice number; status is Paid, Pending (not yet due)
// or Overdue (past its due date and unpaid).
const AR_COLUMNS = [
  'project_id',
  'transaction_ref',
  'so_no',
  'transaction_type',
  'transaction_date',
  'amount_bhd',
  'description',
  'due_date',
  'status',
];

// [project_id, invoice no, invoice date, due date, amount, status, description]
const AR_SOURCE = [
  ['P-001', 'INV-2026-0101', '2026-02-10', '2026-03-12', 48250.0, 'Paid', 'Milestone 1 - design & mobilisation'],
  ['P-001', 'INV-2026-0142', '2026-06-15', '2026-07-15', 76331.56, 'Paid', 'Milestone 2 - implementation'],
  ['P-002', 'INV-2026-0108', '2026-03-05', '2026-04-04', 52000.0, 'Paid', 'Supply of equipment'],
  ['P-002', 'INV-2026-0167', '2026-08-20', '2026-09-19', 56615.8, 'Overdue', 'Installation progress claim'],
  ['P-004', 'INV-2026-0115', '2026-03-18', '2026-04-17', 67171.7, 'Paid', 'Telematics units delivery'],
  ['P-004', 'INV-2026-0181', '2026-09-02', '2026-10-02', 81429.19, 'Overdue', 'Phase 2 rollout'],
  ['P-006', 'INV-2026-0123', '2026-04-08', '2026-05-08', 39340.34, 'Paid', 'Implementation stage 1'],
  ['P-006', 'INV-2026-0190', '2026-09-25', '2026-10-25', 44637.23, 'Pending', 'Implementation stage 2'],
  ['P-009', 'INV-2026-0131', '2026-04-22', '2026-05-22', 30541.28, 'Paid', 'Telematics hardware'],
  ['P-009', 'INV-2026-0176', '2026-08-28', '2026-09-27', 21799.04, 'Overdue', 'Configuration & commissioning'],
  ['P-011', 'INV-2026-0138', '2026-05-12', '2026-06-11', 38559.79, 'Paid', 'Implementation milestone'],
  ['P-011', 'INV-2026-0185', '2026-09-10', '2026-10-10', 34316.08, 'Overdue', 'Final stage billing'],
  ['P-020', 'INV-2026-0149', '2026-06-30', '2026-07-30', 148233.31, 'Paid', 'Infrastructure works - part 1'],
  ['P-020', 'INV-2026-0195', '2026-10-05', '2026-11-04', 119407.66, 'Pending', 'Infrastructure works - part 2'],
  ['P-022', 'INV-2026-0156', '2026-07-14', '2026-08-13', 37366.6, 'Paid', 'Supply & installation stage 1'],
  ['P-022', 'INV-2026-0198', '2026-10-08', '2026-11-07', 29985.25, 'Pending', 'Supply & installation stage 2'],
  ['P-012', 'INV-2026-0160', '2026-07-22', '2026-08-21', 98433.0, 'Paid', 'Supply & installation milestone'],
  ['P-012', 'INV-2026-0201', '2026-10-12', '2026-11-11', 59144.29, 'Pending', 'Final milestone'],
  ['P-019', 'INV-2026-0171', '2026-08-06', '2026-09-05', 75415.63, 'Overdue', 'Telematics roll-out claim'],
  ['P-010', 'INV-2026-0204', '2026-10-14', '2026-11-13', 51147.88, 'Pending', 'Infrastructure stage billing'],
];

const AR_ROWS = AR_SOURCE.map(([projectId, ref, invoiceDate, dueDate, amount, status, description]) => [
  projectId,
  ref,
  `SO-2026${projectId.slice(2).padStart(4, '0')}`,
  'Invoice',
  invoiceDate,
  amount,
  description,
  dueDate,
  status,
]);

module.exports = { AR_COLUMNS, AR_ROWS };
