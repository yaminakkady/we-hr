'use strict';

/**
 * We HR — Relational Database Engine (Node.js Built-in SQLite + PostgreSQL Compatible Schema)
 *
 * Uses Node.js 24 native `node:sqlite` (`DatabaseSync`) with foreign keys and
 * immutability triggers enabled.
 */

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS subscription_plans (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    max_employees INTEGER NOT NULL,
    max_workplaces INTEGER NOT NULL,
    max_branches INTEGER NOT NULL,
    biometric_enabled INTEGER NOT NULL DEFAULT 1,
    offline_sync_enabled INTEGER NOT NULL DEFAULT 1,
    csv_export_enabled INTEGER NOT NULL DEFAULT 1,
    monthly_price_egp REAL NOT NULL DEFAULT 0,
    monthly_price_sar REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    country_code TEXT NOT NULL DEFAULT 'EG',
    timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
    currency TEXT NOT NULL DEFAULT 'EGP',
    default_locale TEXT NOT NULL DEFAULT 'ar',
    require_biometric_strict INTEGER NOT NULL DEFAULT 1,
    require_approved_device INTEGER NOT NULL DEFAULT 0,
    allow_offline_attendance INTEGER NOT NULL DEFAULT 1,
    max_offline_age_hours INTEGER NOT NULL DEFAULT 24,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS company_subscriptions (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
    status TEXT NOT NULL,
    start_date TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    grace_period_days INTEGER NOT NULL DEFAULT 7,
    trial_enabled INTEGER NOT NULL DEFAULT 0,
    renewal_reminder_sent INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    updated_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_records (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    subscription_id TEXT NOT NULL REFERENCES company_subscriptions(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EGP',
    payment_method TEXT NOT NULL,
    reference_number TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'pending',
    submitted_by TEXT,
    verified_by TEXT,
    verified_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    code TEXT NOT NULL,
    city TEXT,
    country_code TEXT NOT NULL DEFAULT 'EG',
    timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    code TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS work_shifts (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    grace_period_minutes INTEGER NOT NULL DEFAULT 15,
    early_departure_grace_minutes INTEGER NOT NULL DEFAULT 10,
    min_overtime_minutes INTEGER NOT NULL DEFAULT 30,
    max_break_minutes INTEGER NOT NULL DEFAULT 60,
    is_overnight INTEGER NOT NULL DEFAULT 0,
    working_days_json TEXT NOT NULL DEFAULT '[0,1,2,3,4]',
    timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workplaces (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
    code TEXT NOT NULL,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    workplace_type TEXT NOT NULL DEFAULT 'office',
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    radius_meters REAL NOT NULL DEFAULT 150,
    max_accuracy_meters REAL NOT NULL DEFAULT 50,
    max_location_age_seconds INTEGER NOT NULL DEFAULT 120,
    accuracy_buffer_policy TEXT NOT NULL DEFAULT 'strict',
    allowed_event_types_json TEXT NOT NULL DEFAULT '["check_in","check_out","break_start","break_end","field_visit"]',
    applicable_shifts_json TEXT NOT NULL DEFAULT '[]',
    require_biometric INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
    preferred_locale TEXT NOT NULL DEFAULT 'ar',
    is_active INTEGER NOT NULL DEFAULT 1,
    token_version INTEGER NOT NULL DEFAULT 1,
    last_login_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
    manager_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
    default_workplace_id TEXT REFERENCES workplaces(id) ON DELETE SET NULL,
    authorized_workplace_ids_json TEXT NOT NULL DEFAULT '[]',
    default_shift_id TEXT REFERENCES work_shifts(id) ON DELETE SET NULL,
    employee_code TEXT NOT NULL,
    full_name_en TEXT NOT NULL,
    full_name_ar TEXT NOT NULL,
    job_title_en TEXT NOT NULL,
    job_title_ar TEXT NOT NULL,
    national_id_masked TEXT,
    hire_date TEXT NOT NULL,
    attendance_eligible INTEGER NOT NULL DEFAULT 1,
    require_biometric INTEGER NOT NULL DEFAULT 1,
    allow_biometric_exception INTEGER NOT NULL DEFAULT 0,
    biometric_exception_reason TEXT,
    allow_field_visit INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (company_id, employee_code)
);

CREATE TABLE IF NOT EXISTS approved_devices (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    device_identifier TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'android',
    device_model TEXT NOT NULL,
    os_version TEXT,
    biometric_hardware_available INTEGER NOT NULL DEFAULT 0,
    biometric_enrolled INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'approved',
    approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    last_used_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (company_id, employee_id, device_identifier)
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_id TEXT REFERENCES work_shifts(id) ON DELETE SET NULL,
    workplace_id TEXT REFERENCES workplaces(id) ON DELETE SET NULL,
    attendance_date TEXT NOT NULL,
    first_check_in_at TEXT,
    last_check_out_at TEXT,
    current_state TEXT NOT NULL DEFAULT 'not_checked_in',
    total_work_minutes INTEGER NOT NULL DEFAULT 0,
    total_break_minutes INTEGER NOT NULL DEFAULT 0,
    late_minutes INTEGER NOT NULL DEFAULT 0,
    early_departure_minutes INTEGER NOT NULL DEFAULT 0,
    overtime_minutes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'present',
    has_exception INTEGER NOT NULL DEFAULT 0,
    exception_notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (company_id, employee_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS attendance_events (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    attendance_record_id TEXT REFERENCES attendance_records(id) ON DELETE SET NULL,
    workplace_id TEXT REFERENCES workplaces(id) ON DELETE SET NULL,
    shift_id TEXT REFERENCES work_shifts(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    server_timestamp TEXT NOT NULL,
    device_timestamp TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    accuracy_meters REAL,
    location_timestamp TEXT,
    calculated_distance_meters REAL,
    permitted_radius_meters REAL,
    geofence_passed INTEGER NOT NULL DEFAULT 0,
    is_mock_location INTEGER NOT NULL DEFAULT 0,
    auth_method TEXT NOT NULL,
    biometric_verified INTEGER NOT NULL DEFAULT 0,
    device_identifier TEXT,
    device_platform TEXT,
    is_offline_submission INTEGER NOT NULL DEFAULT 0,
    sync_status TEXT NOT NULL,
    rejection_code TEXT,
    rejection_reason TEXT,
    flags_json TEXT NOT NULL DEFAULT '[]',
    reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TEXT,
    review_notes TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS attendance_corrections (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    attendance_record_id TEXT NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
    original_event_id TEXT REFERENCES attendance_events(id) ON DELETE SET NULL,
    correction_type TEXT NOT NULL,
    original_value_json TEXT NOT NULL,
    corrected_value_json TEXT NOT NULL,
    reason TEXT NOT NULL,
    requested_by TEXT NOT NULL REFERENCES users(id),
    approved_by TEXT REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'approved',
    created_at TEXT NOT NULL,
    decided_at TEXT
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    days_count INTEGER NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    decided_at TEXT,
    decision_notes TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS holidays (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    holiday_date TEXT NOT NULL,
    is_paid INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    UNIQUE (company_id, holiday_date, name_en)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    actor_role TEXT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    ip_address TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

-- Immutability Triggers: Prevent deletion or tampering of raw attendance events and audit logs
CREATE TRIGGER IF NOT EXISTS trg_no_delete_attendance_events
BEFORE DELETE ON attendance_events
BEGIN
    SELECT RAISE(ABORT, 'IMMUTABLE_VIOLATION: Raw attendance events cannot be deleted.');
END;

CREATE TRIGGER IF NOT EXISTS trg_no_mutate_core_attendance_events
BEFORE UPDATE ON attendance_events
WHEN OLD.server_timestamp != NEW.server_timestamp
  OR OLD.device_timestamp != NEW.device_timestamp
  OR OLD.event_type != NEW.event_type
  OR OLD.employee_id != NEW.employee_id
  OR OLD.auth_method != NEW.auth_method
  OR OLD.biometric_verified != NEW.biometric_verified
  OR (OLD.latitude IS NOT NEW.latitude)
  OR (OLD.longitude IS NOT NEW.longitude)
BEGIN
    SELECT RAISE(ABORT, 'IMMUTABLE_VIOLATION: Core attendance event fields cannot be modified. Record an attendance_correction instead.');
END;

CREATE TRIGGER IF NOT EXISTS trg_no_delete_audit_logs
BEFORE DELETE ON audit_logs
BEGIN
    SELECT RAISE(ABORT, 'IMMUTABLE_VIOLATION: Audit logs cannot be deleted.');
END;

CREATE TRIGGER IF NOT EXISTS trg_no_update_audit_logs
BEFORE UPDATE ON audit_logs
BEGIN
    SELECT RAISE(ABORT, 'IMMUTABLE_VIOLATION: Audit logs are append-only and cannot be modified.');
END;
`;

/**
 * Opens and initializes a SQLite database connection (either file-backed or `:memory:` for tests).
 * @param {string} [dbPath]
 * @returns {DatabaseSync}
 */
function createDatabase(dbPath) {
  const resolvedPath =
    dbPath ||
    process.env.SQLITE_DB_PATH ||
    path.join(__dirname, '..', '..', '..', 'data', 'we_hr.db');

  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(resolvedPath);
  db.exec(SCHEMA_SQL);
  return db;
}

module.exports = {
  createDatabase,
  SCHEMA_SQL,
};
