const express = require('express');
const { processEmailContent } = require('../jobs/emailProcessor');

const router = express.Router();

router.post('/process', async (req, res) => {
  try {
    const { emailBody } = req.body;

    if (!emailBody || typeof emailBody !== 'string' || !emailBody.trim()) {
      return res.status(400).json({ error: 'emailBody is required' });
    }

    const result = await processEmailContent(emailBody, {
      messageId: `manual-${Date.now()}`,
      sender: req.body.sender || null,
      subject: req.body.subject || null,
      dateReceived: req.body.dateReceived || null,
    });

    return res.json(result);
  } catch (error) {
    console.error('Email processing endpoint failed:', error);
    return res.status(500).json({ error: 'Failed to process email' });
  }
});

module.exports = router;
