const express = require('express');
const { pool } = require('../db');
const { toTitleCase } = require('../utils/text');
const { VEHICLE_CATEGORIES } = require('../utils/vehicleCategories');
const { completeDocumentAsset } = require('../utils/assetCompletion');

const router = express.Router();

// Vehicles are no longer their own table - a "vehicle" is an Equipment-type
// asset tagged with one of VEHICLE_CATEGORIES, and its documents (insurance,
// registration, etc.) are Document-type assets linked back via
// parent_asset_id. This file exists purely so old callers (MaintenanceTasksPage,
// TechniciansPage, and this API's own previous shape) keep working against
// /api/dashboard/assets under the hood, without needing to be rewritten.

async function findVehicleCategoryId(categoryName) {
  if (!categoryName) return null;
  const { rows } = await pool.query(
    `SELECT id FROM asset_categories WHERE name = $1 AND name = ANY($2::text[])`,
    [categoryName, VEHICLE_CATEGORIES]
  );
  return rows[0]?.id || null;
}

async function getEquipmentTypeId() {
  const { rows } = await pool.query(`SELECT id FROM asset_types WHERE name = 'Equipment'`);
  return rows[0]?.id || null;
}

async function getDocumentTypeId() {
  const { rows } = await pool.query(`SELECT id FROM asset_types WHERE name = 'Document'`);
  return rows[0]?.id || null;
}

function mapVehicleRow(row) {
  return {
    id: row.id,
    vehicle_no: row.equipment_name,
    vehicle_name: row.equipment_name,
    vehicle_type: row.category_name || null,
    model: null,
    cr_no: null,
    department: row.department,
    site_location: row.site_location,
    incharge: row.responsible_person,
    remarks: row.remarks,
    total_tasks: Number(row.total_tasks || 0),
    expired_tasks: Number(row.expired_tasks || 0),
    expiring_tasks: Number(row.expiring_tasks || 0),
  };
}

