const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../db');
const { updateEnvFile } = require('../graph/client');

const router = express.Router();

// Must exactly match the delegatedScopes list in graph/client.js and the
// SCOPES list in get-refresh-token.js.
const DELEGATED_SCOPES = [
  'https://graph.microsoft.com/ChannelMessage.Send',
  'https://graph.microsoft.com/Tasks.ReadWrite',
  'https://graph.microsoft.com/OnlineMeetings.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'offline_access',
].join(' ');
const DELEGATED_REDIRECT_URI = 'http://localhost:3000/api/auth/microsoft/callback';

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { rows } = await pool.query(
      `SELECT id, email, name, role, allowed_departments, allowed_item_types, allowed_categories, password_hash
       FROM users WHERE email = $1`,
      [email]
    );

    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      allowed_departments: user.allowed_departments || [],
      allowed_item_types: user.allowed_item_types || [],
      allowed_categories: user.allowed_categories || [],
    };

    return res.json({ success: true, user: req.session.user });
  } catch (error) {
    console.error('Login failed:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', (req, res) => {
  if (!req.session) {
    return res.json({ success: true });
  }

  req.session.destroy((err) => {
    if (err) {
      console.error('Logout failed:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }

    res.json({ success: true });
  });
});

router.get('/me', (req, res) => {
  const user = req.session?.user;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return res.json({ success: true, user });
});

// One-time setup endpoint used by get-refresh-token.js: exchanges the
// authorization code Microsoft redirects back with for a delegated refresh
// token, saves it to .env as DELEGATED_REFRESH_TOKEN (so getDelegatedToken()
// in graph/client.js can use it instead of the deprecated ROPC
// username/password flow), and prints it to the console.
router.get('/microsoft/callback', async (req, res) => {
  try {
    const { code, error: oauthError, error_description: oauthErrorDescription } = req.query;

    if (oauthError) {
      console.error('Microsoft OAuth error:', oauthError, oauthErrorDescription);
      return res.redirect(`/index.html?microsoft_error=${encodeURIComponent(oauthErrorDescription || oauthError)}`);
    }

    if (!code) {
      return res.redirect('/index.html?microsoft_error=missing_code');
    }

    const { TENANT_ID, CLIENT_ID, CLIENT_SECRET } = process.env;

    if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
      console.error('Missing TENANT_ID, CLIENT_ID, or CLIENT_SECRET in environment');
      return res.redirect('/index.html?microsoft_error=missing_config');
    }

    const tokenParams = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: DELEGATED_REDIRECT_URI,
      scope: DELEGATED_SCOPES,
    });

    const tokenResponse = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    const tokenJson = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', tokenJson.error, tokenJson.error_description);
      return res.redirect('/index.html?microsoft_error=token_exchange_failed');
    }

    if (!tokenJson.refresh_token) {
      console.error('Token response did not include a refresh_token - make sure offline_access was included in the requested scopes.');
      return res.redirect('/index.html?microsoft_error=no_refresh_token');
    }

    process.env.DELEGATED_REFRESH_TOKEN = tokenJson.refresh_token;
    updateEnvFile('DELEGATED_REFRESH_TOKEN', tokenJson.refresh_token);

    console.log('');
    console.log('=== Delegated refresh token acquired and saved to .env as DELEGATED_REFRESH_TOKEN ===');
    console.log(tokenJson.refresh_token);
    console.log('');
    console.log('Restart node index.js so the new token is picked up everywhere it is used.');
    console.log('');

    return res.redirect('/index.html');
  } catch (error) {
    console.error('Microsoft OAuth callback failed:', error.message, error.stack);
    return res.redirect('/index.html?microsoft_error=callback_failed');
  }
});

module.exports = router;
