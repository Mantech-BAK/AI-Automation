const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const { pool } = require('../db');
const { graphRequest } = require('../graph/client');
const { createTaskForWorkOrder, resolveEmailChain } = require('../jobs/dailyCheck');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const router = express.Router();
const {
  SERVICE_ACCOUNT_EMAIL,
} = process.env;

async function sendApprovalRequestEmail(workOrder, asset) {
  // No hardcoded manager address - resolves the asset's responsible person
  // (falling back through their manager, then the first admin user).
  const { to } = await resolveEmailChain(asset.responsible_person);

  const body = {
    message: {
      subject: `Approval needed: work order ${workOrder.id}`,
      body: {
        contentType: 'Text',
        content: `A new work order requires approval.\n\nEquipment: ${asset.equipment_name}\nSite: ${asset.site_location}\nReason: ${workOrder.notes || 'No reason provided'}\nEstimated duration: ${workOrder.estimated_duration_hours || 'N/A'} hours\nWork order ID: ${workOrder.id}\n\nPlease review and approve or reject this work order.`,
      },
      toRecipients: to ? [
        {
          emailAddress: {
            address: to,
          },
        },
      ] : [],
    },
    saveToSentItems: 'true',
  };

  await graphRequest('POST', '/me/sendMail', body, 'delegated');
}

router.post('/create', async (req, res) => {
  try {
    const { equipment_name, site_location, reason, estimated_duration } = req.body;

    if (!equipment_name || !site_location) {
      return res.status(400).json({ error: 'Equipment name and site location are required' });
    }

    const assetResult = await pool.query(
      `SELECT * FROM assets WHERE equipment_name = $1 AND site_location ILIKE $2 LIMIT 1`,
      [equipment_name, site_location]
    );

    if (!assetResult.rows.length) {
      return res.status(404).json({ error: 'Asset not found for provided equipment and location' });
    }

    const asset = assetResult.rows[0];
    const dueDate = asset.next_due_date || null;

    const { rows } = await pool.query(
      `INSERT INTO work_orders (status, asset_id, notes, due_date, estimated_duration_hours)
       VALUES ('pending', $1, $2, $3, $4)
       RETURNING *`,
      [asset.id, reason || null, dueDate, estimated_duration || null]
    );

    const createdWorkOrder = rows[0];
    await sendApprovalRequestEmail(createdWorkOrder, asset);

    return res.status(201).json(createdWorkOrder);
  } catch (error) {
    console.error('Create work order failed:', error);
    return res.status(500).json({ error: 'Failed to create work order' });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: existingRows } = await pool.query(`SELECT * FROM work_orders WHERE id = $1 LIMIT 1`, [id]);
    const existing = existingRows[0];

    if (!existing) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    if (existing.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending requests can be approved' });
    }

    await pool.query(`UPDATE work_orders SET status = 'approved' WHERE id = $1`, [id]);
    await createTaskForWorkOrder(id);

    return res.json({ success: true, message: 'Work order approved and task flow triggered' });
  } catch (error) {
    console.error('Approve work order failed:', error);
    return res.status(500).json({ error: 'Failed to approve work order' });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const { rows } = await pool.query(
      `UPDATE work_orders
       SET status = 'rejected', notes = COALESCE(notes || '\n', '') || $2
       WHERE id = $1
       RETURNING *`,
      [id, `Rejection reason: ${reason}`]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    return res.json({ success: true, work_order: rows[0] });
  } catch (error) {
    console.error('Reject work order failed:', error);
    return res.status(500).json({ error: 'Failed to reject work order' });
  }
});

router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: existingRows } = await pool.query(
      `SELECT wo.*, a.id AS asset_id, a.maintenance_interval_days, a.frequency_days, a.expiry_date
       FROM work_orders wo
       JOIN assets a ON a.id = wo.asset_id
       WHERE wo.id = $1
       LIMIT 1`,
      [id]
    );
    const existing = existingRows[0];

    if (!existing) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    if (existing.status === 'completed') {
      return res.status(400).json({ error: 'Work order is already completed' });
    }

    const { rows } = await pool.query(
      `UPDATE work_orders SET status = 'completed', completed_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    if (existing.task_type === 'document') {
      // Renewing a document: the next expiry is calculated from the OLD
      // expiry date plus the renewal frequency - not from today - so the
      // renewal cycle stays anchored to the document's actual expiry
      // schedule even if it's renewed early or late. registration_date is
      // left untouched (it records when the document was first registered,
      // not each renewal).
      const frequencyDays = existing.frequency_days || 365;
      const oldExpiryDate = existing.expiry_date;
      const { rows: renewedRows } = await pool.query(
        `UPDATE assets
         SET last_completed_date = CURRENT_DATE,
             next_due_date = COALESCE(expiry_date, CURRENT_DATE) + ($1 || ' days')::interval,
             expiry_date = COALESCE(expiry_date, CURRENT_DATE) + ($1 || ' days')::interval
         WHERE id = $2
         RETURNING expiry_date`,
        [frequencyDays, existing.asset_id]
      );
      const newExpiryDate = renewedRows[0]?.expiry_date;
      console.log(`Document renewed. Old expiry: ${oldExpiryDate}. New expiry: ${newExpiryDate}. Frequency: ${frequencyDays} days.`);
    } else {
      await pool.query(
        `UPDATE assets
         SET last_completed_date = CURRENT_DATE,
             next_due_date = CURRENT_DATE + ($1 || ' days')::interval
         WHERE id = $2`,
        [existing.maintenance_interval_days, existing.asset_id]
      );
    }

    return res.json({ success: true, work_order: rows[0] });
  } catch (error) {
    console.error('Complete work order failed:', error);
    return res.status(500).json({ error: 'Failed to complete work order' });
  }
});

router.get('/pending', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT wo.*, a.equipment_name, a.site_location, a.next_due_date, a.maintenance_interval_days
      FROM work_orders wo
      JOIN assets a ON a.id = wo.asset_id
      WHERE wo.status = 'pending'
      ORDER BY wo.created_at DESC
    `);

    return res.json(rows);
  } catch (error) {
    console.error('Get pending work orders failed:', error);
    return res.status(500).json({ error: 'Failed to load pending work orders' });
  }
});

module.exports = router;