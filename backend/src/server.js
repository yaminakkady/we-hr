'use strict';

/**
 * We HR — Production-Oriented HTTP API Server & Static Web Dashboard Host
 * Zero paid external dependencies. Runs natively on Node.js 24.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { createDatabase } = require('./db/database');
const { seedDatabase } = require('./db/seed');
const { verifyJwt } = require('./security/auth');
const { HrService } = require('./services/hr_service');
const { ROLES } = require('./domain/rbac');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Reads and parses a JSON request body safely with a max payload limit (1MB).
 */
function readJsonBody(req, maxBytes = 1048576) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('INVALID_JSON_BODY'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

/**
 * Creates a configured We HR HTTP server instance.
 * @param {import('node:sqlite').DatabaseSync} [customDb]
 */
function createAppServer(customDb) {
  const db = customDb || createDatabase();
  seedDatabase(db);
  const service = new HrService(db);

  // Simple in-memory IP rate limiter
  const rateBuckets = new Map();
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
  const maxReqs = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 180);

  function checkRateLimit(ip) {
    const now = Date.now();
    const record = rateBuckets.get(ip);
    if (!record || now - record.start > windowMs) {
      rateBuckets.set(ip, { start: now, count: 1 });
      return true;
    }
    record.count += 1;
    return record.count <= maxReqs;
  }

  function authenticateRequest(req) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return { ok: false, status: 401, code: 'MISSING_BEARER_TOKEN', message: 'Authorization Bearer token required.' };
    }
    const token = authHeader.slice(7).trim();
    const verified = verifyJwt(token);
    if (!verified.valid) {
      return { ok: false, status: 401, code: verified.reason, message: `Invalid or expired session (${verified.reason}).` };
    }
    return service.validateSessionActor(verified.payload);
  }

  const webRoot = path.join(__dirname, '..', '..', 'web');

  const server = http.createServer(async (req, res) => {
    // Behind a hosting proxy (Render, etc.) every request arrives from the proxy's address,
    // so the original client IP is taken from X-Forwarded-For when TRUST_PROXY=true.
    const forwardedFor = process.env.TRUST_PROXY === 'true' ? String(req.headers['x-forwarded-for'] || '') : '';
    const ip = forwardedFor.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
    if (!checkRateLimit(ip)) {
      return sendJson(res, 429, {
        ok: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please wait a moment and try again.',
      });
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    try {
      // ----------------------------------------------------------------------
      // PUBLIC API ENDPOINTS
      // ----------------------------------------------------------------------
      if (pathname === '/api/health' && method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          service: 'We HR Enterprise Multi-Tenant API',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        });
      }

      if (pathname === '/api/auth/login' && method === 'POST') {
        const body = await readJsonBody(req);
        const result = service.login({
          email: body.email,
          password: body.password,
          ipAddress: ip,
        });
        return sendJson(res, result.status, result);
      }

      // Demo quick-switch accounts list (for local evaluation convenience)
      if (pathname === '/api/auth/demo-accounts' && method === 'GET') {
        const accounts = db
          .prepare(`
            SELECT u.email, u.role, c.name_en AS company_name_en, c.name_ar AS company_name_ar,
                   e.full_name_en, e.full_name_ar, e.employee_code
            FROM users u
            LEFT JOIN companies c ON c.id = u.company_id
            LEFT JOIN employees e ON e.user_id = u.id
            WHERE u.is_active = 1
            ORDER BY u.company_id NULLS LAST, u.role ASC
          `)
          .all();
        return sendJson(res, 200, { ok: true, accounts });
      }

      // ----------------------------------------------------------------------
      // PROTECTED API ENDPOINTS
      // ----------------------------------------------------------------------
      if (pathname.startsWith('/api/')) {
        const auth = authenticateRequest(req);
        if (!auth.ok) {
          return sendJson(res, auth.status, auth);
        }
        const actor = auth.actor;

        if (pathname === '/api/auth/me' && method === 'GET') {
          return sendJson(res, 200, {
            ok: true,
            actor,
            employee: auth.employee ? service.formatEmployee(auth.employee) : null,
          });
        }

        // Employee Mobile Attendance Context
        if (pathname === '/api/employee/context' && method === 'GET') {
          const result = service.getEmployeeAttendanceContext(actor);
          return sendJson(res, result.status, result);
        }

        // Submit Attendance Event (Check-in, Check-out, Break, Field Visit, Offline Sync)
        if (pathname === '/api/attendance/events' && method === 'POST') {
          const body = await readJsonBody(req);
          const result = service.submitAttendanceEvent(actor, body);
          return sendJson(res, result.status, result);
        }

        // Review Pending / Exception Attendance Event
        if (pathname === '/api/attendance/review' && method === 'POST') {
          const body = await readJsonBody(req);
          const result = service.reviewAttendanceEvent(actor, body);
          return sendJson(res, result.status, result);
        }

        // Manual Attendance Correction (Immutable Adjustment)
        if (pathname === '/api/attendance/corrections' && method === 'POST') {
          const body = await readJsonBody(req);
          const result = service.applyManualAttendanceCorrection(actor, body);
          return sendJson(res, result.status, result);
        }

        // List Attendance Corrections
        if (pathname === '/api/attendance/corrections' && method === 'GET') {
          if (!actor.company_id) {
            return sendJson(res, 403, { ok: false, code: 'TENANT_REQUIRED' });
          }
          const rows = db
            .prepare(`
              SELECT ac.*, e.full_name_en, e.full_name_ar, e.employee_code, u.email AS approver_email
              FROM attendance_corrections ac
              JOIN employees e ON e.id = ac.employee_id
              LEFT JOIN users u ON u.id = ac.approved_by
              WHERE ac.company_id = ?
              ORDER BY ac.created_at DESC
            `)
            .all(actor.company_id);
          return sendJson(res, 200, { ok: true, corrections: rows });
        }

        // Dashboard Overview
        if (pathname === '/api/dashboard/overview' && method === 'GET') {
          const result = service.getDashboardOverview(actor, {
            date: parsedUrl.searchParams.get('date') || undefined,
          });
          return sendJson(res, result.status, result);
        }

        // Attendance Register
        if (pathname === '/api/attendance/register' && method === 'GET') {
          const result = service.listAttendanceRegister(actor, {
            date: parsedUrl.searchParams.get('date') || undefined,
            branchId: parsedUrl.searchParams.get('branchId') || undefined,
            employeeId: parsedUrl.searchParams.get('employeeId') || undefined,
          });
          return sendJson(res, result.status, result);
        }

        // Attendance CSV Export
        if (pathname === '/api/attendance/export.csv' && method === 'GET') {
          const result = service.exportAttendanceCsv(actor, {
            date: parsedUrl.searchParams.get('date') || undefined,
            branchId: parsedUrl.searchParams.get('branchId') || undefined,
          });
          if (!result.ok) {
            return sendJson(res, result.status, result);
          }
          res.writeHead(200, {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="we_hr_attendance_${new Date().toISOString().slice(0, 10)}.csv"`,
          });
          res.end(result.csvContent);
          return;
        }

        // Employees List & Create
        if (pathname === '/api/employees' && method === 'GET') {
          const result = service.listEmployees(actor, {
            companyId: parsedUrl.searchParams.get('companyId') || undefined,
            branchId: parsedUrl.searchParams.get('branchId') || undefined,
            departmentId: parsedUrl.searchParams.get('departmentId') || undefined,
          });
          return sendJson(res, result.status, result);
        }

        if (pathname === '/api/employees' && method === 'POST') {
          const body = await readJsonBody(req);
          const result = service.createEmployee(actor, body);
          return sendJson(res, result.status, result);
        }

        if (pathname === '/api/employees/status' && method === 'POST') {
          const body = await readJsonBody(req);
          const result = service.setEmployeeActiveStatus(actor, body);
          return sendJson(res, result.status, result);
        }

        if (pathname === '/api/employees/import-csv' && method === 'POST') {
          const body = await readJsonBody(req);
          const result = service.importEmployeesFromCsv(actor, body.csvText);
          return sendJson(res, result.status, result);
        }

        // Workplaces List & Create
        if (pathname === '/api/workplaces' && method === 'GET') {
          const result = service.listWorkplaces(actor);
          return sendJson(res, result.status, result);
        }

        if (pathname === '/api/workplaces' && method === 'POST') {
          const body = await readJsonBody(req);
          const result = service.createWorkplace(actor, body);
          return sendJson(res, result.status, result);
        }

        // Reference Data (Branches, Departments, Shifts, Holidays)
        if (pathname === '/api/reference-data' && method === 'GET') {
          if (!actor.company_id) {
            return sendJson(res, 403, { ok: false, code: 'TENANT_REQUIRED' });
          }
          const branches = db.prepare('SELECT * FROM branches WHERE company_id = ?').all(actor.company_id);
          const departments = db.prepare('SELECT * FROM departments WHERE company_id = ?').all(actor.company_id);
          const shifts = db.prepare('SELECT * FROM work_shifts WHERE company_id = ?').all(actor.company_id);
          const holidays = db.prepare('SELECT * FROM holidays WHERE company_id = ? ORDER BY holiday_date ASC').all(actor.company_id);
          return sendJson(res, 200, { ok: true, branches, departments, shifts, holidays });
        }

        // Leave Requests
        if (pathname === '/api/leaves' && method === 'GET') {
          const result = service.listLeaveRequests(actor);
          return sendJson(res, result.status, result);
        }

        if (pathname === '/api/leaves' && method === 'POST') {
          const body = await readJsonBody(req);
          const result = service.submitLeaveRequest(actor, body);
          return sendJson(res, result.status, result);
        }

        if (pathname === '/api/leaves/decide' && method === 'POST') {
          const body = await readJsonBody(req);
          const result = service.decideLeaveRequest(actor, body);
          return sendJson(res, result.status, result);
        }

        // Approved Devices
        if (pathname === '/api/devices' && method === 'GET') {
          const result = service.listDevices(actor);
          return sendJson(res, result.status, result);
        }

        if (pathname === '/api/devices/status' && method === 'POST') {
          const body = await readJsonBody(req);
          const result = service.updateDeviceStatus(actor, body);
          return sendJson(res, result.status, result);
        }

        // Subscriptions & Payments
        if (pathname === '/api/subscriptions' && method === 'GET') {
          if (actor.role === ROLES.PLATFORM_SUPER_ADMIN) {
            const tenants = db
              .prepare(`
                SELECT c.*, cs.status AS sub_status, cs.expiry_date, cs.grace_period_days,
                       sp.name_en AS plan_name_en, sp.name_ar AS plan_name_ar, sp.max_employees
                FROM companies c
                LEFT JOIN company_subscriptions cs ON cs.company_id = c.id
                LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
              `)
              .all();
            const payments = db
              .prepare(`
                SELECT pr.*, c.name_en AS company_name_en, c.name_ar AS company_name_ar
                FROM payment_records pr
                JOIN companies c ON c.id = pr.company_id
                ORDER BY pr.created_at DESC
              `)
              .all();
            return sendJson(res, 200, { ok: true, tenants, payments });
          }

          if (!actor.company_id) {
            return sendJson(res, 403, { ok: false, code: 'TENANT_REQUIRED' });
          }
          const subscription = service.getCompanySubscription(actor.company_id);
          const payments = db
            .prepare('SELECT * FROM payment_records WHERE company_id = ? ORDER BY created_at DESC')
            .all(actor.company_id);
          const plans = db.prepare('SELECT * FROM subscription_plans WHERE is_active = 1').all();
          return sendJson(res, 200, { ok: true, subscription, payments, plans });
        }

        if (pathname === '/api/subscriptions/payments' && method === 'POST') {
          const body = await readJsonBody(req);
          const result = service.submitManualPayment(actor, body);
          return sendJson(res, result.status, result);
        }

        if (pathname === '/api/subscriptions/verify-payment' && method === 'POST') {
          const body = await readJsonBody(req);
          const result = service.verifyManualPayment(actor, body);
          return sendJson(res, result.status, result);
        }

        // Audit Logs
        if (pathname === '/api/audit-logs' && method === 'GET') {
          if (actor.role === ROLES.PLATFORM_SUPER_ADMIN) {
            const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();
            return sendJson(res, 200, { ok: true, auditLogs: logs });
          }
          if (!actor.company_id || ![ROLES.COMPANY_OWNER, ROLES.HR_ADMIN].includes(actor.role)) {
            return sendJson(res, 403, { ok: false, code: 'FORBIDDEN' });
          }
          const logs = db
            .prepare('SELECT * FROM audit_logs WHERE company_id = ? ORDER BY created_at DESC LIMIT 100')
            .all(actor.company_id);
          return sendJson(res, 200, { ok: true, auditLogs: logs });
        }

        return sendJson(res, 404, { ok: false, code: 'ENDPOINT_NOT_FOUND', message: `Unknown API route: ${method} ${pathname}` });
      }

      // ----------------------------------------------------------------------
      // STATIC WEB DASHBOARD & MOBILE SIMULATOR SERVING
      // ----------------------------------------------------------------------
      let relativePath = pathname === '/' ? '/index.html' : pathname;
      const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.join(webRoot, safePath);

      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const content = fs.readFileSync(fullPath);
        res.writeHead(200, {
          'Content-Type': contentType,
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(content);
        return;
      }

      // Fallback to index.html for SPA navigation
      const indexFile = path.join(webRoot, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(indexFile));
        return;
      }

      sendJson(res, 404, { ok: false, message: 'Not Found' });
    } catch (err) {
      if (err.message === 'INVALID_JSON_BODY') {
        return sendJson(res, 400, { ok: false, code: 'INVALID_JSON', message: 'Malformed JSON body.' });
      }
      if (err.message === 'PAYLOAD_TOO_LARGE') {
        return sendJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 1MB limit.' });
      }
      return sendJson(res, 500, {
        ok: false,
        code: 'INTERNAL_SERVER_ERROR',
        message: err.message || 'Unexpected server error.',
      });
    }
  });

  return { server, db, service };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    // Never fall back to the built-in development secret in production: generate a random
    // one once and keep it next to the database so sessions survive ordinary restarts.
    const secretFile = path.join(
      path.dirname(process.env.SQLITE_DB_PATH || path.join(__dirname, '..', '..', 'data', 'we_hr.db')),
      '.jwt_secret'
    );
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    if (!fs.existsSync(secretFile)) {
      fs.writeFileSync(secretFile, require('node:crypto').randomBytes(48).toString('hex'), { mode: 0o600 });
      console.log('Generated a new random JWT secret (JWT_SECRET was not set).');
    }
    process.env.JWT_SECRET = fs.readFileSync(secretFile, 'utf8').trim();
  }
  const { server } = createAppServer();
  server.listen(port, host, () => {
    console.log(`\n======================================================================`);
    console.log(`  We HR — Enterprise Multi-Tenant HR & Attendance SaaS Platform`);
    console.log(`  Web Dashboard & API running at: http://${host}:${port}`);
    console.log(`  Default Demo Password for seeded accounts: WeHR@2026`);
    console.log(`======================================================================\n`);
  });
}

module.exports = {
  createAppServer,
};
