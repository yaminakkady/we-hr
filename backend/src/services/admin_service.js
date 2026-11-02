'use strict';

/**
 * We HR — Platform Admin Control Panel Service
 * Cross-tenant administration (companies, subscriptions, login accounts, roles, branches,
 * workplaces, shifts, devices, payments, audit trail) reserved for platform_super_admin.
 * Every write is recorded in audit_logs; session-affecting changes bump token_version so
 * existing tokens are revoked immediately.
 */

const crypto = require('node:crypto');
const { hashPassword } = require('../security/auth');
const { validateCoordinates } = require('../domain/geofence');
const { ROLES } = require('../domain/rbac');

const VALID_ROLES = new Set(Object.values(ROLES));
const COMPANY_ROLES = new Set([...VALID_ROLES].filter((r) => r !== ROLES.PLATFORM_SUPER_ADMIN));
const SUBSCRIPTION_STATUSES = new Set(['active', 'trial', 'suspended']);
const DEVICE_STATUSES = new Set(['approved', 'pending', 'revoked']);
const WORKPLACE_TYPES = new Set(['office', 'factory', 'warehouse', 'branch', 'site', 'field']);
const DEFAULT_JOB_TITLES = {
  company_owner: ['Company Owner', 'مالك الشركة'],
  hr_admin: ['HR Administrator', 'مسؤول الموارد البشرية'],
  branch_manager: ['Branch Manager', 'مدير الفرع'],
  supervisor: ['Supervisor', 'مشرف'],
  employee: ['Employee', 'موظف'],
};

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function fail(status, code, message) {
  return { ok: false, status, code, message };
}

