// Role-based access: users.permissions (JSONB) =
//   { modules: ['Documents', ...], features: { emailSummary, scheduleMeeting },
//     sidebar: { Documents: ['Document Tasks', ...] }, dataScope: 'own' | 'all' }
// Admins bypass everything. A user without a permissions object (created before this existed) keeps the legacy
// behaviour (allowed_item_types, no feature or data restrictions).

const MODULE_NAMES = ['Equipment', 'Documents', 'Vehicles', 'Projects', 'Costing Sheet', 'Attendance'];
const FEATURES = ['emailSummary', 'scheduleMeeting'];

function isAdmin(user) {
  return user?.role === 'admin';
}

// Validates and normalizes what the Users screen sends. Throws an Error with a message fit for the API response.
function sanitizePermissions(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('permissions must be an object');

  const modules = Array.isArray(input.modules) ? [...new Set(input.modules)] : [];
  if (!modules.every((name) => MODULE_NAMES.includes(name))) {
    throw new Error(`permissions.modules may only contain: ${MODULE_NAMES.join(', ')}`);
  }

  const features = {};
  for (const feature of FEATURES) features[feature] = input.features?.[feature] === true;

  const sidebar = {};
  for (const [moduleName, items] of Object.entries(input.sidebar || {})) {
    if (!modules.includes(moduleName)) continue; // sidebar access only matters for modules the user has
    if (!Array.isArray(items) || !items.every((item) => typeof item === 'string')) {
      throw new Error(`permissions.sidebar.${moduleName} must be an array of strings`);
    }
    sidebar[moduleName] = [...new Set(items)];
  }

  if (input.dataScope !== undefined && input.dataScope !== 'own' && input.dataScope !== 'all') {
    throw new Error("permissions.dataScope must be 'own' or 'all'");
  }

  return { modules, features, sidebar, dataScope: input.dataScope === 'all' ? 'all' : 'own' };
}

function hasModule(user, moduleName) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  if (user.permissions) return user.permissions.modules.includes(moduleName);
  if (moduleName === 'Projects') return (user.allowed_item_types || []).includes('Project');
  if (moduleName === 'Attendance') return false; // opt-in: administrators and users given the module explicitly
  return true;
}

function hasFeature(user, feature) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  if (user.permissions) return user.permissions.features?.[feature] === true;
  return true;
}

const requireModule = (moduleName) => (req, res, next) =>
  hasModule(req.session?.user, moduleName)
    ? next()
    : res.status(403).json({ error: `You don't have access to the ${moduleName} module` });

const requireFeature = (feature, label) => (req, res, next) =>
  hasFeature(req.session?.user, feature)
    ? next()
    : res.status(403).json({ error: `You don't have access to ${label}` });

// ---- Data visibility ("own" scope) ----------------------------------------------------------------------------

const isScoped = (req) => {
  const user = req.session?.user;
  return !!user && !isAdmin(user) && user.permissions?.dataScope === 'own';
};

const identities = (user) =>
  [user.email, user.name].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);

// SQL condition limiting assets (alias `alias`) to the ones the user is responsible for or sent in; null when the user
// is not scoped. Pushes its parameter onto `params`.
function ownCondition(req, params, alias) {
  if (!isScoped(req)) return null;
  params.push(identities(req.session.user));
  const n = params.length;
  return `(LOWER(TRIM(${alias}.responsible_person)) = ANY($${n}::text[]) OR LOWER(TRIM(${alias}.sent_by)) = ANY($${n}::text[]))`;
}

// For aggregate queries that read `assets` / `work_orders` in many places: CTEs that shadow both tables with the user's
// own rows, to be placed in the query's WITH list. '' when the user is not scoped.
function scopedCtes(req, params) {
  const condition = ownCondition(req, params, 'own_assets');
  if (!condition) return '';
  return `assets AS (SELECT own_assets.* FROM assets own_assets WHERE ${condition}), work_orders AS (SELECT * FROM work_orders WHERE asset_id IN (SELECT id FROM assets))`;
}

// True when the asset may be read/changed by the user (always true when not scoped).
async function assetInScope(pool, req, assetId) {
  const params = [Number(assetId)];
  const condition = ownCondition(req, params, 'a');
  if (!condition) return true;
  const { rows } = await pool.query(`SELECT 1 FROM assets a WHERE a.id = $1 AND ${condition}`, params);
  return rows.length > 0;
}

module.exports = {
  MODULE_NAMES,
  sanitizePermissions,
  isAdmin,
  hasModule,
  hasFeature,
  requireModule,
  requireFeature,
  isScoped,
  ownCondition,
  scopedCtes,
  assetInScope,
};
