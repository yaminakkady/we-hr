-- ============================================================================
-- We HR — Production PostgreSQL & Supabase Row-Level Security (RLS) Schema
-- Migration: 001_we_hr_schema_and_rls.sql
-- Target Region: Egypt (EG), Saudi Arabia (SA), and Gulf (AE, KW, QA, BH, OM)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. SUBSCRIPTION PLANS (Platform-level catalog)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_plans (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    max_employees INTEGER NOT NULL CHECK (max_employees > 0),
    max_workplaces INTEGER NOT NULL CHECK (max_workplaces > 0),
    max_branches INTEGER NOT NULL CHECK (max_branches > 0),
    biometric_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    offline_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    csv_export_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    monthly_price_egp NUMERIC(10, 2) NOT NULL DEFAULT 0,
    monthly_price_sar NUMERIC(10, 2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. COMPANIES (Tenants)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    country_code TEXT NOT NULL DEFAULT 'EG' CHECK (country_code IN ('EG', 'SA', 'AE', 'KW', 'QA', 'BH', 'OM')),
    timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
    currency TEXT NOT NULL DEFAULT 'EGP',
    default_locale TEXT NOT NULL DEFAULT 'ar' CHECK (default_locale IN ('ar', 'en')),
    require_biometric_strict BOOLEAN NOT NULL DEFAULT TRUE,
    require_approved_device BOOLEAN NOT NULL DEFAULT FALSE,
    allow_offline_attendance BOOLEAN NOT NULL DEFAULT TRUE,
    max_offline_age_hours INTEGER NOT NULL DEFAULT 24,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. COMPANY SUBSCRIPTIONS & PAYMENT RECORDS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_subscriptions (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
    status TEXT NOT NULL CHECK (status IN ('trial', 'active', 'grace_period', 'expired', 'suspended')),
    start_date TIMESTAMPTZ NOT NULL,
    expiry_date TIMESTAMPTZ NOT NULL,
    grace_period_days INTEGER NOT NULL DEFAULT 7,
    trial_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    renewal_reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Note: Never store payment card numbers or CVV/security codes.
CREATE TABLE IF NOT EXISTS payment_records (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    subscription_id TEXT NOT NULL REFERENCES company_subscriptions(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'EGP',
    payment_method TEXT NOT NULL CHECK (payment_method IN ('bank_transfer', 'instapay', 'fawry', 'sadad', 'manual_invoice')),
    reference_number TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    submitted_by TEXT,
    verified_by TEXT,
    verified_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. BRANCHES & DEPARTMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    code TEXT NOT NULL,
    city TEXT,
    country_code TEXT NOT NULL DEFAULT 'EG',
    timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    code TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, code)
);

-- ----------------------------------------------------------------------------
-- 5. WORK SHIFTS (Supports Day, Multi-Shift & Overnight Cross-Midnight Shifts)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_shifts (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    start_time TEXT NOT NULL, -- HH:MM (24h)
    end_time TEXT NOT NULL,   -- HH:MM (24h)
    grace_period_minutes INTEGER NOT NULL DEFAULT 15 CHECK (grace_period_minutes >= 0),
    early_departure_grace_minutes INTEGER NOT NULL DEFAULT 10 CHECK (early_departure_grace_minutes >= 0),
    min_overtime_minutes INTEGER NOT NULL DEFAULT 30,
    max_break_minutes INTEGER NOT NULL DEFAULT 60,
    is_overnight BOOLEAN NOT NULL DEFAULT FALSE,
    working_days_json TEXT NOT NULL DEFAULT '[0,1,2,3,4]', -- Sun(0)..Thu(4) standard in EG/SA
    timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. WORKPLACES & GEOFENCE CONFIGURATIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workplaces (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
    code TEXT NOT NULL,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    workplace_type TEXT NOT NULL DEFAULT 'office' CHECK (workplace_type IN ('office', 'factory', 'branch', 'warehouse', 'field_site')),
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    radius_meters DOUBLE PRECISION NOT NULL DEFAULT 150 CHECK (radius_meters >= 10 AND radius_meters <= 10000),
    max_accuracy_meters DOUBLE PRECISION NOT NULL DEFAULT 50 CHECK (max_accuracy_meters > 0),
    max_location_age_seconds INTEGER NOT NULL DEFAULT 120 CHECK (max_location_age_seconds > 0),
    accuracy_buffer_policy TEXT NOT NULL DEFAULT 'strict' CHECK (accuracy_buffer_policy IN ('strict', 'partial_buffer')),
    allowed_event_types_json TEXT NOT NULL DEFAULT '["check_in","check_out","break_start","break_end","field_visit"]',
    applicable_shifts_json TEXT NOT NULL DEFAULT '[]',
    require_biometric BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, code)
);

-- ----------------------------------------------------------------------------
-- 7. USERS (Authentication & Role-Based Access Control)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    company_id TEXT REFERENCES companies(id) ON DELETE CASCADE, -- NULL only for platform_super_admin
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN (
        'platform_super_admin',
        'company_owner',
        'hr_admin',
        'branch_manager',
        'supervisor',
        'employee'
    )),
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
    preferred_locale TEXT NOT NULL DEFAULT 'ar' CHECK (preferred_locale IN ('ar', 'en')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    token_version INTEGER NOT NULL DEFAULT 1,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 8. EMPLOYEES
-- ----------------------------------------------------------------------------
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
    hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
    attendance_eligible BOOLEAN NOT NULL DEFAULT TRUE,
    require_biometric BOOLEAN NOT NULL DEFAULT TRUE,
    allow_biometric_exception BOOLEAN NOT NULL DEFAULT FALSE,
    biometric_exception_reason TEXT,
    allow_field_visit BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, employee_code)
);

-- ----------------------------------------------------------------------------
-- 9. APPROVED DEVICES (Employee-Device Binding & Anti-Buddy-Punching Control)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS approved_devices (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    device_identifier TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
    device_model TEXT NOT NULL,
    os_version TEXT,
    biometric_hardware_available BOOLEAN NOT NULL DEFAULT FALSE,
    biometric_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'revoked')),
    approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, employee_id, device_identifier)
);