function mapTaskRow(row) {
  return {
    id: row.id,
    vehicle_id: row.parent_asset_id,
    vehicle_no: row.vehicle_no,
    vehicle_name: row.vehicle_name,
    department: row.department,
    site_location: row.site_location,
    task_name: row.equipment_name,
    task_type: row.equipment_name,
    expiry_date: row.expiry_date,
    registration_date: row.registration_date,
    reminder_days: row.reminder_days,
    frequency_days: row.frequency_days,
    status: row.status || 'open',
    planner_task_id: row.planner_task_id || null,
    completed_at: row.completed_at || null,
    notes: row.remarks,
    created_at: row.created_at,
  };
}

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        v.*,
        ac.name AS category_name,
        COUNT(child.id)::int AS total_tasks,
        COUNT(child.id) FILTER (WHERE child.expiry_date IS NOT NULL AND child.expiry_date < CURRENT_DATE)::int AS expired_tasks,
        COUNT(child.id) FILTER (WHERE child.expiry_date IS NOT NULL AND child.expiry_date >= CURRENT_DATE AND child.expiry_date <= CURRENT_DATE + INTERVAL '30 days')::int AS expiring_tasks
      FROM assets v
      JOIN asset_types t ON t.id = v.type_id AND t.name = 'Equipment'
      JOIN asset_categories ac ON ac.id = v.category_id AND ac.name = ANY($1::text[])
      LEFT JOIN assets child ON child.parent_asset_id = v.id
      GROUP BY v.id, ac.name
      ORDER BY v.equipment_name
    `,
      [VEHICLE_CATEGORIES]
    );
    return res.json(rows.map(mapVehicleRow));
  } catch (error) {
    console.error('Load vehicles failed:', error);
    return res.status(500).json({ error: 'Failed to load vehicles' });
  }
});

router.get('/tasks/upcoming', async (req, res) => {
  try {
    const days = req.query.days ? Number(req.query.days) : 30;
    const { rows } = await pool.query(
      `
      SELECT
        child.*,
        v.equipment_name AS vehicle_no,
        v.equipment_name AS vehicle_name,
        v.department,
        v.site_location,
        COALESCE(wo.status, 'open') AS status,
        wo.planner_task_id,
        wo.completed_at
      FROM assets child
      JOIN assets v ON v.id = child.parent_asset_id
      JOIN asset_types ct ON ct.id = child.type_id AND ct.name = 'Document'
      LEFT JOIN LATERAL (
        SELECT wo.status, wo.planner_task_id, wo.completed_at
        FROM work_orders wo
        WHERE wo.asset_id = child.id
        ORDER BY wo.created_at DESC
        LIMIT 1
      ) wo ON true
      WHERE child.expiry_date IS NOT NULL
        AND child.expiry_date <= CURRENT_DATE + ($1 || ' days')::INTERVAL
        AND COALESCE(wo.status, 'open') != 'completed'
      ORDER BY child.expiry_date ASC NULLS LAST
    `,
      [days]
    );
    return res.json(rows.map(mapTaskRow));
  } catch (error) {
    console.error('Load upcoming vehicle tasks failed:', error);
    return res.status(500).json({ error: 'Failed to load upcoming vehicle tasks' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: vehicleRows } = await pool.query(
      `SELECT v.*, ac.name AS category_name
       FROM assets v
       LEFT JOIN asset_categories ac ON ac.id = v.category_id
       WHERE v.id = $1`,
      [id]
    );
    const vehicle = vehicleRows[0];

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const { rows: taskRows } = await pool.query(
      `
      SELECT
        child.*,
        v.equipment_name AS vehicle_no,
        v.equipment_name AS vehicle_name,
        v.department,
        v.site_location,
        COALESCE(wo.status, 'open') AS status,
        wo.planner_task_id,
        wo.completed_at
      FROM assets child
      JOIN assets v ON v.id = child.parent_asset_id
      LEFT JOIN LATERAL (
        SELECT wo.status, wo.planner_task_id, wo.completed_at
        FROM work_orders wo
        WHERE wo.asset_id = child.id
        ORDER BY wo.created_at DESC
        LIMIT 1
      ) wo ON true
      WHERE child.parent_asset_id = $1
      ORDER BY child.expiry_date NULLS LAST, child.id
    `,
      [id]
    );

    return res.json({ ...mapVehicleRow(vehicle), tasks: taskRows.map(mapTaskRow) });
  } catch (error) {
    console.error('Load vehicle failed:', error);
    return res.status(500).json({ error: 'Failed to load vehicle' });
  }
});

router.post('/add', async (req, res) => {
  try {
    const { vehicle_no, vehicle_name, vehicle_type, model, cr_no, department, site_location, incharge, remarks } = req.body;

    if (!vehicle_no || !vehicle_name) {
      return res.status(400).json({ error: 'vehicle_no and vehicle_name are required' });
    }

    const typeId = await getEquipmentTypeId();
    const categoryId = await findVehicleCategoryId(vehicle_type);

    const remarksParts = [
      remarks || null,
      vehicle_no !== vehicle_name ? `Vehicle No: ${vehicle_no}` : null,
      model ? `Model: ${model}` : null,
      cr_no ? `CR No: ${cr_no}` : null,
    ].filter(Boolean);

    const { rows } = await pool.query(
      `INSERT INTO assets (equipment_name, type_id, category_id, department, site_location, responsible_person, remarks, frequency_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        vehicle_name,
        typeId,
        categoryId,
        toTitleCase(department) || null,
        toTitleCase(site_location) || null,
        incharge || null,
        remarksParts.join('\n') || null,
        365,
      ]
    );

    return res.status(201).json(mapVehicleRow({ ...rows[0], category_name: vehicle_type || null, total_tasks: 0, expired_tasks: 0, expiring_tasks: 0 }));
  } catch (error) {
    console.error('Add vehicle failed:', error);
    return res.status(500).json({ error: 'Failed to add vehicle' });
  }
});

router.put('/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicle_name, vehicle_type, department, site_location, incharge, remarks } = req.body;

    const categoryId = await findVehicleCategoryId(vehicle_type);

    const { rows } = await pool.query(
      `UPDATE assets SET
         equipment_name = $1,
         category_id = COALESCE($2, category_id),
         department = $3,
         site_location = $4,
         responsible_person = $5,
         remarks = $6
       WHERE id = $7
       RETURNING *`,
      [
        vehicle_name,
        categoryId,
        toTitleCase(department) || null,
        toTitleCase(site_location) || null,
        incharge || null,
        remarks || null,
        id,
      ]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    return res.json(mapVehicleRow({ ...rows[0], total_tasks: 0, expired_tasks: 0, expiring_tasks: 0 }));
  } catch (error) {
    console.error('Update vehicle failed:', error);
    return res.status(500).json({ error: 'Failed to update vehicle' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // ON DELETE CASCADE on assets.parent_asset_id removes the vehicle's
    // document assets (insurance, registration, etc.) along with it.
    const { rows } = await pool.query(`DELETE FROM assets WHERE id = $1 RETURNING id`, [id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete vehicle failed:', error);
    return res.status(500).json({ error: 'Failed to delete vehicle' });
  }
});

router.get('/:id/tasks', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `
      SELECT
        child.*,
        v.equipment_name AS vehicle_no,
        v.equipment_name AS vehicle_name,
        v.department,
        v.site_location,
        COALESCE(wo.status, 'open') AS status,
        wo.planner_task_id,
        wo.completed_at
      FROM assets child
      JOIN assets v ON v.id = child.parent_asset_id
      LEFT JOIN LATERAL (
        SELECT wo.status, wo.planner_task_id, wo.completed_at
        FROM work_orders wo
        WHERE wo.asset_id = child.id
        ORDER BY wo.created_at DESC
        LIMIT 1
      ) wo ON true
      WHERE child.parent_asset_id = $1
      ORDER BY child.expiry_date NULLS LAST, child.id
    `,
      [id]
    );
    return res.json(rows.map(mapTaskRow));
  } catch (error) {
    console.error('Load vehicle tasks failed:', error);
    return res.status(500).json({ error: 'Failed to load vehicle tasks' });
  }
});

