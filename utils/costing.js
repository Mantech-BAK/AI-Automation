// Costing sheet maths - the single source of truth for what is stored. The React form mirrors these
// formulas (client/src/lib/costing.ts) for live totals while typing; the server recomputes on every save.
//
// Sections:
//   ST1 foreign materials   EXW -> supplier discount -> BD (rate) -> + shipping & duty % -> landing cost -> + margin %
//   ST2 local materials / subcontract   unit cost BD -> total cost -> + margin %
//   ST3 installation / labour   nos x (months*30 + days) x per-day rate (salary / 30); overhead % on top
//   ST4 bank charges   amount, taken at cost
// Margin is a mark-up on cost. Profit % is reported both on cost and on selling.

const DEFAULT_RATES = { BD: 1, USD: 0.376, EUR: 0.41 };
const DEFAULT_OH_PCT = 35;
const DAYS_PER_MONTH = 30;

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function defaultRate(currency) {
  return DEFAULT_RATES[String(currency || 'BD').toUpperCase()] ?? 1;
}

// Returns the derived fields of one line plus `cost` (what it costs us) and `selling` (what we charge).
function calcLine(section, line) {
  const qty = num(line.qty);

  if (section === 'ST1') {
    const exw = num(line.unit_cost_exw);
    const unitDiscounted = exw * (1 - num(line.supplier_discount_pct) / 100);
    const rate = num(line.bd_conversion_rate) || defaultRate(line.currency);
    const unitBd = unitDiscounted * rate;
    const totalCostBd = qty * unitBd;
    const unitWithCf = unitBd * (1 + num(line.shipping_duty) / 100);
    const landing = qty * unitWithCf;
    const unitSelling = unitWithCf * (1 + num(line.margin_pct) / 100);
    const sellingTotal = qty * unitSelling;
    return {
      unit_rate_discounted: unitDiscounted,
      bd_conversion_rate: rate,
      unit_rate_bd: unitBd,
      total_cost_bd: totalCostBd,
      unit_rate_with_cf: unitWithCf,
      total_landing_cost_bd: landing,
      unit_rate_selling: unitSelling,
      selling_total_bd: sellingTotal,
      cost: landing,
      selling: sellingTotal,
    };
  }

  if (section === 'ST2') {
    const unitCost = num(line.unit_rate_bd);
    const total = qty * unitCost;
    const sellingTotal = total * (1 + num(line.margin_pct) / 100);
    return {
      total_cost_bd: total,
      total_landing_cost_bd: total,
      unit_rate_selling: qty ? sellingTotal / qty : 0,
      selling_total_bd: sellingTotal,
      cost: total,
      selling: sellingTotal,
    };
  }

  if (section === 'ST3') {
    const perDay = num(line.salary_per_month) / DAYS_PER_MONTH;
    const days = num(line.months) * DAYS_PER_MONTH + num(line.days);
    const total = qty * perDay * days;
    const ohPct = line.oh_pct === null || line.oh_pct === undefined || line.oh_pct === '' ? DEFAULT_OH_PCT : num(line.oh_pct);
    const oh = (total * ohPct) / 100;
    return { per_day_rate: perDay, total_cost_bd: total, oh, cost: total, selling: total + oh };
  }

  // ST4 - bank charges (free text + amount)
  const amount = num(line.amount);
  return { total_cost_bd: amount, cost: amount, selling: amount };
}

// lines: [{ section, ...fields }] -> per-line results (same order) and the summary block.
function calcSheet(lines) {
  const sums = { ST1: { cost: 0, selling: 0 }, ST2: { cost: 0, selling: 0 }, ST3: { cost: 0, selling: 0 }, ST4: { cost: 0, selling: 0 } };
  let oh = 0;

  const results = lines.map((line) => {
    const result = calcLine(line.section, line);
    if (sums[line.section]) {
      sums[line.section].cost += result.cost;
      sums[line.section].selling += result.selling;
    }
    if (line.section === 'ST3') oh += result.oh;
    return result;
  });

  const materialCost = sums.ST1.cost;
  const localCost = sums.ST2.cost;
  const installationCost = sums.ST3.cost;
  const bankCharges = sums.ST4.cost;
  const totalNetCost = materialCost + localCost + installationCost + oh + bankCharges;
  const totalSelling = sums.ST1.selling + sums.ST2.selling + sums.ST3.selling + sums.ST4.selling;
  const profit = totalSelling - totalNetCost;

  return {
    results,
    summary: {
      material_cost: materialCost,
      local_materials: localCost,
      installation_cost: installationCost,
      oh_charges: oh,
      bank_charges: bankCharges,
      total_net_cost: totalNetCost,
      total_selling_amount: totalSelling,
      profit_pct_on_cost: totalNetCost ? (profit / totalNetCost) * 100 : 0,
      profit_pct_on_selling: totalSelling ? (profit / totalSelling) * 100 : 0,
    },
  };
}

// MCS/ELV/26-001 (year is the 4-digit year, shown as YY).
function formatQuotationRef(department, year, number) {
  return `MCS/${String(department).toUpperCase()}/${String(year % 100).padStart(2, '0')}-${String(number).padStart(3, '0')}`;
}

// "MCS/ELV/26-824-R2" -> "MCS/ELV/26-824"
const baseQuotationRef = (ref) => String(ref || '').replace(/-R\d+$/i, '');

module.exports = { DEFAULT_RATES, DEFAULT_OH_PCT, defaultRate, calcLine, calcSheet, formatQuotationRef, baseQuotationRef };
