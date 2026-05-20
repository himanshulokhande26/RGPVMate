// middleware/adminGuard.js
// Verifies the admin password from the x-admin-password request header.
// Password is stored in ADMIN_PASSWORD environment variable on Render.
'use strict';

/**
 * requireAdmin — blocks requests that don't carry the correct admin password.
 * The frontend sends: headers: { 'x-admin-password': enteredPassword }
 */
function requireAdmin(req, res, next) {
  const providedPassword = req.headers['x-admin-password'];

  if (!providedPassword) {
    return res.status(403).json({ error: 'Admin password required' });
  }

  if (providedPassword !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Invalid admin password' });
  }

  next();
}

module.exports = { requireAdmin };