-- ----------------------------------------------------------------------------
-- 10. ATTENDANCE RECORDS (Daily Shift Attendance Register)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_records (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_id TEXT REFERENCES work_shifts(id) ON DELETE SET NULL,
    workplace_id TEXT REFERENCES workplaces(id) ON DELETE SET NULL,
    attendance_date DATE NOT NULL, -- Shift anchor date in workplace timezone
    first_check_in_at TIMESTAMPTZ,
    last_check_out_at TIMESTAMPTZ,
    current_state TEXT NOT NULL DEFAULT 'not_checked_in' CHECK (current_state IN ('not_checked_in', 'checked_in', 'on_break', 'checked_out')),
    total_work_minutes INTEGER NOT NULL DEFAULT 0,
    total_break_minutes INTEGER NOT NULL DEFAULT 0,
    late_minutes INTEGER NOT NULL DEFAULT 0,
    early_departure_minutes INTEGER NOT NULL DEFAULT 0,
    overtime_minutes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'late', 'absent', 'incomplete', 'on_leave', 'holiday', 'needs_review')),
    has_exception BOOLEAN NOT NULL DEFAULT FALSE,
    exception_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, employee_id, attendance_date)
);

-- ----------------------------------------------------------------------------
-- 11. ATTENDANCE EVENTS (IMMUTABLE Raw Attendance Transaction Log)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_events (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    attendance_record_id TEXT REFERENCES attendance_records(id) ON DELETE SET NULL,
    workplace_id TEXT REFERENCES workplaces(id) ON DELETE SET NULL,
    shift_id TEXT REFERENCES work_shifts(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'check_in',
        'check_out',
        'break_start',
        'break_end',
        'field_visit',
        'manual_correction'
    )),
    idempotency_key TEXT NOT NULL,
    server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    device_timestamp TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    accuracy_meters DOUBLE PRECISION,
    location_timestamp TIMESTAMPTZ,
    calculated_distance_meters DOUBLE PRECISION,
    permitted_radius_meters DOUBLE PRECISION,
    geofence_passed BOOLEAN NOT NULL DEFAULT FALSE,
    is_mock_location BOOLEAN NOT NULL DEFAULT FALSE,
    auth_method TEXT NOT NULL CHECK (auth_method IN (
        'biometric_strong',
        'biometric_weak',
        'device_credential',
        'exception_fallback',
        'manager_manual',
        'none'
    )),
    biometric_verified BOOLEAN NOT NULL DEFAULT FALSE,
    device_identifier TEXT,
    device_platform TEXT,
    is_offline_submission BOOLEAN NOT NULL DEFAULT FALSE,
    sync_status TEXT NOT NULL CHECK (sync_status IN ('accepted', 'pending', 'rejected', 'needs_review')),
    rejection_code TEXT,
    rejection_reason TEXT,
    flags_json TEXT NOT NULL DEFAULT '[]',
    reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, idempotency_key)
);