router.post('/:id/tasks/add', async (req, res) => {
  try {
    const { id } = req.params;
    const { task_name, expiry_date, registration_date, reminder_days, frequency_days } = req.body;

    if (!task_name) {
      return res.status(400).json({ error: 'task_name is required' });
    }

    const { rows: vehicleRows } = await pool.query(`SELECT * FROM assets WHERE id = $1`, [id]);
    const vehicle = vehicleRows[0];
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const documentTypeId = await getDocumentTypeId();

    const { rows } = await pool.query(
      `INSERT INTO assets (
         equipment_name, type_id, category_id, department, site_location,
         responsible_person, expiry_date, registration_date, reminder_days,
         frequency_days, parent_asset_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        task_name,
        documentTypeId,
        vehicle.category_id,
        vehicle.department,
        vehicle.site_location,
        vehicle.responsible_person,
        expiry_date || null,
        registration_date || null,
        reminder_days || 30,
        frequency_days || 365,
        id,
      ]
    );

    return res.status(201).json(
      mapTaskRow({
        ...rows[0],
        vehicle_no: vehicle.equipment_name,
        vehicle_name: vehicle.equipment_name,
        status: 'open',
      })
    );
  } catch (error) {
    console.error('Add vehicle task failed:', error);
    return res.status(500).json({ error: 'Failed to add vehicle task' });
  }
});

router.put('/tasks/:task_id/update', async (req, res) => {
  try {
    const { task_id } = req.params;
    const { task_name, expiry_date, registration_date, reminder_days, frequency_days } = req.body;

    const { rows } = await pool.query(
      `UPDATE assets SET
         equipment_name = COALESCE($1, equipment_name),
         expiry_date = $2,
         registration_date = $3,
         reminder_days = COALESCE($4, reminder_days),
         frequency_days = COALESCE($5, frequency_days)
       WHERE id = $6 AND parent_asset_id IS NOT NULL
       RETURNING *`,
      [task_name || null, expiry_date || null, registration_date || null, reminder_days || null, frequency_days || null, task_id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Vehicle task not found' });
    }

    return res.json(mapTaskRow({ ...rows[0], status: 'open' }));
  } catch (error) {
    console.error('Update vehicle task failed:', error);
    return res.status(500).json({ error: 'Failed to update vehicle task' });
  }
});

router.put('/tasks/:task_id/complete', async (req, res) => {
  try {
    const { task_id } = req.params;

    const { rows: assetRows } = await pool.query(
      `SELECT * FROM assets WHERE id = $1 AND parent_asset_id IS NOT NULL`,
      [task_id]
    );
    const asset = assetRows[0];

    if (!asset) {
      return res.status(404).json({ error: 'Vehicle task not found' });
    }

    const { rows: openOrderRows } = await pool.query(
      `SELECT * FROM work_orders WHERE asset_id = $1 AND status NOT IN ('completed', 'rejected') ORDER BY created_at DESC LIMIT 1`,
      [task_id]
    );
    const openOrder = openOrderRows[0];

    if (openOrder) {
      await pool.query(`UPDATE work_orders SET status = 'completed', completed_at = NOW() WHERE id = $1`, [openOrder.id]);
    }

    const renewedAsset = await completeDocumentAsset(task_id, openOrder?.due_date || null);

    return res.json(
      mapTaskRow({
        ...renewedAsset,
        vehicle_no: null,
        vehicle_name: null,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error('Complete vehicle task failed:', error);
    return res.status(500).json({ error: 'Failed to complete vehicle task' });
  }
});

router.delete('/tasks/:task_id', async (req, res) => {
  try {
    const { task_id } = req.params;
    const { rows } = await pool.query(
      `DELETE FROM assets WHERE id = $1 AND parent_asset_id IS NOT NULL RETURNING id`,
      [task_id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Vehicle task not found' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete vehicle task failed:', error);
    return res.status(500).json({ error: 'Failed to delete vehicle task' });
  }
});

module.exports = router;
