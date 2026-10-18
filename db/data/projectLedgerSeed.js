// Sample procurement spend and AR adjustments for the Project Tracking module.
// The customer is looked up from the project seed so the two never disagree.
const { PROJECT_COLUMNS, PROJECT_ROWS } = require('./projectsSeed');

const idIndex = PROJECT_COLUMNS.indexOf('project_id');
const customerIndex = PROJECT_COLUMNS.indexOf('customer');
const customerOf = Object.fromEntries(PROJECT_ROWS.map((row) => [row[idIndex], row[customerIndex]]));

// ---------- procurement ----------
const PROCUREMENT_COLUMNS = ['project_id', 'customer', 'vendor', 'description', 'amount_bhd', 'date', 'category'];

// [project_id, vendor, description, amount, date, category]
const PROCUREMENT_SOURCE = [
  ['P-001', 'Gulf Steel Trading W.L.L', 'Structural steel and brackets', 38450.0, '2026-02-12', 'Materials'],
  ['P-001', 'Khalifa Labour Services', 'Site labour - mobilisation phase', 21600.0, '2026-03-05', 'Labour'],
  ['P-002', 'Bahrain Cables Co.', 'Power and control cabling', 27840.5, '2026-03-20', 'Materials'],
  ['P-004', 'Arabian Fiber Networks', 'Telematics backbone subcontract', 54200.0, '2026-04-02', 'Subcontract'],
  ['P-004', 'Manama Equipment Rental', 'Crane and lifting equipment hire', 12750.0, '2026-04-18', 'Equipment'],
  ['P-006', 'Delta Project Services', 'Commissioning subcontract', 33900.0, '2026-05-06', 'Subcontract'],
  ['P-008', 'Al Hilal Electrical Supplies', 'Switchgear and distribution boards', 46120.0, '2026-05-21', 'Materials'],
  ['P-009', 'Ocean Industrial Supplies', 'Telematics units and antennas', 29330.75, '2026-06-03', 'Equipment'],
  ['P-010', 'Khalifa Labour Services', 'Installation crew - infrastructure works', 41800.0, '2026-06-17', 'Labour'],
  ['P-011', 'Gulf Steel Trading W.L.L', 'Mounting frames and fixings', 18420.0, '2026-07-02', 'Materials'],
  ['P-012', 'Delta Project Services', 'Civil and trenching subcontract', 63500.0, '2026-07-15', 'Subcontract'],
  ['P-015', 'Bahrain Cables Co.', 'Fibre and copper cable supply', 14980.0, '2026-07-29', 'Materials'],
  ['P-019', 'Manama Equipment Rental', 'Excavator and generator hire', 22410.0, '2026-08-11', 'Equipment'],
  ['P-020', 'Arabian Fiber Networks', 'Network rollout subcontract', 71250.0, '2026-08-25', 'Subcontract'],
  ['P-022', 'Khalifa Labour Services', 'Skilled technicians - stage 1', 16720.0, '2026-09-08', 'Labour'],
  ['P-026', 'Ocean Industrial Supplies', 'Replacement equipment and spares', 35600.0, '2026-09-22', 'Equipment'],
  ['P-029', 'Al Hilal Electrical Supplies', 'Transformers and protection relays', 58900.0, '2026-10-06', 'Materials'],
];

const PROCUREMENT_ROWS = PROCUREMENT_SOURCE.map(([projectId, vendor, description, amount, date, category]) => [
  projectId,
  customerOf[projectId],
  vendor,
  description,
  amount,
  date,
  category,
]);

// ---------- adjustments ----------
const ADJUSTMENT_COLUMNS = ['project_id', 'customer', 'description', 'adjustment_type', 'amount_bhd', 'date', 'reference'];

// Credit notes, discounts and write-offs reduce what the customer owes (credits);
// debit notes add to it (debits).
// [project_id, description, type, amount, date, reference]
const ADJUSTMENT_SOURCE = [
  ['P-001', 'Credit for returned brackets', 'Credit Note', 3250.0, '2026-04-10', 'CN-2026-001'],
  ['P-002', 'Early payment discount', 'Discount', 2900.0, '2026-04-22', 'DSC-2026-001'],
  ['P-004', 'Additional telematics units supplied', 'Debit Note', 8400.0, '2026-05-14', 'DN-2026-001'],
  ['P-006', 'Credit for billing error on stage 1', 'Credit Note', 1850.0, '2026-06-02', 'CN-2026-002'],
  ['P-009', 'Uncollectable balance written off', 'Write-off', 4120.0, '2026-06-30', 'WO-2026-001'],
  ['P-011', 'Variation order - extra cabling', 'Debit Note', 6700.0, '2026-07-18', 'DN-2026-002'],
  ['P-012', 'Volume discount on supply', 'Discount', 5200.0, '2026-08-03', 'DSC-2026-002'],
  ['P-019', 'Credit for delayed delivery', 'Credit Note', 2400.0, '2026-08-27', 'CN-2026-003'],
  ['P-020', 'Re-measurement of completed works', 'Debit Note', 9650.0, '2026-09-12', 'DN-2026-003'],
  ['P-022', 'Small balance written off', 'Write-off', 950.0, '2026-09-30', 'WO-2026-002'],
  ['P-026', 'Goodwill discount - margin protection', 'Discount', 1500.0, '2026-10-05', 'DSC-2026-003'],
  ['P-029', 'Penalty charge recovery', 'Debit Note', 3300.0, '2026-10-11', 'DN-2026-004'],
];

const ADJUSTMENT_ROWS = ADJUSTMENT_SOURCE.map(([projectId, description, type, amount, date, reference]) => [
  projectId,
  customerOf[projectId],
  description,
  type,
  amount,
  date,
  reference,
]);

module.exports = { PROCUREMENT_COLUMNS, PROCUREMENT_ROWS, ADJUSTMENT_COLUMNS, ADJUSTMENT_ROWS };