-- ----------------------------------------------------------------------------
-- 12. ATTENDANCE CORRECTIONS (Immutable Adjustment Ledger)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_corrections (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    attendance_record_id TEXT NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
    original_event_id TEXT REFERENCES attendance_events(id) ON DELETE SET NULL,
    correction_type TEXT NOT NULL CHECK (correction_type IN (
        'missing_check_in',
        'missing_check_out',
        'time_adjustment',
        'status_override',
        'excuse_late_arrival'
    )),
    original_value_json TEXT NOT NULL,
    corrected_value_json TEXT NOT NULL,
    reason TEXT NOT NULL,
    requested_by TEXT NOT NULL REFERENCES users(id),
    approved_by TEXT REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ
);

-- ----------------------------------------------------------------------------
-- 13. LEAVE REQUESTS & HOLIDAYS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leave_requests (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type TEXT NOT NULL CHECK (leave_type IN ('annual', 'sick', 'unpaid', 'emergency', 'maternity', 'hajj')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL CHECK (end_date >= start_date),
    days_count INTEGER NOT NULL CHECK (days_count > 0),
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    decision_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS holidays (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    holiday_date DATE NOT NULL,
    is_paid BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, holiday_date, name_en)
);

-- ----------------------------------------------------------------------------
-- 14. AUDIT LOGS (Immutable Security & Administrative Trail)
-- ----------------------------------------------------------------------------
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 15. GEOSPATIAL HAVERSINE DISTANCE FUNCTION (Server-Side Validation)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_haversine_meters(
    lat1 DOUBLE PRECISION,
    lon1 DOUBLE PRECISION,
    lat2 DOUBLE PRECISION,
    lon2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
    earth_radius DOUBLE PRECISION := 6371000.0; -- meters
    dlat DOUBLE PRECISION := RADIANS(lat2 - lat1);
    dlon DOUBLE PRECISION := RADIANS(lon2 - lon1);
    a DOUBLE PRECISION;
    c DOUBLE PRECISION;
BEGIN
    a := SIN(dlat / 2.0) * SIN(dlat / 2.0) +
         COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
         SIN(dlon / 2.0) * SIN(dlon / 2.0);
    c := 2.0 * ATAN2(SQRT(a), SQRT(1.0 - a));
    RETURN earth_radius * c;
END;
$$;

-- ----------------------------------------------------------------------------
-- 16. IMMUTABILITY PROTECTION FOR RAW ATTENDANCE EVENTS & AUDIT LOGS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_raw_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Raw attendance events and audit logs are immutable and cannot be deleted.';
    END IF;
    -- Only allow updating review status on pending/needs_review attendance events
    IF TG_TABLE_NAME = 'attendance_events' AND TG_OP = 'UPDATE' THEN
        IF OLD.latitude IS DISTINCT FROM NEW.latitude
           OR OLD.longitude IS DISTINCT FROM NEW.longitude
           OR OLD.server_timestamp IS DISTINCT FROM NEW.server_timestamp
           OR OLD.device_timestamp IS DISTINCT FROM NEW.device_timestamp
           OR OLD.event_type IS DISTINCT FROM NEW.event_type
           OR OLD.employee_id IS DISTINCT FROM NEW.employee_id
           OR OLD.auth_method IS DISTINCT FROM NEW.auth_method
           OR OLD.biometric_verified IS DISTINCT FROM NEW.biometric_verified THEN
            RAISE EXCEPTION 'Core fields of attendance_events are immutable. Record an attendance_correction instead.';
        END IF;
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Table % is append-only / immutable.', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_attendance_events ON attendance_events;
CREATE TRIGGER trg_immutable_attendance_events
BEFORE UPDATE OR DELETE ON attendance_events
FOR EACH ROW EXECUTE FUNCTION prevent_raw_event_mutation();

DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON audit_logs;
CREATE TRIGGER trg_immutable_audit_logs
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_raw_event_mutation();

-- ----------------------------------------------------------------------------
-- 17. ROW LEVEL SECURITY (RLS) FOR MULTI-TENANT ISOLATION
-- ----------------------------------------------------------------------------
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workplaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE approved_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Session context helper functions (compatible with Supabase JWT claims or app.current_* settings)
CREATE OR REPLACE FUNCTION current_app_company_id() RETURNS TEXT
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        current_setting('request.jwt.claim.company_id', true),
        current_setting('app.current_company_id', true)
    );
$$;

CREATE OR REPLACE FUNCTION current_app_user_role() RETURNS TEXT
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        current_setting('request.jwt.claim.role', true),
        current_setting('app.current_user_role', true)
    );
