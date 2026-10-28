// Costing sheet maths - the single source of truth for what is stored. The React form mirrors these
// formulas (client/src/lib/costing.ts) for live totals while typing; the server recomputes on every save.
//
//   ST1 foreign materials   unit rate BD = EXW x conversion rate x (1 - supplier discount %)
//                           total cost BD = qty x unit rate BD;  landing = total cost x (1 + shipping & duty %)
//                           selling rate = landing rate per unit x (1 + margin %);  selling total = rate x qty
//   ST2 local materials     total cost = qty x unit cost BD;  selling total = total cost x (1 + margin %)
//   ST3 installation/labour per day = salary / 26;  total = nos x days x per day x (1 + OH %)
//                           (days = months x 26 + days)
//   ST4 bank charges        amount, taken at cost
// Margin is a mark-up on cost. ST3 and ST4 carry no margin, so they are quoted at cost (ST3 including its OH).

const DEFAULT_RATES = { BD: 1, USD: 0.376, EUR: 0.41 };
const DEFAULT_OH_PCT = 35;
const WORKING_DAYS_PER_MONTH = 26;

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const defaultRate = (currency) => DEFAULT_RATES[String(currency || 'BD').toUpperCase()] ?? 1;

// Derived fields of one line plus `cost` (what it costs us), `selling` (what we charge) and, for ST3, `oh`.
function calcLine(section, line) {
  const qty = num(line.qty);

  if (section === 'ST1') {
    const rate = num(line.bd_conversion_rate) || defaultRate(line.currency);
    const discounted = num(line.unit_cost_exw) * (1 - num(line.supplier_discount_pct) / 100);
    const unitBd = num(line.unit_cost_exw) * rate * (1 - num(line.supplier_discount_pct) / 100);
    const totalCost = qty * unitBd;
    const unitWithCf = unitBd * (1 + num(line.shipping_duty_pct) / 100);
    const landing = totalCost * (1 + num(line.shipping_duty_pct) / 100);
    const unitSelling = unitWithCf * (1 + num(line.margin_pct) / 100);
    const sellingTotal = unitSelling * qty;
    return {
      unit_rate_discounted: discounted,
      bd_conversion_rate: rate,
      unit_rate_bd: unitBd,
      total_cost_bd: totalCost,
      unit_rate_with_cf: unitWithCf,
      total_landing_cost_bd: landing,
      unit_rate_selling: unitSelling,
      selling_total_bd: sellingTotal,
      cost: landing,
      selling: sellingTotal,
      oh: 0,
    };
  }

  if (section === 'ST2') {
    const total = qty * num(line.unit_cost_bd);
    const selling = total * (1 + num(line.margin_pct) / 100);
    return { total_cost_bd: total, selling_total_bd: selling, cost: total, selling, oh: 0 };
  }

  if (section === 'ST3') {
    const perDay = num(line.salary_per_month) / WORKING_DAYS_PER_MONTH;
    const days = num(line.months) * WORKING_DAYS_PER_MONTH + num(line.days);
    const base = num(line.nos) * days * perDay;
    const ohPct = line.oh_pct === null || line.oh_pct === undefined || line.oh_pct === '' ? DEFAULT_OH_PCT : num(line.oh_pct);
    const oh = (base * ohPct) / 100;
    return { per_day_rate: perDay, total_cost: base + oh, cost: base, selling: base + oh, oh };
  }

  const amount = num(line.amount);
  return { cost: amount, selling: amount, oh: 0 };
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
    oh += result.oh;
    return result;
  });

  const totalNetCost = sums.ST1.cost + sums.ST2.cost + sums.ST3.cost + oh + sums.ST4.cost;
  // ST3's selling figure already includes its OH, so OH is not added to the selling side a second time.
  const totalSelling = sums.ST1.selling + sums.ST2.selling + sums.ST3.selling + sums.ST4.selling;
  const profit = totalSelling - totalNetCost;

  return {
    results,
    summary: {
      st1_total_landing_cost: sums.ST1.cost,
      st2_total_cost: sums.ST2.cost,
      st3_total_cost: sums.ST3.cost,
      oh_charges: oh,
      st4_bank_charges: sums.ST4.cost,
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

module.exports = { DEFAULT_RATES, DEFAULT_OH_PCT, WORKING_DAYS_PER_MONTH, defaultRate, calcLine, calcSheet, formatQuotationRef, baseQuotationRef };