function str(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function toBit(value) {
  return value ? 1 : 0;
}

class AdminService {
  /**
   * @param {import('node:sqlite').DatabaseSync} db
   * @param {import('./hr_service').HrService} hrService used for audit logging and payment verification
   */
  constructor(db, hrService) {
    this.db = db;
    this.hr = hrService;
  }

  audit(actor, ip, action, targetType, targetId, companyId, details = {}) {
    this.hr.logAudit({
      companyId: companyId || null,
      actorUserId: actor.id,
      actorRole: actor.role,
      action,
      targetType,
      targetId,
      ipAddress: ip,
      details,
    });
  }

  transaction(fn) {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  revokeUserSessions(userId) {
    this.db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(userId);
  }

  getCompany(companyId) {
    return companyId ? this.db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId) : null;
  }

  // --------------------------------------------------------------------------
  // OVERVIEW
  // --------------------------------------------------------------------------
  overview() {
    const count = (sql, ...args) => this.db.prepare(sql).get(...args).n;
    const today = new Date().toISOString().slice(0, 10);
    return {
      ok: true,
      status: 200,
      metrics: {
        companies: count('SELECT COUNT(*) AS n FROM companies'),
        activeCompanies: count('SELECT COUNT(*) AS n FROM companies WHERE is_active = 1'),
        users: count('SELECT COUNT(*) AS n FROM users'),
        activeUsers: count('SELECT COUNT(*) AS n FROM users WHERE is_active = 1'),
        employees: count('SELECT COUNT(*) AS n FROM employees WHERE is_active = 1'),
        workplaces: count('SELECT COUNT(*) AS n FROM workplaces WHERE is_active = 1'),
        attendanceEventsToday: count('SELECT COUNT(*) AS n FROM attendance_events WHERE substr(server_timestamp, 1, 10) = ?', today),
        pendingPayments: count("SELECT COUNT(*) AS n FROM payment_records WHERE verification_status = 'pending'"),
        pendingDevices: count("SELECT COUNT(*) AS n FROM approved_devices WHERE status = 'pending'"),
      },
      usersByRole: this.db.prepare('SELECT role, COUNT(*) AS n FROM users GROUP BY role ORDER BY role').all(),
      recentLogins: this.db
        .prepare(`
          SELECT u.id, u.email, u.role, u.last_login_at, c.name_en AS company_name_en, c.name_ar AS company_name_ar
          FROM users u LEFT JOIN companies c ON c.id = u.company_id
          WHERE u.last_login_at IS NOT NULL
          ORDER BY u.last_login_at DESC LIMIT 8
        `)
        .all(),
    };
  }

  listPlans() {
    return { ok: true, status: 200, plans: this.db.prepare('SELECT * FROM subscription_plans ORDER BY monthly_price_egp').all() };
  }

  // --------------------------------------------------------------------------
  // COMPANIES & SUBSCRIPTIONS
  // --------------------------------------------------------------------------
  listCompanies() {
    const companies = this.db
      .prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) AS user_count,
          (SELECT COUNT(*) FROM employees e WHERE e.company_id = c.id AND e.is_active = 1) AS employee_count,
          (SELECT COUNT(*) FROM branches b WHERE b.company_id = c.id) AS branch_count,
          (SELECT COUNT(*) FROM workplaces w WHERE w.company_id = c.id) AS workplace_count
        FROM companies c ORDER BY c.created_at
      `)
      .all()
      .map((c) => ({ ...c, subscription: this.hr.getCompanySubscription(c.id) || null }));
    return { ok: true, status: 200, companies };
  }

  createCompany(actor, ip, payload) {
    const nameEn = str(payload.nameEn);
    const nameAr = str(payload.nameAr) || nameEn;
    const slug = str(payload.slug, 60).toLowerCase() || nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const countryCode = str(payload.countryCode, 2).toUpperCase() || 'EG';
    const timezone = str(payload.timezone, 60) || (countryCode === 'SA' ? 'Asia/Riyadh' : 'Africa/Cairo');
    const currency = str(payload.currency, 3).toUpperCase() || (countryCode === 'SA' ? 'SAR' : 'EGP');
    const planCode = str(payload.planCode, 30).toUpperCase() || 'STARTER';
    const days = Math.min(Math.max(Number(payload.subscriptionDays) || 30, 1), 3660);

    if (!nameEn) return fail(400, 'VALIDATION_ERROR', 'Company name is required.');
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) return fail(400, 'VALIDATION_ERROR', 'Slug must be 2-60 lowercase letters, digits or dashes.');
    if (this.db.prepare('SELECT 1 FROM companies WHERE slug = ?').get(slug)) {
      return fail(409, 'SLUG_TAKEN', 'A company with this slug already exists.');
    }
    const plan = this.db.prepare('SELECT * FROM subscription_plans WHERE code = ?').get(planCode);
    if (!plan) return fail(400, 'INVALID_PLAN', 'Unknown subscription plan.');

    const now = new Date();
    const nowIso = now.toISOString();
    const companyId = newId('comp');
    const branchId = newId('br');
    this.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO companies (id, name_en, name_ar, slug, country_code, timezone, currency, default_locale, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'ar', ?, ?)
        `)
        .run(companyId, nameEn, nameAr, slug, countryCode, timezone, currency, nowIso, nowIso);
      this.db
        .prepare(`
          INSERT INTO company_subscriptions (id, company_id, plan_id, status, start_date, expiry_date, grace_period_days, trial_enabled, updated_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 7, ?, ?, ?, ?)
        `)
        .run(
          newId('sub'), companyId, plan.id, payload.trial ? 'trial' : 'active',
          nowIso.slice(0, 10), new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10),
          toBit(payload.trial), actor.id, nowIso, nowIso
        );
      this.db
        .prepare(`
          INSERT INTO branches (id, company_id, name_en, name_ar, code, city, country_code, timezone, created_at)
          VALUES (?, ?, 'Head Office', 'المقر الرئيسي', 'HQ', NULL, ?, ?, ?)
        `)
        .run(branchId, companyId, countryCode, timezone, nowIso);
    });
    this.audit(actor, ip, 'ADMIN_COMPANY_CREATED', 'company', companyId, companyId, { nameEn, slug, planCode, days });
    return { ok: true, status: 201, company: this.getCompany(companyId), headOfficeBranchId: branchId };
  }

  updateCompany(actor, ip, companyId, payload) {
    const company = this.getCompany(companyId);
    if (!company) return fail(404, 'COMPANY_NOT_FOUND', 'Company not found.');

    const fields = {
      name_en: payload.nameEn !== undefined ? str(payload.nameEn) || company.name_en : company.name_en,
      name_ar: payload.nameAr !== undefined ? str(payload.nameAr) || company.name_ar : company.name_ar,
      is_active: payload.isActive !== undefined ? toBit(payload.isActive) : company.is_active,
      require_biometric_strict:
        payload.requireBiometricStrict !== undefined ? toBit(payload.requireBiometricStrict) : company.require_biometric_strict,
      require_approved_device:
        payload.requireApprovedDevice !== undefined ? toBit(payload.requireApprovedDevice) : company.require_approved_device,
      allow_offline_attendance:
        payload.allowOfflineAttendance !== undefined ? toBit(payload.allowOfflineAttendance) : company.allow_offline_attendance,
    };
    this.db
      .prepare(`
        UPDATE companies SET name_en = ?, name_ar = ?, is_active = ?, require_biometric_strict = ?,
          require_approved_device = ?, allow_offline_attendance = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        fields.name_en, fields.name_ar, fields.is_active, fields.require_biometric_strict,
        fields.require_approved_device, fields.allow_offline_attendance, new Date().toISOString(), companyId
      );
    // Suspending a company signs every one of its users out immediately.
    if (company.is_active && !fields.is_active) {
      this.db.prepare('UPDATE users SET token_version = token_version + 1 WHERE company_id = ?').run(companyId);
    }
    this.audit(actor, ip, 'ADMIN_COMPANY_UPDATED', 'company', companyId, companyId, fields);
    return { ok: true, status: 200, company: this.getCompany(companyId) };
  }

  setSubscription(actor, ip, companyId, payload) {
    const company = this.getCompany(companyId);
    if (!company) return fail(404, 'COMPANY_NOT_FOUND', 'Company not found.');
    const current = this.hr.getCompanySubscription(companyId);

    const planCode = str(payload.planCode, 30).toUpperCase() || (current && current.plan_code);
    const plan = this.db.prepare('SELECT * FROM subscription_plans WHERE code = ?').get(planCode || '');
    if (!plan) return fail(400, 'INVALID_PLAN', 'Unknown subscription plan.');
    const status = str(payload.status, 20) || (current ? current.status : 'active');
    if (!SUBSCRIPTION_STATUSES.has(status)) return fail(400, 'INVALID_STATUS', 'Status must be active, trial or suspended.');
    const expiryDate = str(payload.expiryDate, 10) || (current && String(current.expiry_date).slice(0, 10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate || '') || Number.isNaN(Date.parse(expiryDate))) {
      return fail(400, 'INVALID_DATE', 'Expiry date must be YYYY-MM-DD.');
    }

    const nowIso = new Date().toISOString();
    if (current) {
      this.db
        .prepare('UPDATE company_subscriptions SET plan_id = ?, status = ?, expiry_date = ?, updated_by = ?, updated_at = ? WHERE id = ?')
        .run(plan.id, status, expiryDate, actor.id, nowIso, current.id);
    } else {
      this.db
        .prepare(`
          INSERT INTO company_subscriptions (id, company_id, plan_id, status, start_date, expiry_date, updated_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(newId('sub'), companyId, plan.id, status, nowIso.slice(0, 10), expiryDate, actor.id, nowIso, nowIso);
    }
    this.audit(actor, ip, 'ADMIN_SUBSCRIPTION_UPDATED', 'company_subscription', companyId, companyId, { planCode, status, expiryDate });
    return { ok: true, status: 200, subscription: this.hr.getCompanySubscription(companyId) };
  }

  // --------------------------------------------------------------------------
  // USERS, ROLES & ACCESS
  // --------------------------------------------------------------------------
  listUsers(filters = {}) {
    const where = [];
    const args = [];
    if (filters.companyId) {
      where.push(filters.companyId === 'platform' ? 'u.company_id IS NULL' : 'u.company_id = ?');
      if (filters.companyId !== 'platform') args.push(filters.companyId);
    }
    if (filters.role) {
      where.push('u.role = ?');
      args.push(filters.role);
    }
    if (filters.q) {
      where.push('(LOWER(u.email) LIKE ? OR LOWER(COALESCE(e.full_name_en, \'\')) LIKE ? OR COALESCE(e.full_name_ar, \'\') LIKE ?)');
      const like = `%${String(filters.q).toLowerCase()}%`;
      args.push(like, like, `%${filters.q}%`);
    }
    const users = this.db
      .prepare(`
        SELECT u.id, u.email, u.phone, u.role, u.company_id, u.branch_id, u.is_active, u.last_login_at, u.created_at,
               c.name_en AS company_name_en, c.name_ar AS company_name_ar,
               b.name_en AS branch_name_en, b.name_ar AS branch_name_ar,
               e.id AS employee_id, e.employee_code, e.full_name_en, e.full_name_ar,
               COALESCE(e.branch_id, u.branch_id) AS effective_branch_id
        FROM users u
        LEFT JOIN companies c ON c.id = u.company_id
        LEFT JOIN employees e ON e.user_id = u.id
        LEFT JOIN branches b ON b.id = COALESCE(e.branch_id, u.branch_id)
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY u.company_id IS NOT NULL, c.name_en, u.role, u.email
      `)
      .all(...args);
    return { ok: true, status: 200, users };
  }

  createUser(actor, ip, payload) {
    const email = str(payload.email, 120).toLowerCase();
    const password = typeof payload.password === 'string' ? payload.password : '';
    const role = str(payload.role, 40);

    if (!/^[^\s]{3,120}$/.test(email)) return fail(400, 'VALIDATION_ERROR', 'Username/email must be 3-120 characters with no spaces.');
    if (password.length < 6) return fail(400, 'WEAK_PASSWORD', 'Password must be at least 6 characters.');
    if (!VALID_ROLES.has(role)) return fail(400, 'INVALID_ROLE', 'Unknown role.');
    if (this.db.prepare('SELECT 1 FROM users WHERE LOWER(email) = ?').get(email)) {
      return fail(409, 'EMAIL_TAKEN', 'This username/email is already in use.');
    }

    const nowIso = new Date().toISOString();
    const userId = newId('usr');

    if (role === ROLES.PLATFORM_SUPER_ADMIN) {
      this.db
        .prepare(`
          INSERT INTO users (id, company_id, email, phone, password_hash, role, branch_id, preferred_locale, is_active, token_version, created_at)
          VALUES (?, NULL, ?, ?, ?, ?, NULL, 'ar', 1, 1, ?)
        `)
        .run(userId, email, str(payload.phone, 30) || null, hashPassword(password), role, nowIso);
      this.audit(actor, ip, 'ADMIN_USER_CREATED', 'user', userId, null, { email, role });
      return { ok: true, status: 201, userId };
    }

    const company = this.getCompany(str(payload.companyId, 60));
    if (!company) return fail(400, 'COMPANY_REQUIRED', 'Choose the company this account belongs to.');
    const branch = payload.branchId
      ? this.db.prepare('SELECT * FROM branches WHERE id = ? AND company_id = ?').get(payload.branchId, company.id)
      : this.db.prepare('SELECT * FROM branches WHERE company_id = ? AND is_active = 1 ORDER BY created_at LIMIT 1').get(company.id);
    if (!branch) return fail(400, 'BRANCH_REQUIRED', 'The company needs at least one branch first.');

    const fullNameEn = str(payload.fullNameEn) || email;
    const fullNameAr = str(payload.fullNameAr) || fullNameEn;
    const [defaultTitleEn, defaultTitleAr] = DEFAULT_JOB_TITLES[role];
    const branchWorkplaces = this.db
      .prepare('SELECT id FROM workplaces WHERE company_id = ? AND branch_id = ? AND is_active = 1 ORDER BY created_at')
      .all(company.id, branch.id)
      .map((w) => w.id);
    const workplaceIds = branchWorkplaces.length
      ? branchWorkplaces
      : this.db.prepare('SELECT id FROM workplaces WHERE company_id = ? AND is_active = 1 ORDER BY created_at').all(company.id).map((w) => w.id);
    const shift =
      this.db.prepare('SELECT id FROM work_shifts WHERE company_id = ? AND branch_id = ? AND is_active = 1 ORDER BY created_at LIMIT 1').get(company.id, branch.id) ||
      this.db.prepare('SELECT id FROM work_shifts WHERE company_id = ? AND is_active = 1 ORDER BY created_at LIMIT 1').get(company.id);

    let code;
    for (let n = this.db.prepare('SELECT COUNT(*) AS n FROM employees WHERE company_id = ?').get(company.id).n + 1; ; n += 1) {
      code = `U-${String(n).padStart(3, '0')}`;
      if (!this.db.prepare('SELECT 1 FROM employees WHERE company_id = ? AND employee_code = ?').get(company.id, code)) break;
    }

    const employeeId = newId('emp');
    this.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO users (id, company_id, email, phone, password_hash, role, branch_id, preferred_locale, is_active, token_version, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'ar', 1, 1, ?)
        `)
        .run(userId, company.id, email, str(payload.phone, 30) || null, hashPassword(password), role, branch.id, nowIso);
      this.db
        .prepare(`
          INSERT INTO employees (
            id, user_id, company_id, branch_id, department_id, manager_id, default_workplace_id,
            authorized_workplace_ids_json, default_shift_id, employee_code, full_name_en, full_name_ar,
            job_title_en, job_title_ar, national_id_masked, hire_date, attendance_eligible, require_biometric,
            allow_biometric_exception, biometric_exception_reason, allow_field_visit, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, 1, 0, NULL, 0, 1, ?, ?)
        `)
        .run(
          employeeId, userId, company.id, branch.id, workplaceIds[0] || null, JSON.stringify(workplaceIds),
          shift ? shift.id : null, code, fullNameEn, fullNameAr,
          str(payload.jobTitleEn) || defaultTitleEn, str(payload.jobTitleAr) || defaultTitleAr,
          nowIso.slice(0, 10), nowIso, nowIso
        );
    });
    this.audit(actor, ip, 'ADMIN_USER_CREATED', 'user', userId, company.id, { email, role, employeeCode: code });
    return { ok: true, status: 201, userId, employeeId, employeeCode: code };
  }

  updateUser(actor, ip, userId, payload) {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return fail(404, 'USER_NOT_FOUND', 'User not found.');

    const role = payload.role !== undefined ? str(payload.role, 40) : user.role;
    const isActive = payload.isActive !== undefined ? toBit(payload.isActive) : user.is_active;
    if (!VALID_ROLES.has(role)) return fail(400, 'INVALID_ROLE', 'Unknown role.');
    if ((role === ROLES.PLATFORM_SUPER_ADMIN) !== (user.role === ROLES.PLATFORM_SUPER_ADMIN)) {
      return fail(400, 'ROLE_SCOPE_CHANGE', 'Platform admins and company accounts cannot be converted into each other. Create a new account instead.');
    }
    if (user.id === actor.id && (role !== user.role || !isActive)) {
      return fail(400, 'CANNOT_MODIFY_SELF', 'You cannot change your own role or disable your own account.');
    }
    if (user.role === ROLES.PLATFORM_SUPER_ADMIN && user.is_active && !isActive) {
      const admins = this.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'platform_super_admin' AND is_active = 1").get().n;
      if (admins <= 1) return fail(400, 'LAST_SUPER_ADMIN', 'At least one active platform admin must remain.');
    }

    let branchId = user.branch_id;
    if (payload.branchId !== undefined && user.company_id) {
      const branch = this.db.prepare('SELECT id FROM branches WHERE id = ? AND company_id = ?').get(payload.branchId, user.company_id);
      if (!branch) return fail(400, 'INVALID_BRANCH', 'Branch does not belong to this company.');
      branchId = branch.id;
    }

    this.transaction(() => {
      this.db
        .prepare('UPDATE users SET role = ?, is_active = ?, branch_id = ?, token_version = token_version + 1 WHERE id = ?')
        .run(role, isActive, branchId, user.id);
      this.db
        .prepare('UPDATE employees SET is_active = ?, branch_id = COALESCE(?, branch_id), updated_at = ? WHERE user_id = ?')
        .run(isActive, user.company_id ? branchId : null, new Date().toISOString(), user.id);
    });
    this.audit(actor, ip, 'ADMIN_USER_UPDATED', 'user', user.id, user.company_id, {
      email: user.email,
      role: { from: user.role, to: role },
      isActive: { from: Boolean(user.is_active), to: Boolean(isActive) },
      branchId,
    });
    return { ok: true, status: 200 };
  }

  resetPassword(actor, ip, userId, payload) {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return fail(404, 'USER_NOT_FOUND', 'User not found.');
    const password = typeof payload.password === 'string' ? payload.password : '';
    if (password.length < 6) return fail(400, 'WEAK_PASSWORD', 'Password must be at least 6 characters.');
    this.db
      .prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?')
      .run(hashPassword(password), user.id);
    this.audit(actor, ip, 'ADMIN_PASSWORD_RESET', 'user', user.id, user.company_id, { email: user.email });
    return { ok: true, status: 200 };
  }

  signOutUser(actor, ip, userId) {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return fail(404, 'USER_NOT_FOUND', 'User not found.');
    this.revokeUserSessions(user.id);
    this.audit(actor, ip, 'ADMIN_SESSIONS_REVOKED', 'user', user.id, user.company_id, { email: user.email });
    return { ok: true, status: 200 };
  }

  // --------------------------------------------------------------------------
  // BRANCHES, WORKPLACES & SHIFTS
  // --------------------------------------------------------------------------
  listBranches() {
    const branches = this.db
      .prepare(`
        SELECT b.*, c.name_en AS company_name_en, c.name_ar AS company_name_ar,
          (SELECT COUNT(*) FROM employees e WHERE e.branch_id = b.id AND e.is_active = 1) AS employee_count
        FROM branches b JOIN companies c ON c.id = b.company_id
        ORDER BY c.name_en, b.created_at
      `)
      .all();
    return { ok: true, status: 200, branches };
  }

  createBranch(actor, ip, payload) {
    const company = this.getCompany(str(payload.companyId, 60));
    if (!company) return fail(400, 'COMPANY_REQUIRED', 'Choose a company.');
    const nameEn = str(payload.nameEn);
    const code = str(payload.code, 20).toUpperCase();
    if (!nameEn || !/^[A-Z0-9-]{1,20}$/.test(code)) return fail(400, 'VALIDATION_ERROR', 'Branch name and a short code (letters, digits, dashes) are required.');
    if (this.db.prepare('SELECT 1 FROM branches WHERE company_id = ? AND code = ?').get(company.id, code)) {
      return fail(409, 'CODE_TAKEN', 'This branch code already exists in the company.');
    }
    const id = newId('br');
    this.db
      .prepare(`
        INSERT INTO branches (id, company_id, name_en, name_ar, code, city, country_code, timezone, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(id, company.id, nameEn, str(payload.nameAr) || nameEn, code, str(payload.city, 80) || null,
        company.country_code, company.timezone, new Date().toISOString());
    this.audit(actor, ip, 'ADMIN_BRANCH_CREATED', 'branch', id, company.id, { nameEn, code });
    return { ok: true, status: 201, branchId: id };
  }

  setBranchActive(actor, ip, branchId, payload) {
    const branch = this.db.prepare('SELECT * FROM branches WHERE id = ?').get(branchId);
    if (!branch) return fail(404, 'BRANCH_NOT_FOUND', 'Branch not found.');
    this.db.prepare('UPDATE branches SET is_active = ? WHERE id = ?').run(toBit(payload.isActive), branch.id);
    this.audit(actor, ip, 'ADMIN_BRANCH_UPDATED', 'branch', branch.id, branch.company_id, { isActive: Boolean(payload.isActive) });
    return { ok: true, status: 200 };
  }

  listWorkplaces() {
    const workplaces = this.db
      .prepare(`
        SELECT w.*, c.name_en AS company_name_en, c.name_ar AS company_name_ar, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
        FROM workplaces w JOIN companies c ON c.id = w.company_id LEFT JOIN branches b ON b.id = w.branch_id
        ORDER BY c.name_en, w.created_at
      `)
      .all();
    return { ok: true, status: 200, workplaces };
  }

  createWorkplace(actor, ip, payload) {
    const company = this.getCompany(str(payload.companyId, 60));
    if (!company) return fail(400, 'COMPANY_REQUIRED', 'Choose a company.');
    const branch = payload.branchId
      ? this.db.prepare('SELECT * FROM branches WHERE id = ? AND company_id = ?').get(payload.branchId, company.id)
      : null;
    if (payload.branchId && !branch) return fail(400, 'INVALID_BRANCH', 'Branch does not belong to this company.');
    const nameEn = str(payload.nameEn);
    const code = str(payload.code, 30).toUpperCase() || `WP-${Date.now().toString(36).toUpperCase()}`;
    const latitude = Number(payload.latitude);
    const longitude = Number(payload.longitude);
    const radius = Number(payload.radiusMeters) || 150;
    const type = WORKPLACE_TYPES.has(payload.workplaceType) ? payload.workplaceType : 'office';
    if (!nameEn) return fail(400, 'VALIDATION_ERROR', 'Workplace name is required.');
    if (!validateCoordinates(latitude, longitude).valid) return fail(400, 'INVALID_COORDINATES', 'Latitude/longitude are not valid.');
    if (radius < 20 || radius > 5000) return fail(400, 'INVALID_RADIUS', 'Radius must be between 20 and 5000 meters.');
    if (this.db.prepare('SELECT 1 FROM workplaces WHERE company_id = ? AND code = ?').get(company.id, code)) {
      return fail(409, 'CODE_TAKEN', 'This workplace code already exists in the company.');
    }

    const id = newId('wp');
    let authorized = 0;
    this.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO workplaces (id, company_id, branch_id, code, name_en, name_ar, workplace_type, latitude, longitude, radius_meters, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(id, company.id, branch ? branch.id : null, code, nameEn, str(payload.nameAr) || nameEn, type,
          latitude, longitude, radius, new Date().toISOString());
      // Optionally let every active employee (of the branch, or the whole company) check in here.
      if (payload.authorizeAllEmployees !== false) {
        const employees = branch
          ? this.db.prepare('SELECT id, authorized_workplace_ids_json FROM employees WHERE company_id = ? AND branch_id = ? AND is_active = 1').all(company.id, branch.id)
          : this.db.prepare('SELECT id, authorized_workplace_ids_json FROM employees WHERE company_id = ? AND is_active = 1').all(company.id);
        const update = this.db.prepare('UPDATE employees SET authorized_workplace_ids_json = ?, updated_at = ? WHERE id = ?');
        for (const emp of employees) {
          const ids = JSON.parse(emp.authorized_workplace_ids_json || '[]');
          if (!ids.includes(id)) {
            ids.push(id);
            update.run(JSON.stringify(ids), new Date().toISOString(), emp.id);
            authorized += 1;
          }
        }
      }
    });
    this.audit(actor, ip, 'ADMIN_WORKPLACE_CREATED', 'workplace', id, company.id, { nameEn, code, latitude, longitude, radius, authorized });
    return { ok: true, status: 201, workplaceId: id, employeesAuthorized: authorized };
  }

  updateWorkplace(actor, ip, workplaceId, payload) {
    const wp = this.db.prepare('SELECT * FROM workplaces WHERE id = ?').get(workplaceId);
    if (!wp) return fail(404, 'WORKPLACE_NOT_FOUND', 'Workplace not found.');
    const latitude = payload.latitude !== undefined ? Number(payload.latitude) : wp.latitude;
    const longitude = payload.longitude !== undefined ? Number(payload.longitude) : wp.longitude;
    const radius = payload.radiusMeters !== undefined ? Number(payload.radiusMeters) : wp.radius_meters;
    const isActive = payload.isActive !== undefined ? toBit(payload.isActive) : wp.is_active;
    if (!validateCoordinates(latitude, longitude).valid) return fail(400, 'INVALID_COORDINATES', 'Latitude/longitude are not valid.');
    if (!(radius >= 20 && radius <= 5000)) return fail(400, 'INVALID_RADIUS', 'Radius must be between 20 and 5000 meters.');
    this.db
      .prepare('UPDATE workplaces SET latitude = ?, longitude = ?, radius_meters = ?, is_active = ? WHERE id = ?')
      .run(latitude, longitude, radius, isActive, wp.id);
    this.audit(actor, ip, 'ADMIN_WORKPLACE_UPDATED', 'workplace', wp.id, wp.company_id, { latitude, longitude, radius, isActive: Boolean(isActive) });
    return { ok: true, status: 200 };
  }

  listShifts() {
    const shifts = this.db
      .prepare(`
        SELECT s.*, c.name_en AS company_name_en, c.name_ar AS company_name_ar, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
        FROM work_shifts s JOIN companies c ON c.id = s.company_id LEFT JOIN branches b ON b.id = s.branch_id
        ORDER BY c.name_en, s.start_time
      `)
      .all();
    return { ok: true, status: 200, shifts };
  }

  createShift(actor, ip, payload) {
    const company = this.getCompany(str(payload.companyId, 60));
    if (!company) return fail(400, 'COMPANY_REQUIRED', 'Choose a company.');
    const branch = payload.branchId
      ? this.db.prepare('SELECT * FROM branches WHERE id = ? AND company_id = ?').get(payload.branchId, company.id)
      : null;
    if (payload.branchId && !branch) return fail(400, 'INVALID_BRANCH', 'Branch does not belong to this company.');
    const startTime = str(payload.startTime, 5);
    const endTime = str(payload.endTime, 5);
    if (!isTime(startTime) || !isTime(endTime) || startTime === endTime) {
      return fail(400, 'INVALID_TIME', 'Start and end must be different HH:MM times.');
    }
    const grace = Math.min(Math.max(Number(payload.gracePeriodMinutes ?? 15), 0), 180);
    const nameEn = str(payload.nameEn) || `Shift ${startTime} - ${endTime}`;
    const id = newId('shift');
    this.db
      .prepare(`
        INSERT INTO work_shifts (id, company_id, branch_id, name_en, name_ar, start_time, end_time, grace_period_minutes, is_overnight, timezone, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(id, company.id, branch ? branch.id : null, nameEn, str(payload.nameAr) || nameEn, startTime, endTime, grace,
        toBit(endTime < startTime), company.timezone, new Date().toISOString());
    this.audit(actor, ip, 'ADMIN_SHIFT_CREATED', 'work_shift', id, company.id, { nameEn, startTime, endTime });
    return { ok: true, status: 201, shiftId: id };
  }

  setShiftActive(actor, ip, shiftId, payload) {
    const shift = this.db.prepare('SELECT * FROM work_shifts WHERE id = ?').get(shiftId);
    if (!shift) return fail(404, 'SHIFT_NOT_FOUND', 'Shift not found.');
    this.db.prepare('UPDATE work_shifts SET is_active = ? WHERE id = ?').run(toBit(payload.isActive), shift.id);
    this.audit(actor, ip, 'ADMIN_SHIFT_UPDATED', 'work_shift', shift.id, shift.company_id, { isActive: Boolean(payload.isActive) });
    return { ok: true, status: 200 };
  }

  // --------------------------------------------------------------------------
  // DEVICES, PAYMENTS & AUDIT
  // --------------------------------------------------------------------------
  listDevices() {
    const devices = this.db
      .prepare(`
        SELECT d.*, e.full_name_en, e.full_name_ar, e.employee_code, c.name_en AS company_name_en, c.name_ar AS company_name_ar
        FROM approved_devices d JOIN employees e ON e.id = d.employee_id JOIN companies c ON c.id = d.company_id
        ORDER BY d.created_at DESC
      `)
      .all();
    return { ok: true, status: 200, devices };
  }

  setDeviceStatus(actor, ip, deviceId, payload) {
    const device = this.db.prepare('SELECT * FROM approved_devices WHERE id = ?').get(deviceId);
    if (!device) return fail(404, 'DEVICE_NOT_FOUND', 'Device not found.');
    const status = str(payload.status, 20);
    if (!DEVICE_STATUSES.has(status)) return fail(400, 'INVALID_STATUS', 'Status must be approved, pending or revoked.');
    this.db.prepare('UPDATE approved_devices SET status = ?, approved_by = ? WHERE id = ?').run(status, actor.id, device.id);
    this.audit(actor, ip, 'ADMIN_DEVICE_STATUS_UPDATED', 'device', device.id, device.company_id, { status, deviceIdentifier: device.device_identifier });
    return { ok: true, status: 200 };
  }

  listPayments() {
    const payments = this.db
      .prepare(`
        SELECT p.*, c.name_en AS company_name_en, c.name_ar AS company_name_ar
        FROM payment_records p JOIN companies c ON c.id = p.company_id
        ORDER BY p.created_at DESC
      `)
      .all();
    return { ok: true, status: 200, payments };
  }

  listAuditLogs(filters = {}) {
    const where = [];
    const args = [];
    if (filters.companyId) {
      where.push(filters.companyId === 'platform' ? 'a.company_id IS NULL' : 'a.company_id = ?');
      if (filters.companyId !== 'platform') args.push(filters.companyId);
    }
    if (filters.action) {
      where.push('a.action LIKE ?');
      args.push(`%${String(filters.action).toUpperCase()}%`);
    }
    const limit = Math.min(Math.max(Number(filters.limit) || 200, 1), 1000);
    const logs = this.db
      .prepare(`
        SELECT a.*, u.email AS actor_email, c.name_en AS company_name_en, c.name_ar AS company_name_ar
        FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id LEFT JOIN companies c ON c.id = a.company_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY a.created_at DESC LIMIT ${limit}
      `)
      .all(...args);
    return { ok: true, status: 200, auditLogs: logs };
  }
}

/**
 * Routes /api/admin/* requests. The caller has already authenticated the actor; this enforces
 * that only platform super admins get through. Returns a result object or null for unknown routes.
 */
function routeAdminRequest(admin, { method, pathname, searchParams, body, actor, ip }) {
  if (actor.role !== ROLES.PLATFORM_SUPER_ADMIN) {
    return fail(403, 'PLATFORM_ADMIN_ONLY', 'The admin control panel is restricted to platform administrators.');
  }
  const query = Object.fromEntries(searchParams.entries());
  const path = pathname.replace(/^\/api\/admin/, '');
  const match = (pattern) => path.match(pattern);
  let m;

  if (method === 'GET') {
    if (path === '/overview') return admin.overview();
    if (path === '/plans') return admin.listPlans();
    if (path === '/companies') return admin.listCompanies();
    if (path === '/users') return admin.listUsers(query);
    if (path === '/branches') return admin.listBranches();
    if (path === '/workplaces') return admin.listWorkplaces();
    if (path === '/shifts') return admin.listShifts();
    if (path === '/devices') return admin.listDevices();
    if (path === '/payments') return admin.listPayments();
    if (path === '/audit-logs') return admin.listAuditLogs(query);
    return null;
  }
  if (method !== 'POST') return null;

  if (path === '/companies') return admin.createCompany(actor, ip, body);
  if ((m = match(/^\/companies\/([\w-]+)$/))) return admin.updateCompany(actor, ip, m[1], body);
  if ((m = match(/^\/companies\/([\w-]+)\/subscription$/))) return admin.setSubscription(actor, ip, m[1], body);
  if (path === '/users') return admin.createUser(actor, ip, body);
  if ((m = match(/^\/users\/([\w-]+)$/))) return admin.updateUser(actor, ip, m[1], body);
  if ((m = match(/^\/users\/([\w-]+)\/password$/))) return admin.resetPassword(actor, ip, m[1], body);
  if ((m = match(/^\/users\/([\w-]+)\/sign-out$/))) return admin.signOutUser(actor, ip, m[1]);
  if (path === '/branches') return admin.createBranch(actor, ip, body);
  if ((m = match(/^\/branches\/([\w-]+)$/))) return admin.setBranchActive(actor, ip, m[1], body);
  if (path === '/workplaces') return admin.createWorkplace(actor, ip, body);
  if ((m = match(/^\/workplaces\/([\w-]+)$/))) return admin.updateWorkplace(actor, ip, m[1], body);
  if (path === '/shifts') return admin.createShift(actor, ip, body);
  if ((m = match(/^\/shifts\/([\w-]+)$/))) return admin.setShiftActive(actor, ip, m[1], body);
  if ((m = match(/^\/devices\/([\w-]+)$/))) return admin.setDeviceStatus(actor, ip, m[1], body);
  if ((m = match(/^\/payments\/([\w-]+)\/verify$/))) {
    return admin.hr.verifyManualPayment(actor, { paymentId: m[1], decision: body.decision, extendDays: body.extendDays });
  }
  return null;
}

module.exports = {
  AdminService,
  routeAdminRequest,
};