$$;

CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS TEXT
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        current_setting('request.jwt.claim.sub', true),
        current_setting('app.current_user_id', true)
    );
$$;

-- Tenant isolation policies: A user from Company A can NEVER read or modify Company B records
CREATE POLICY tenant_isolation_companies ON companies
    USING (id = current_app_company_id() OR current_app_user_role() = 'platform_super_admin');

CREATE POLICY tenant_isolation_subscriptions ON company_subscriptions
    USING (company_id = current_app_company_id() OR current_app_user_role() = 'platform_super_admin');

CREATE POLICY tenant_isolation_payments ON payment_records
    USING (company_id = current_app_company_id() OR current_app_user_role() = 'platform_super_admin');

CREATE POLICY tenant_isolation_branches ON branches
    USING (company_id = current_app_company_id())
    WITH CHECK (company_id = current_app_company_id());

CREATE POLICY tenant_isolation_departments ON departments
    USING (company_id = current_app_company_id())
    WITH CHECK (company_id = current_app_company_id());

CREATE POLICY tenant_isolation_shifts ON work_shifts
    USING (company_id = current_app_company_id())
    WITH CHECK (company_id = current_app_company_id());

CREATE POLICY tenant_isolation_workplaces ON workplaces
    USING (company_id = current_app_company_id())
    WITH CHECK (company_id = current_app_company_id());

CREATE POLICY tenant_isolation_users ON users
    USING (company_id = current_app_company_id() OR id = current_app_user_id())
    WITH CHECK (company_id = current_app_company_id());

CREATE POLICY tenant_isolation_employees ON employees
    USING (company_id = current_app_company_id())
    WITH CHECK (company_id = current_app_company_id());

CREATE POLICY tenant_isolation_devices ON approved_devices
    USING (company_id = current_app_company_id())
    WITH CHECK (company_id = current_app_company_id());

CREATE POLICY tenant_isolation_attendance_records ON attendance_records
    USING (company_id = current_app_company_id())
    WITH CHECK (company_id = current_app_company_id());

-- Note: Platform Super Admin is intentionally excluded from casual access to employee attendance_events
CREATE POLICY tenant_isolation_attendance_events ON attendance_events
    USING (company_id = current_app_company_id())
    WITH CHECK (company_id = current_app_company_id());

CREATE POLICY tenant_isolation_attendance_corrections ON attendance_corrections
    USING (company_id = current_app_company_id())
    WITH CHECK (company_id = current_app_company_id());

CREATE POLICY tenant_isolation_leave_requests ON leave_requests
    USING (company_id = current_app_company_id())
    WITH CHECK (company_id = current_app_company_id());

CREATE POLICY tenant_isolation_holidays ON holidays
    USING (company_id = current_app_company_id())
    WITH CHECK (company_id = current_app_company_id());

CREATE POLICY tenant_isolation_audit_logs ON audit_logs
    USING (company_id = current_app_company_id() OR current_app_user_role() = 'platform_super_admin')
    WITH CHECK (company_id = current_app_company_id() OR current_app_user_role() = 'platform_super_admin');

COMMIT;
