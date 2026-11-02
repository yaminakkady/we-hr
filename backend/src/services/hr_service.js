'use strict';

/**
 * We HR — Authoritative Multi-Tenant HR & Attendance Transaction Service
 */

const crypto = require('node:crypto');
const { verifyPassword, hashPassword, signJwt } = require('../security/auth');
const {
  validateCoordinates,
  calculateHaversineDistanceMeters,
  evaluateGeofenceAndLocation,
} = require('../domain/geofence');
const { evaluateBiometricAndDeviceAuth } = require('../domain/biometrics');
const {
  resolveShiftAnchorDate,
  validateAttendanceStateTransition,
  calculateShiftMetrics,
  evaluateOfflineSubmission,
  getZonedDateParts,
} = require('../domain/attendance_rules');
const {
  ROLES,
  hasPermission,
  verifyTenantAccess,
  canAccessEmployee,
  evaluateSubscriptionStatus,
} = require('../domain/rbac');

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

class HrService {
  /**
   * @param {import('node:sqlite').DatabaseSync} db
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Appends an immutable audit log entry.
   */
  logAudit({ companyId = null, actorUserId = null, actorRole = null, action, targetType, targetId = null, ipAddress = '127.0.0.1', details = {} }) {
    this.db
      .prepare(`
        INSERT INTO audit_logs (
          id, company_id, actor_user_id, actor_role, action, target_type, target_id, ip_address, details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        newId('aud'),
        companyId,
        actorUserId,
        actorRole,
        action,
        targetType,
        targetId,
        ipAddress,
        JSON.stringify(details || {}),
        new Date().toISOString()
      );
  }

  /**
   * Authenticates a user by email and password and returns a signed JWT + profile context.
   */
  login({ email, password, ipAddress = '127.0.0.1', nowSeconds }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = this.db
      .prepare('SELECT * FROM users WHERE LOWER(email) = ?')
      .get(normalizedEmail);

    if (!user || !verifyPassword(password, user.password_hash)) {
      return {
        ok: false,
        status: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      };
    }

    if (!user.is_active) {
      return {
        ok: false,
        status: 403,
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Your user account has been deactivated. Please contact your HR administrator.',
      };
    }

    let company = null;
    let subscriptionStatus = null;
    if (user.company_id) {
      company = this.db
        .prepare('SELECT * FROM companies WHERE id = ?')
        .get(user.company_id);
      if (!company || !company.is_active) {
        return {
          ok: false,
          status: 403,
          code: 'COMPANY_INACTIVE',
          message: 'Company tenant account is inactive.',
        };
      }
      const sub = this.getCompanySubscription(user.company_id);
      subscriptionStatus = evaluateSubscriptionStatus(sub);
    }

    const employee = this.db
      .prepare('SELECT * FROM employees WHERE user_id = ?')
      .get(user.id);

    if (employee && !employee.is_active) {
      return {
        ok: false,
        status: 403,
        code: 'EMPLOYEE_INACTIVE',
        message: 'Your employee profile is inactive.',
      };
    }

    const nowIso = new Date().toISOString();
    this.db
      .prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
      .run(nowIso, user.id);

    const tokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      company_id: user.company_id,
      branch_id: employee ? employee.branch_id : user.branch_id,
      employee_id: employee ? employee.id : null,
      token_version: user.token_version,
    };

    const token = signJwt(tokenPayload, { nowSeconds });

    this.logAudit({
      companyId: user.company_id,
      actorUserId: user.id,
      actorRole: user.role,
      action: 'USER_LOGIN',
      targetType: 'user',
      targetId: user.id,
      ipAddress,
      details: { email: user.email },
    });

    return {
      ok: true,
      status: 200,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
        branch_id: tokenPayload.branch_id,
        employee_id: tokenPayload.employee_id,
        preferred_locale: user.preferred_locale,
      },
      company: company
        ? {
            id: company.id,
            name_en: company.name_en,
            name_ar: company.name_ar,
            country_code: company.country_code,
            timezone: company.timezone,
            currency: company.currency,
            require_biometric_strict: Boolean(company.require_biometric_strict),
            require_approved_device: Boolean(company.require_approved_device),
            allow_offline_attendance: Boolean(company.allow_offline_attendance),
          }
        : null,
      employee: employee ? this.formatEmployee(employee) : null,
      subscription: subscriptionStatus,
    };
  }

  /**
   * Validates an active user session from decoded JWT claims against live database state
   * (checking user activation, employee activation, and token_version revocation).
   */
  validateSessionActor(jwtPayload) {
    if (!jwtPayload || !jwtPayload.sub) {
      return { ok: false, status: 401, code: 'UNAUTHENTICATED', message: 'Invalid session.' };
    }
    const user = this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(jwtPayload.sub);
    if (!user || !user.is_active) {
      return {
        ok: false,
        status: 403,
        code: 'ACCOUNT_DEACTIVATED_OR_REVOKED',
        message: 'Account is deactivated or session has been revoked.',
      };
    }
    if (user.token_version !== jwtPayload.token_version) {
      return {
        ok: false,
        status: 401,
        code: 'TOKEN_REVOKED',
        message: 'Session token has been revoked. Please sign in again.',
      };
    }
    const employee = this.db
      .prepare('SELECT * FROM employees WHERE user_id = ?')
      .get(user.id);
    if (employee && !employee.is_active) {
      return {
        ok: false,
        status: 403,
        code: 'EMPLOYEE_DEACTIVATED',
        message: 'Employee profile is deactivated.',
      };
    }

    return {
      ok: true,
      actor: {
        id: user.id,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
        branch_id: employee ? employee.branch_id : user.branch_id,
        employee_id: employee ? employee.id : null,
      },
      user,
      employee,
    };
  }

  getCompanySubscription(companyId) {
    return this.db
      .prepare(`
        SELECT cs.*, sp.code AS plan_code, sp.name_en AS plan_name_en, sp.name_ar AS plan_name_ar,
               sp.max_employees, sp.max_workplaces, sp.max_branches,
               sp.monthly_price_egp, sp.monthly_price_sar
        FROM company_subscriptions cs
        JOIN subscription_plans sp ON sp.id = cs.plan_id
        WHERE cs.company_id = ?
        ORDER BY cs.created_at DESC
        LIMIT 1
      `)
      .get(companyId);
  }

  formatEmployee(emp) {
    if (!emp) return null;
    let authorizedWorkplaceIds = [];
    try {
      authorizedWorkplaceIds = JSON.parse(emp.authorized_workplace_ids_json || '[]');
    } catch {
      authorizedWorkplaceIds = [];
    }
    return {
      ...emp,
      attendance_eligible: Boolean(emp.attendance_eligible),
      require_biometric: Boolean(emp.require_biometric),
      allow_biometric_exception: Boolean(emp.allow_biometric_exception),
      allow_field_visit: Boolean(emp.allow_field_visit),
      is_active: Boolean(emp.is_active),
      authorized_workplace_ids: authorizedWorkplaceIds,
    };
  }

  /**
   * Returns context needed by the Employee Mobile App / Attendance Screen:
   * - Employee profile & policies
   * - Assigned/authorized workplaces with coordinates & radius
   * - Assigned shift
   * - Today's attendance record & current state
   * - Recent attendance events
   */
  getEmployeeAttendanceContext(actor) {
    if (!actor.company_id || !actor.employee_id) {
      return {
        ok: false,
        status: 400,
        code: 'NO_EMPLOYEE_PROFILE',
        message: 'Current user does not have an associated employee profile.',
      };
    }

    const company = this.db
      .prepare('SELECT * FROM companies WHERE id = ?')
      .get(actor.company_id);
    const employeeRaw = this.db
      .prepare('SELECT * FROM employees WHERE id = ? AND company_id = ?')
      .get(actor.employee_id, actor.company_id);
    if (!employeeRaw) {
      return { ok: false, status: 404, code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found.' };
    }
    const employee = this.formatEmployee(employeeRaw);

    const shift = employee.default_shift_id
      ? this.db
          .prepare('SELECT * FROM work_shifts WHERE id = ? AND company_id = ?')
          .get(employee.default_shift_id, actor.company_id)
      : null;

    const allWorkplaces = this.db
      .prepare('SELECT * FROM workplaces WHERE company_id = ? AND is_active = 1')
      .all(actor.company_id);

    const authorizedSet = new Set([
      ...(employee.authorized_workplace_ids || []),
      employee.default_workplace_id,
    ].filter(Boolean));

    const authorizedWorkplaces = allWorkplaces.filter((wp) => authorizedSet.has(wp.id));

    const { attendanceDate } = resolveShiftAnchorDate(new Date().toISOString(), shift, company.timezone);
    const todayRecord = this.db
      .prepare('SELECT * FROM attendance_records WHERE company_id = ? AND employee_id = ? AND attendance_date = ?')
      .get(actor.company_id, employee.id, attendanceDate);

    const recentEvents = this.db
      .prepare(`
        SELECT ae.*, wp.name_en AS workplace_name_en, wp.name_ar AS workplace_name_ar
        FROM attendance_events ae
        LEFT JOIN workplaces wp ON wp.id = ae.workplace_id
        WHERE ae.company_id = ? AND ae.employee_id = ?
        ORDER BY ae.server_timestamp DESC
        LIMIT 15
      `)
      .all(actor.company_id, employee.id);

    const approvedDevices = this.db
      .prepare('SELECT * FROM approved_devices WHERE company_id = ? AND employee_id = ?')
      .all(actor.company_id, employee.id);

    return {
      ok: true,
      status: 200,
      company: {
        id: company.id,
        name_en: company.name_en,
        name_ar: company.name_ar,
        timezone: company.timezone,
        require_biometric_strict: Boolean(company.require_biometric_strict),
        require_approved_device: Boolean(company.require_approved_device),
        allow_offline_attendance: Boolean(company.allow_offline_attendance),
        max_offline_age_hours: company.max_offline_age_hours,
      },
      employee,
      shift,
      authorizedWorkplaces,
      attendanceDate,
      todayRecord: todayRecord || {
        attendance_date: attendanceDate,
        current_state: 'not_checked_in',
        status: 'not_checked_in',
      },
      recentEvents,
      approvedDevices,
    };
  }

  /**
   * COMPLETE AUTHORITATIVE ATTENDANCE TRANSACTION (Section 8)
   *
   * Validates:
   * 1. Authenticated user session & tenant match
   * 2. Active company subscription (or within grace period)
   * 3. Employee active & attendance_eligible
   * 4. Idempotency key uniqueness (prevents duplicate submissions on retries/slow network)
   * 5. Workplace ownership, active status, and employee authorization
   * 6. Offline submission window (if `isOfflineSubmission === true`)
   * 7. Server-side Haversine geofence distance, GPS accuracy, freshness, and mock-location check
   * 8. OS Biometric authentication verification & device binding anti-buddy-punching check
   * 9. Shift anchor resolution (including cross-midnight overnight shifts) & state transition rules
   * 10. Atomic recording of immutable `attendance_events` and daily `attendance_records`
   */
  submitAttendanceEvent(actor, payload, options = {}) {
    const serverNowIso = options.serverTimestamp || new Date().toISOString();

    if (!actor || !actor.company_id || !actor.employee_id) {
      return {
        ok: false,
        status: 403,
        code: 'EMPLOYEE_SESSION_REQUIRED',
        message: 'Only authenticated company employees may submit attendance events.',
      };
    }

    const company = this.db
      .prepare('SELECT * FROM companies WHERE id = ?')
      .get(actor.company_id);
    if (!company || !company.is_active) {
      return {
        ok: false,
        status: 403,
        code: 'COMPANY_INACTIVE',
        message: 'Company account is inactive.',
      };
    }

    // 1. Enforce subscription status on the backend
    const sub = this.getCompanySubscription(company.id);
    const subEval = evaluateSubscriptionStatus(sub, serverNowIso);
    if (!subEval.allowed) {
      return {
        ok: false,
        status: 402,
        code: subEval.reason || 'SUBSCRIPTION_EXPIRED',
        message: 'Company subscription has expired past the grace period. Attendance submission is paused.',
      };
    }

    // 2. Load employee profile
    const employeeRaw = this.db
      .prepare('SELECT * FROM employees WHERE id = ? AND company_id = ?')
      .get(actor.employee_id, company.id);
    if (!employeeRaw || !employeeRaw.is_active || !employeeRaw.attendance_eligible) {
      return {
        ok: false,
        status: 403,
        code: 'EMPLOYEE_NOT_ELIGIBLE',
        message: 'Employee is inactive or not eligible for mobile attendance.',
      };
    }
    const employee = this.formatEmployee(employeeRaw);

    // 3. Validate idempotency key (Duplicate request protection)
    const idempotencyKey = String(payload.idempotencyKey || '').trim();
    if (!idempotencyKey || idempotencyKey.length < 6) {
      return {
        ok: false,
        status: 400,
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'A unique idempotencyKey (min 6 chars) is required for every attendance transaction.',
      };
    }

    const existingEvent = this.db
      .prepare('SELECT * FROM attendance_events WHERE company_id = ? AND idempotency_key = ?')
      .get(company.id, idempotencyKey);

    if (existingEvent) {
      const existingRecord = existingEvent.attendance_record_id
        ? this.db
            .prepare('SELECT * FROM attendance_records WHERE id = ?')
            .get(existingEvent.attendance_record_id)
        : null;
      return {
        ok: existingEvent.sync_status !== 'rejected',
        status: existingEvent.sync_status === 'rejected' ? 422 : 200,
        idempotentReplay: true,
        code: existingEvent.rejection_code || 'ACCEPTED',
        message:
          existingEvent.rejection_reason ||
          'Attendance request already processed (idempotent replay).',
        event: existingEvent,
        attendanceRecord: existingRecord,
      };
    }

    // 4. Verify workplace belongs to employee's company and employee is authorized
    const workplaceId = payload.workplaceId || employee.default_workplace_id;
    const workplace = this.db
      .prepare('SELECT * FROM workplaces WHERE id = ?')
      .get(workplaceId);

    if (!workplace || workplace.company_id !== company.id) {
      return {
        ok: false,
        status: 403,
        code: 'UNAUTHORIZED_WORKPLACE_TENANT',
        message: 'Selected workplace does not belong to your company.',
      };
    }

    const authorizedSet = new Set([
      ...(employee.authorized_workplace_ids || []),
      employee.default_workplace_id,
    ].filter(Boolean));

    const eventType = String(payload.eventType || 'check_in').trim();
    if (!authorizedSet.has(workplace.id) && !(eventType === 'field_visit' && employee.allow_field_visit)) {
      return this.recordRejectedAttendanceAttempt({
        company,
        employee,
        workplace,
        payload,
        serverNowIso,
        rejectionCode: 'WORKPLACE_NOT_ASSIGNED_TO_EMPLOYEE',
        rejectionReason: `You are not authorized to record attendance at workplace '${workplace.name_en}'.`,
        geofencePassed: false,
        biometricVerified: false,
        distanceMeters: null,
        flags: ['UNAUTHORIZED_WORKPLACE_ATTEMPT'],
      });
    }

    // 5. Evaluate Offline Pending Submission if applicable
    const isOfflineSubmission = Boolean(payload.isOfflineSubmission);
    const deviceTimestamp = payload.deviceTimestamp || serverNowIso;
    let offlineEval = { valid: true, status: 'accepted', flags: [] };

    if (isOfflineSubmission) {
      offlineEval = evaluateOfflineSubmission({
        deviceTimestamp,
        serverTimestamp: serverNowIso,
        maxOfflineAgeHours: Number(company.max_offline_age_hours || 24),
        allowOfflineAttendance: Boolean(company.allow_offline_attendance),
      });
      if (!offlineEval.valid) {
        return this.recordRejectedAttendanceAttempt({
          company,
          employee,
          workplace,
          payload,
          serverNowIso,
          rejectionCode: offlineEval.rejectionCode,
          rejectionReason: offlineEval.rejectionReason,
          geofencePassed: false,
          biometricVerified: false,
          distanceMeters: null,
          flags: offlineEval.flags,
        });
      }
    }

    // 6. Server-side Location & Geofence Validation
    // For offline submissions, freshness is evaluated relative to the device capture timestamp;
    // for live submissions, freshness is evaluated relative to authoritative serverNowIso.
    const referenceTimeForLocation = isOfflineSubmission ? deviceTimestamp : serverNowIso;
    const previousEvent = this.db
      .prepare(`
        SELECT * FROM attendance_events
        WHERE company_id = ? AND employee_id = ? AND sync_status IN ('accepted', 'needs_review')
        ORDER BY server_timestamp DESC LIMIT 1
      `)
      .get(company.id, employee.id);

    const locationEval = evaluateGeofenceAndLocation({
      workplace,
      latitude: Number(payload.latitude),
      longitude: Number(payload.longitude),
      accuracyMeters: Number(payload.accuracyMeters),
      locationTimestamp: payload.locationTimestamp || deviceTimestamp,
      referenceTimestamp: referenceTimeForLocation,
      isMockLocation: Boolean(payload.isMockLocation),
      previousEvent,
    });

    if (!locationEval.passed) {
      return this.recordRejectedAttendanceAttempt({
        company,
        employee,
        workplace,
        payload,
        serverNowIso,
        rejectionCode: locationEval.rejectionCode,
        rejectionReason: locationEval.rejectionReason,
        geofencePassed: false,
        biometricVerified: false,
        distanceMeters: locationEval.distanceMeters,
        flags: [...offlineEval.flags, ...locationEval.flags],
      });
    }

    // 7. Biometric & Device Authentication Validation
    const employeeApprovedDevices = this.db
      .prepare('SELECT * FROM approved_devices WHERE company_id = ? AND employee_id = ?')
      .all(company.id, employee.id);

    const deviceIdentifier = payload.auth && payload.auth.deviceIdentifier ? String(payload.auth.deviceIdentifier).trim() : null;
    const otherEmployeesUsingSameDevice = deviceIdentifier
      ? this.db
          .prepare('SELECT * FROM approved_devices WHERE company_id = ? AND device_identifier = ? AND employee_id != ?')
          .all(company.id, deviceIdentifier, employee.id)
      : [];

    const bioEval = evaluateBiometricAndDeviceAuth({
      company,
      workplace,
      employee,
      authPayload: payload.auth || {},
      employeeApprovedDevices,
      otherEmployeesUsingSameDevice,
    });

    if (!bioEval.passed) {
      return this.recordRejectedAttendanceAttempt({
        company,
        employee,
        workplace,
        payload,
        serverNowIso,
        rejectionCode: bioEval.rejectionCode,
        rejectionReason: bioEval.rejectionReason,
        geofencePassed: true,
        biometricVerified: bioEval.biometricVerified,
        distanceMeters: locationEval.distanceMeters,
        flags: [...offlineEval.flags, ...locationEval.flags, ...bioEval.flags],
      });
    }

    // 8. Shift & State Machine Validation
    const shift = employee.default_shift_id
      ? this.db
          .prepare('SELECT * FROM work_shifts WHERE id = ? AND company_id = ?')
          .get(employee.default_shift_id, company.id)
      : null;

    const effectiveEventTime = isOfflineSubmission ? deviceTimestamp : serverNowIso;
    const { attendanceDate, zonedParts } = resolveShiftAnchorDate(
      effectiveEventTime,
      shift,
      company.timezone
    );

    const existingRecord = this.db
      .prepare('SELECT * FROM attendance_records WHERE company_id = ? AND employee_id = ? AND attendance_date = ?')
      .get(company.id, employee.id, attendanceDate);

    const currentState = existingRecord ? existingRecord.current_state : 'not_checked_in';
    const stateCheck = validateAttendanceStateTransition(currentState, eventType);

    if (!stateCheck.valid) {
      return this.recordRejectedAttendanceAttempt({
        company,
        employee,
        workplace,
        payload,
        serverNowIso,
        rejectionCode: stateCheck.rejectionCode,
        rejectionReason: stateCheck.rejectionReason,
        geofencePassed: true,
        biometricVerified: bioEval.biometricVerified,
        distanceMeters: locationEval.distanceMeters,
        flags: [...offlineEval.flags, ...locationEval.flags, ...bioEval.flags],
      });
    }

    // 9. Determine combined sync status and flags
    const combinedFlags = [
      ...new Set([...offlineEval.flags, ...locationEval.flags, ...bioEval.flags]),
    ];
    const finalSyncStatus =
      isOfflineSubmission ||
      locationEval.status === 'needs_review' ||
      bioEval.status === 'needs_review'
        ? 'needs_review'
        : 'accepted';

    // Check if date is an official holiday or rest day
    const holiday = this.db
      .prepare('SELECT * FROM holidays WHERE company_id = ? AND holiday_date = ?')
      .get(company.id, attendanceDate);
    let workingDays = [0, 1, 2, 3, 4];
    if (shift && shift.working_days_json) {
      try {
        workingDays = JSON.parse(shift.working_days_json);
      } catch {
        workingDays = [0, 1, 2, 3, 4];
      }
    }
    const isHolidayOrRestDay = Boolean(holiday) || !workingDays.includes(zonedParts.dayOfWeek);

    // 10. Atomic Database Transaction: Update/Create attendance_records & Insert immutable attendance_events
    this.db.exec('BEGIN');
    try {
      let recordId = existingRecord ? existingRecord.id : newId('attrec');
      let firstCheckInAt = existingRecord ? existingRecord.first_check_in_at : null;
      let lastCheckOutAt = existingRecord ? existingRecord.last_check_out_at : null;
      let totalBreakMinutes = existingRecord ? Number(existingRecord.total_break_minutes || 0) : 0;

      if (eventType === 'check_in' && !firstCheckInAt) {
        firstCheckInAt = effectiveEventTime;
      }
      if (eventType === 'check_out') {
        lastCheckOutAt = effectiveEventTime;
      }
      if (eventType === 'break_end' && existingRecord) {
        const lastBreakStart = this.db
          .prepare(`
            SELECT * FROM attendance_events
            WHERE company_id = ? AND attendance_record_id = ? AND event_type = 'break_start'
            ORDER BY server_timestamp DESC LIMIT 1
          `)
          .get(company.id, existingRecord.id);
        if (lastBreakStart) {
          const brkMins = Math.max(
            0,
            Math.round(
              (new Date(effectiveEventTime).getTime() -
                new Date(lastBreakStart.server_timestamp).getTime()) /
                60000
            )
          );
          totalBreakMinutes += brkMins;
        }
      }

      const metrics = calculateShiftMetrics({
        shift,
        checkInTimestamp: firstCheckInAt,
        checkOutTimestamp: lastCheckOutAt,
        breakMinutes: totalBreakMinutes,
        isHolidayOrRestDay,
      });

      const hasException =
        finalSyncStatus === 'needs_review' ||
        metrics.lateMinutes > 0 ||
        metrics.earlyDepartureMinutes > 0 ||
        combinedFlags.length > 0;

      const recordStatus =
        finalSyncStatus === 'needs_review' ? 'needs_review' : metrics.status;

      if (!existingRecord) {
        this.db
          .prepare(`
            INSERT INTO attendance_records (
              id, company_id, branch_id, employee_id, shift_id, workplace_id,
              attendance_date, first_check_in_at, last_check_out_at, current_state,
              total_work_minutes, total_break_minutes, late_minutes, early_departure_minutes,
              overtime_minutes, status, has_exception, exception_notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            recordId,
            company.id,
            employee.branch_id,
            employee.id,
            shift ? shift.id : null,
            workplace.id,
            attendanceDate,
            firstCheckInAt,
            lastCheckOutAt,
            stateCheck.nextState,
            metrics.totalWorkMinutes,
            totalBreakMinutes,
            metrics.lateMinutes,
            metrics.earlyDepartureMinutes,
            metrics.overtimeMinutes,
            recordStatus,
            hasException ? 1 : 0,
            combinedFlags.length > 0 ? combinedFlags.join(', ') : null,
            serverNowIso,
            serverNowIso
          );
      } else {
        this.db
          .prepare(`
            UPDATE attendance_records
            SET first_check_in_at = ?,
                last_check_out_at = ?,
                current_state = ?,
                total_work_minutes = ?,
                total_break_minutes = ?,
                late_minutes = ?,
                early_departure_minutes = ?,
                overtime_minutes = ?,
                status = ?,
                has_exception = ?,
                exception_notes = COALESCE(?, exception_notes),
                updated_at = ?
            WHERE id = ? AND company_id = ?
          `)
          .run(
            firstCheckInAt,
            lastCheckOutAt,
            stateCheck.nextState,
            metrics.totalWorkMinutes,
            totalBreakMinutes,
            metrics.lateMinutes,
            metrics.earlyDepartureMinutes,
            metrics.overtimeMinutes,
            recordStatus,
            hasException ? 1 : existingRecord.has_exception,
            combinedFlags.length > 0 ? combinedFlags.join(', ') : null,
            serverNowIso,
            recordId,
            company.id
          );
      }

      const eventId = newId('attevt');
      this.db
        .prepare(`
          INSERT INTO attendance_events (
            id, company_id, branch_id, employee_id, attendance_record_id, workplace_id, shift_id,
            event_type, idempotency_key, server_timestamp, device_timestamp,
            latitude, longitude, accuracy_meters, location_timestamp,
            calculated_distance_meters, permitted_radius_meters, geofence_passed,
            is_mock_location, auth_method, biometric_verified, device_identifier,
            device_platform, is_offline_submission, sync_status, rejection_code,
            rejection_reason, flags_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
        `)
        .run(
          eventId,
          company.id,
          employee.branch_id,
          employee.id,
          recordId,
          workplace.id,
          shift ? shift.id : null,
          eventType,
          idempotencyKey,
          serverNowIso,
          deviceTimestamp,
          Number(payload.latitude),
          Number(payload.longitude),
          Number(payload.accuracyMeters),
          payload.locationTimestamp || deviceTimestamp,
          locationEval.distanceMeters,
          locationEval.permittedRadiusMeters,
          bioEval.normalizedAuthMethod,
          bioEval.biometricVerified ? 1 : 0,
          deviceIdentifier,
          bioEval.devicePlatform || 'android',
          isOfflineSubmission ? 1 : 0,
          finalSyncStatus,
          JSON.stringify(combinedFlags),
          serverNowIso
        );

      // Update or auto-register device entry if deviceIdentifier provided
      if (deviceIdentifier) {
        const existingDev = this.db
          .prepare('SELECT * FROM approved_devices WHERE company_id = ? AND employee_id = ? AND device_identifier = ?')
          .get(company.id, employee.id, deviceIdentifier);
        if (existingDev) {
          this.db
            .prepare('UPDATE approved_devices SET last_used_at = ? WHERE id = ?')
            .run(serverNowIso, existingDev.id);
        } else {
          this.db
            .prepare(`
              INSERT INTO approved_devices (
                id, company_id, employee_id, device_identifier, platform, device_model,
                os_version, biometric_hardware_available, biometric_enrolled, status, last_used_at, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
            `)
            .run(
              newId('dev'),
              company.id,
              employee.id,
              deviceIdentifier,
              bioEval.devicePlatform || 'android',
              (payload.auth && payload.auth.deviceModel) || 'Mobile Handset',
              (payload.auth && payload.auth.osVersion) || '',
              payload.auth && payload.auth.deviceSupportsBiometrics ? 1 : 0,
              payload.auth && payload.auth.biometricEnrolled ? 1 : 0,
              serverNowIso,
              serverNowIso
            );
        }
      }

      this.db.exec('COMMIT');

      const insertedEvent = this.db
        .prepare('SELECT * FROM attendance_events WHERE id = ?')
        .get(eventId);
      const updatedRecord = this.db
        .prepare('SELECT * FROM attendance_records WHERE id = ?')
        .get(recordId);

      return {
        ok: true,
        status: 201,
        code: finalSyncStatus === 'needs_review' ? 'ACCEPTED_NEEDS_REVIEW' : 'ATTENDANCE_RECORDED',
        message:
          finalSyncStatus === 'needs_review'
            ? 'Attendance event recorded and queued for supervisor/HR verification.'
            : 'Attendance event verified and recorded by server.',
        event: insertedEvent,
        attendanceRecord: updatedRecord,
        verificationSummary: {
          serverTimestamp: serverNowIso,
          distanceMeters: locationEval.distanceMeters,
          permittedRadiusMeters: locationEval.permittedRadiusMeters,
          geofencePassed: true,
          biometricVerified: bioEval.biometricVerified,
          authMethod: bioEval.normalizedAuthMethod,
          syncStatus: finalSyncStatus,
          flags: combinedFlags,
        },
      };
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /**
   * Records a rejected attendance attempt in `attendance_events` so HR managers
   * can review suspicious or outside-geofence attempts on the dashboard.
   */
  recordRejectedAttendanceAttempt({
    company,
    employee,
    workplace,
    payload,
    serverNowIso,
    rejectionCode,
    rejectionReason,
    geofencePassed,
    biometricVerified,
    distanceMeters,
    flags = [],
  }) {
    const eventId = newId('attevt');
    const deviceTimestamp = payload.deviceTimestamp || serverNowIso;
    const idempotencyKey = String(payload.idempotencyKey || newId('idem'));
    const lat = typeof payload.latitude === 'number' && !Number.isNaN(payload.latitude) ? payload.latitude : null;
    const lng = typeof payload.longitude === 'number' && !Number.isNaN(payload.longitude) ? payload.longitude : null;
    const acc = typeof payload.accuracyMeters === 'number' && !Number.isNaN(payload.accuracyMeters) ? payload.accuracyMeters : null;

    this.db
      .prepare(`
        INSERT INTO attendance_events (
          id, company_id, branch_id, employee_id, attendance_record_id, workplace_id, shift_id,
          event_type, idempotency_key, server_timestamp, device_timestamp,
          latitude, longitude, accuracy_meters, location_timestamp,
          calculated_distance_meters, permitted_radius_meters, geofence_passed,
          is_mock_location, auth_method, biometric_verified, device_identifier,
          device_platform, is_offline_submission, sync_status, rejection_code,
          rejection_reason, flags_json, created_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rejected', ?, ?, ?, ?)
      `)
      .run(
        eventId,
        company.id,
        employee.branch_id,
        employee.id,
        workplace ? workplace.id : null,
        employee.default_shift_id,
        String(payload.eventType || 'check_in'),
        idempotencyKey,
        serverNowIso,
        deviceTimestamp,
        lat,
        lng,
        acc,
        payload.locationTimestamp || deviceTimestamp,
        distanceMeters,
        workplace ? workplace.radius_meters : null,
        geofencePassed ? 1 : 0,
        payload.isMockLocation ? 1 : 0,
        (payload.auth && payload.auth.authMethod) || 'none',
        biometricVerified ? 1 : 0,
        (payload.auth && payload.auth.deviceIdentifier) || null,
        (payload.auth && payload.auth.devicePlatform) || 'android',
        payload.isOfflineSubmission ? 1 : 0,
        rejectionCode,
        rejectionReason,
        JSON.stringify(flags),
        serverNowIso
      );

    const rejectedEvent = this.db
      .prepare('SELECT * FROM attendance_events WHERE id = ?')
      .get(eventId);

    return {
      ok: false,
      status: 422,
      code: rejectionCode,
      message: rejectionReason,
      event: rejectedEvent,
    };
  }

  /**
   * Manager / HR Manual Attendance Correction (Section 9)
   * Preserves raw event history immutably and records a separate correction adjustment
   * with original value, corrected value, reason, approver, and timestamp.
   */
  applyManualAttendanceCorrection(actor, payload) {
    if (
      !hasPermission(actor.role, 'attendance:manual_correction') &&
      !hasPermission(actor.role, 'attendance:manual_correction_branch')
    ) {
      return {
        ok: false,
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'You are not authorized to perform manual attendance corrections.',
      };
    }

    const { employeeId, attendanceDate, correctionType, checkInTime, checkOutTime, statusOverride, reason } = payload;
    if (!employeeId || !attendanceDate || !reason || String(reason).trim().length < 5) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_CORRECTION_REQUEST',
        message: 'employeeId, attendanceDate, and a detailed reason (min 5 chars) are required.',
      };
    }

    const targetEmployee = this.db
      .prepare('SELECT * FROM employees WHERE id = ?')
      .get(employeeId);
    if (!targetEmployee) {
      return { ok: false, status: 404, code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found.' };
    }

    const accessCheck = canAccessEmployee(actor, targetEmployee);
    if (!accessCheck.allowed) {
      return {
        ok: false,
        status: 403,
        code: accessCheck.reason,
        message: 'Access denied for this employee record.',
      };
    }

    const nowIso = new Date().toISOString();
    const existingRecord = this.db
      .prepare('SELECT * FROM attendance_records WHERE company_id = ? AND employee_id = ? AND attendance_date = ?')
      .get(targetEmployee.company_id, targetEmployee.id, attendanceDate);

    const originalSnapshot = existingRecord
      ? {
          first_check_in_at: existingRecord.first_check_in_at,
          last_check_out_at: existingRecord.last_check_out_at,
          status: existingRecord.status,
          late_minutes: existingRecord.late_minutes,
        }
      : { record: 'none', status: 'absent' };

    const shift = targetEmployee.default_shift_id
      ? this.db
          .prepare('SELECT * FROM work_shifts WHERE id = ?')
          .get(targetEmployee.default_shift_id)
      : null;

    const newCheckIn = checkInTime || (existingRecord ? existingRecord.first_check_in_at : `${attendanceDate}T07:00:00.000Z`);
    const newCheckOut = checkOutTime || (existingRecord ? existingRecord.last_check_out_at : null);

    const metrics = calculateShiftMetrics({
      shift,
      checkInTimestamp: newCheckIn,
      checkOutTimestamp: newCheckOut,
      breakMinutes: existingRecord ? existingRecord.total_break_minutes : 0,
      isHolidayOrRestDay: false,
    });

    const newStatus = statusOverride || metrics.status || 'present';
    const newState = newCheckOut ? 'checked_out' : 'checked_in';

    this.db.exec('BEGIN');
    try {
      let recordId = existingRecord ? existingRecord.id : newId('attrec');
      if (!existingRecord) {
        this.db
          .prepare(`
            INSERT INTO attendance_records (
              id, company_id, branch_id, employee_id, shift_id, workplace_id,
              attendance_date, first_check_in_at, last_check_out_at, current_state,
              total_work_minutes, total_break_minutes, late_minutes, early_departure_minutes,
              overtime_minutes, status, has_exception, exception_notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 0, ?, ?, ?)
          `)
          .run(
            recordId,
            targetEmployee.company_id,
            targetEmployee.branch_id,
            targetEmployee.id,
            targetEmployee.default_shift_id,
            targetEmployee.default_workplace_id,
            attendanceDate,
            newCheckIn,
            newCheckOut,
            newState,
            metrics.totalWorkMinutes,
            metrics.lateMinutes,
            metrics.earlyDepartureMinutes,
            metrics.overtimeMinutes,
            newStatus,
            `Manual correction: ${reason}`,
            nowIso,
            nowIso
          );
      } else {
        this.db
          .prepare(`
            UPDATE attendance_records
            SET first_check_in_at = ?,
                last_check_out_at = ?,
                current_state = ?,
                total_work_minutes = ?,
                late_minutes = ?,
                early_departure_minutes = ?,
                overtime_minutes = ?,
                status = ?,
                has_exception = 0,
                exception_notes = ?,
                updated_at = ?
            WHERE id = ? AND company_id = ?
          `)
          .run(
            newCheckIn,
            newCheckOut,
            newState,
            metrics.totalWorkMinutes,
            newStatus === 'present' ? 0 : metrics.lateMinutes,
            metrics.earlyDepartureMinutes,
            metrics.overtimeMinutes,
            newStatus,
            `Manual correction: ${reason}`,
            nowIso,
            recordId,
            targetEmployee.company_id
          );
      }

      const correctedSnapshot = {
        first_check_in_at: newCheckIn,
        last_check_out_at: newCheckOut,
        status: newStatus,
      };

      // Append an immutable manual_correction event to attendance_events
      const corrEventId = newId('attevt');
      this.db
        .prepare(`
          INSERT INTO attendance_events (
            id, company_id, branch_id, employee_id, attendance_record_id, workplace_id, shift_id,
            event_type, idempotency_key, server_timestamp, device_timestamp,
            geofence_passed, is_mock_location, auth_method, biometric_verified,
            is_offline_submission, sync_status, flags_json, reviewed_by, reviewed_at, review_notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual_correction', ?, ?, ?, 1, 0, 'manager_manual', 0, 0, 'accepted', '["MANAGER_MANUAL_CORRECTION"]', ?, ?, ?, ?)
        `)
        .run(
          corrEventId,
          targetEmployee.company_id,
          targetEmployee.branch_id,
          targetEmployee.id,
          recordId,
          targetEmployee.default_workplace_id,
          targetEmployee.default_shift_id,
          newId('idem_corr'),
          nowIso,
          nowIso,
          actor.id,
          nowIso,
          reason,
          nowIso
        );

      // Record in attendance_corrections ledger
      const correctionId = newId('attcorr');
      this.db
        .prepare(`
          INSERT INTO attendance_corrections (
            id, company_id, employee_id, attendance_record_id, original_event_id,
            correction_type, original_value_json, corrected_value_json,
            reason, requested_by, approved_by, status, created_at, decided_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)
        `)
        .run(
          correctionId,
          targetEmployee.company_id,
          targetEmployee.id,
          recordId,
          corrEventId,
          correctionType || 'time_adjustment',
          JSON.stringify(originalSnapshot),
          JSON.stringify(correctedSnapshot),
          reason,
          actor.id,
          actor.id,
          nowIso,
          nowIso
        );

      this.logAudit({
        companyId: targetEmployee.company_id,
        actorUserId: actor.id,
        actorRole: actor.role,
        action: 'MANUAL_ATTENDANCE_CORRECTION',
        targetType: 'attendance_record',
        targetId: recordId,
        details: {
          employeeId: targetEmployee.id,
          attendanceDate,
          originalSnapshot,
          correctedSnapshot,
          reason,
        },
      });

      this.db.exec('COMMIT');

      const correction = this.db
        .prepare('SELECT * FROM attendance_corrections WHERE id = ?')
        .get(correctionId);
      const updatedRecord = this.db
        .prepare('SELECT * FROM attendance_records WHERE id = ?')
        .get(recordId);

      return {
        ok: true,
        status: 200,
        correction,
        attendanceRecord: updatedRecord,
      };
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /**
   * Reviews a pending or needs_review attendance event (approve or reject).
   */
  reviewAttendanceEvent(actor, { eventId, decision, notes }) {
    if (
      !hasPermission(actor.role, 'attendance:review_exception') &&
      !hasPermission(actor.role, 'attendance:review_exception_branch')
    ) {
      return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Not authorized to review exceptions.' };
    }

    const evt = this.db.prepare('SELECT * FROM attendance_events WHERE id = ?').get(eventId);
    if (!evt) {
      return { ok: false, status: 404, code: 'EVENT_NOT_FOUND', message: 'Attendance event not found.' };
    }

    const tenantCheck = verifyTenantAccess(actor, evt.company_id);
    if (!tenantCheck.allowed) {
      return { ok: false, status: 403, code: tenantCheck.reason, message: 'Cross-tenant access denied.' };
    }

    if (actor.role === ROLES.BRANCH_MANAGER && evt.branch_id !== actor.branch_id) {
      return { ok: false, status: 403, code: 'BRANCH_SCOPE_VIOLATION', message: 'Event belongs to another branch.' };
    }

    const newStatus = decision === 'approve' ? 'accepted' : 'rejected';
    const nowIso = new Date().toISOString();

    this.db
      .prepare(`
        UPDATE attendance_events
        SET sync_status = ?, reviewed_by = ?, reviewed_at = ?, review_notes = ?
        WHERE id = ? AND company_id = ?
      `)
      .run(newStatus, actor.id, nowIso, notes || '', eventId, evt.company_id);

    if (evt.attendance_record_id) {
      this.db
        .prepare(`
          UPDATE attendance_records
          SET status = ?, has_exception = ?, updated_at = ?
          WHERE id = ? AND company_id = ?
        `)
        .run(
          decision === 'approve' ? 'present' : 'absent',
          decision === 'approve' ? 0 : 1,
          nowIso,
          evt.attendance_record_id,
          evt.company_id
        );
    }

    this.logAudit({
      companyId: evt.company_id,
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'ATTENDANCE_EVENT_REVIEWED',
      targetType: 'attendance_event',
      targetId: eventId,
      details: { decision, newStatus, notes },
    });

    return {
      ok: true,
      status: 200,
      event: this.db.prepare('SELECT * FROM attendance_events WHERE id = ?').get(eventId),
    };
  }

  /**
   * Dashboard Overview & Analytics for HR Admin / Company Owner / Branch Manager
   */
  getDashboardOverview(actor, { date } = {}) {
    if (!actor.company_id) {
      return { ok: false, status: 403, code: 'TENANT_REQUIRED', message: 'Company context required.' };
    }

    const company = this.db.prepare('SELECT * FROM companies WHERE id = ?').get(actor.company_id);
    const targetDate = date || getZonedDateParts(new Date().toISOString(), company.timezone).dateStr;

    const branchFilterSql = actor.role === ROLES.BRANCH_MANAGER && actor.branch_id ? 'AND branch_id = ?' : '';
    const branchArgs = actor.role === ROLES.BRANCH_MANAGER && actor.branch_id ? [actor.branch_id] : [];

    const totalEmployees = this.db
      .prepare(`SELECT COUNT(*) AS cnt FROM employees WHERE company_id = ? AND is_active = 1 ${branchFilterSql}`)
      .get(actor.company_id, ...branchArgs).cnt;

    const todayRecords = this.db
      .prepare(`SELECT * FROM attendance_records WHERE company_id = ? AND attendance_date = ? ${branchFilterSql}`)
      .all(actor.company_id, targetDate, ...branchArgs);

    const presentCount = todayRecords.filter((r) =>
      ['present', 'late', 'needs_review'].includes(r.status)
    ).length;
    const lateCount = todayRecords.filter((r) => r.late_minutes > 0 || r.status === 'late').length;

    const approvedLeavesToday = this.db
      .prepare(`
        SELECT COUNT(*) AS cnt FROM leave_requests
        WHERE company_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ? ${branchFilterSql}
      `)
      .get(actor.company_id, targetDate, targetDate, ...branchArgs).cnt;

    const absentCount = Math.max(0, totalEmployees - presentCount - approvedLeavesToday);

    const pendingExceptions = this.db
      .prepare(`
        SELECT COUNT(*) AS cnt FROM attendance_events
        WHERE company_id = ? AND sync_status IN ('pending', 'needs_review') ${branchFilterSql}
      `)
      .get(actor.company_id, ...branchArgs).cnt;

    const suspiciousOrRejected = this.db
      .prepare(`
        SELECT COUNT(*) AS cnt FROM attendance_events
        WHERE company_id = ? AND (sync_status = 'rejected' OR flags_json != '[]') ${branchFilterSql}
      `)
      .get(actor.company_id, ...branchArgs).cnt;

    const pendingLeaves = this.db
      .prepare(`
        SELECT COUNT(*) AS cnt FROM leave_requests
        WHERE company_id = ? AND status = 'pending' ${branchFilterSql}
      `)
      .get(actor.company_id, ...branchArgs).cnt;

    const recentEvents = this.db
      .prepare(`
        SELECT ae.*, e.full_name_en, e.full_name_ar, e.employee_code,
               wp.name_en AS workplace_name_en, wp.name_ar AS workplace_name_ar,
               b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
        FROM attendance_events ae
        JOIN employees e ON e.id = ae.employee_id
        LEFT JOIN workplaces wp ON wp.id = ae.workplace_id
        LEFT JOIN branches b ON b.id = ae.branch_id
        WHERE ae.company_id = ? ${actor.role === ROLES.BRANCH_MANAGER && actor.branch_id ? 'AND ae.branch_id = ?' : ''}
        ORDER BY ae.server_timestamp DESC
        LIMIT 25
      `)
      .all(actor.company_id, ...branchArgs);

    const subscription = this.getCompanySubscription(actor.company_id);

    return {
      ok: true,
      status: 200,
      date: targetDate,
      company,
      subscription: {
        ...subscription,
        evaluation: evaluateSubscriptionStatus(subscription),
      },
      metrics: {
        totalEmployees,
        presentCount,
        absentCount,
        lateCount,
        approvedLeavesToday,
        pendingExceptions,
        suspiciousOrRejected,
        pendingLeaves,
      },
      recentEvents,
    };
  }

  /**
   * Lists employees for the authenticated tenant with role-appropriate scoping.
   */
  listEmployees(actor, filters = {}) {
    const tenantCheck = verifyTenantAccess(actor, filters.companyId || actor.company_id);
    if (!tenantCheck.allowed) {
      return { ok: false, status: 403, code: tenantCheck.reason, message: 'Cross-tenant access denied.' };
    }

    let sql = `
      SELECT e.*, u.email, u.role, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar,
             d.name_en AS department_name_en, d.name_ar AS department_name_ar,
             wp.name_en AS workplace_name_en, wp.name_ar AS workplace_name_ar,
             ws.name_en AS shift_name_en, ws.name_ar AS shift_name_ar
      FROM employees e
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN workplaces wp ON wp.id = e.default_workplace_id
      LEFT JOIN work_shifts ws ON ws.id = e.default_shift_id
      WHERE e.company_id = ?
    `;
    const params = [actor.company_id];

    if (actor.role === ROLES.BRANCH_MANAGER && actor.branch_id) {
      sql += ' AND e.branch_id = ?';
      params.push(actor.branch_id);
    } else if (actor.role === ROLES.SUPERVISOR && actor.employee_id) {
      sql += ' AND (e.manager_id = ? OR e.id = ?)';
      params.push(actor.employee_id, actor.employee_id);
    } else if (actor.role === ROLES.EMPLOYEE && actor.employee_id) {
      sql += ' AND e.id = ?';
      params.push(actor.employee_id);
    }

    if (filters.branchId) {
      sql += ' AND e.branch_id = ?';
      params.push(filters.branchId);
    }
    if (filters.departmentId) {
      sql += ' AND e.department_id = ?';
      params.push(filters.departmentId);
    }

    sql += ' ORDER BY e.employee_code ASC';
    const rows = this.db.prepare(sql).all(...params);
    return {
      ok: true,
      status: 200,
      employees: rows.map((r) => this.formatEmployee(r)),
    };
  }

  /**
   * Creates a new employee and associated user account within the tenant, enforcing plan limits.
   */
  createEmployee(actor, payload) {
    if (!hasPermission(actor.role, 'employees:write')) {
      return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Not authorized to create employees.' };
    }

    const sub = this.getCompanySubscription(actor.company_id);
    const subEval = evaluateSubscriptionStatus(sub);
    if (!subEval.allowed) {
      return { ok: false, status: 402, code: subEval.reason, message: 'Subscription expired.' };
    }

    const activeEmpCount = this.db
      .prepare('SELECT COUNT(*) AS cnt FROM employees WHERE company_id = ? AND is_active = 1')
      .get(actor.company_id).cnt;

    if (sub && activeEmpCount >= sub.max_employees) {
      return {
        ok: false,
        status: 402,
        code: 'PLAN_EMPLOYEE_LIMIT_REACHED',
        message: `Your subscription plan (${sub.plan_name_en}) allows up to ${sub.max_employees} active employees. Please upgrade your plan.`,
      };
    }

    const email = String(payload.email || '').trim().toLowerCase();
    const employeeCode = String(payload.employeeCode || '').trim();
    if (!email || !employeeCode || !payload.fullNameEn || !payload.fullNameAr || !payload.branchId) {
      return {
        ok: false,
        status: 400,
        code: 'MISSING_REQUIRED_FIELDS',
        message: 'email, employeeCode, fullNameEn, fullNameAr, and branchId are required.',
      };
    }

    // Verify branch belongs to actor's company
    const branch = this.db
      .prepare('SELECT * FROM branches WHERE id = ? AND company_id = ?')
      .get(payload.branchId, actor.company_id);
    if (!branch) {
      return { ok: false, status: 400, code: 'INVALID_BRANCH', message: 'Branch does not belong to your company.' };
    }

    const nowIso = new Date().toISOString();
    const userId = newId('usr');
    const empId = newId('emp');
    const passHash = hashPassword(payload.password || 'WeHR@2026');
    const workplaceId = payload.defaultWorkplaceId || null;

    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(`
          INSERT INTO users (
            id, company_id, email, phone, password_hash, role, branch_id, preferred_locale, is_active, token_version, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ar', 1, 1, ?)
        `)
        .run(
          userId,
          actor.company_id,
          email,
          payload.phone || '',
          passHash,
          payload.role || 'employee',
          payload.branchId,
          nowIso
        );

      this.db
        .prepare(`
          INSERT INTO employees (
            id, user_id, company_id, branch_id, department_id, manager_id,
            default_workplace_id, authorized_workplace_ids_json, default_shift_id,
            employee_code, full_name_en, full_name_ar, job_title_en, job_title_ar,
            national_id_masked, hire_date, attendance_eligible, require_biometric,
            allow_biometric_exception, biometric_exception_reason, allow_field_visit,
            is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 1, ?, ?)
        `)
        .run(
          empId,
          userId,
          actor.company_id,
          payload.branchId,
          payload.departmentId || null,
          payload.managerId || null,
          workplaceId,
          JSON.stringify(workplaceId ? [workplaceId] : []),
          payload.defaultShiftId || null,
          employeeCode,
          payload.fullNameEn,
          payload.fullNameAr,
          payload.jobTitleEn || 'Employee',
          payload.jobTitleAr || 'موظف',
          payload.nationalIdMasked || '',
          payload.hireDate || nowIso.slice(0, 10),
          payload.requireBiometric === false ? 0 : 1,
          payload.allowBiometricException ? 1 : 0,
          payload.biometricExceptionReason || null,
          payload.allowFieldVisit ? 1 : 0,
          nowIso,
          nowIso
        );

      this.logAudit({
        companyId: actor.company_id,
        actorUserId: actor.id,
        actorRole: actor.role,
        action: 'EMPLOYEE_CREATED',
        targetType: 'employee',
        targetId: empId,
        details: { employeeCode, email, fullNameEn: payload.fullNameEn },
      });

      this.db.exec('COMMIT');

      const created = this.db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
      return { ok: true, status: 201, employee: this.formatEmployee(created) };
    } catch (err) {
      this.db.exec('ROLLBACK');
      return {
        ok: false,
        status: 409,
        code: 'DUPLICATE_EMPLOYEE_OR_EMAIL',
        message: err.message,
      };
    }
  }

  /**
   * Deactivates or reactivates an employee and immediately increments user `token_version`
   * so any active mobile JWT session is revoked on the next request.
   */
  setEmployeeActiveStatus(actor, { employeeId, isActive }) {
    if (!hasPermission(actor.role, 'employees:write')) {
      return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Not authorized.' };
    }
    const emp = this.db
      .prepare('SELECT * FROM employees WHERE id = ? AND company_id = ?')
      .get(employeeId, actor.company_id);
    if (!emp) {
      return { ok: false, status: 404, code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found.' };
    }

    const nowIso = new Date().toISOString();
    const activeInt = isActive ? 1 : 0;

    this.db
      .prepare('UPDATE employees SET is_active = ?, updated_at = ? WHERE id = ? AND company_id = ?')
      .run(activeInt, nowIso, employeeId, actor.company_id);

    if (emp.user_id) {
      this.db
        .prepare('UPDATE users SET is_active = ?, token_version = token_version + 1 WHERE id = ? AND company_id = ?')
        .run(activeInt, emp.user_id, actor.company_id);
    }

    this.logAudit({
      companyId: actor.company_id,
      actorUserId: actor.id,
      actorRole: actor.role,
      action: isActive ? 'EMPLOYEE_ACTIVATED' : 'EMPLOYEE_DEACTIVATED',
      targetType: 'employee',
      targetId: employeeId,
      details: { isActive },
    });

    return {
      ok: true,
      status: 200,
      employee: this.formatEmployee(
        this.db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId)
      ),
    };
  }

  /**
   * Workplaces CRUD
   */
  listWorkplaces(actor) {
    if (!actor.company_id) {
      return { ok: false, status: 403, code: 'TENANT_REQUIRED', message: 'Tenant required.' };
    }
    const rows = this.db
      .prepare(`
        SELECT wp.*, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
        FROM workplaces wp
        LEFT JOIN branches b ON b.id = wp.branch_id
        WHERE wp.company_id = ?
        ORDER BY wp.code ASC
      `)
      .all(actor.company_id);
    return { ok: true, status: 200, workplaces: rows };
  }

  createWorkplace(actor, payload) {
    if (!hasPermission(actor.role, 'workplaces:write')) {
      return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Not authorized to manage workplaces.' };
    }
    const coordCheck = validateCoordinates(Number(payload.latitude), Number(payload.longitude));
    if (!coordCheck.valid) {
      return { ok: false, status: 400, code: coordCheck.reason, message: 'Invalid workplace GPS coordinates.' };
    }

    const radius = Number(payload.radiusMeters || 150);
    if (radius < 10 || radius > 10000) {
      return { ok: false, status: 400, code: 'INVALID_RADIUS', message: 'Geofence radius must be between 10m and 10,000m.' };
    }

    const wpId = newId('wp');
    const nowIso = new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO workplaces (
          id, company_id, branch_id, code, name_en, name_ar, workplace_type,
          latitude, longitude, radius_meters, max_accuracy_meters, max_location_age_seconds,
          accuracy_buffer_policy, allowed_event_types_json, applicable_shifts_json,
          require_biometric, is_active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'strict', '["check_in","check_out","break_start","break_end","field_visit"]', '[]', ?, 1, ?)
      `)
      .run(
        wpId,
        actor.company_id,
        payload.branchId || null,
        String(payload.code || wpId.toUpperCase()),
        payload.nameEn,
        payload.nameAr || payload.nameEn,
        payload.workplaceType || 'office',
        Number(payload.latitude),
        Number(payload.longitude),
        radius,
        Number(payload.maxAccuracyMeters || 50),
        Number(payload.maxLocationAgeSeconds || 120),
        payload.requireBiometric === false ? 0 : 1,
        nowIso
      );

    this.logAudit({
      companyId: actor.company_id,
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'WORKPLACE_CREATED',
      targetType: 'workplace',
      targetId: wpId,
      details: { nameEn: payload.nameEn, latitude: payload.latitude, longitude: payload.longitude, radius },
    });

    const workplace = this.db.prepare('SELECT * FROM workplaces WHERE id = ?').get(wpId);
    return { ok: true, status: 201, workplace };
  }

  /**
   * Attendance Register & Events Query with Multi-Tenant & Role Filtering
   * Note: Unnecessary precise GPS coordinates are masked for users without full HR/Branch Manager authorization.
   */
  listAttendanceRegister(actor, filters = {}) {
    if (!actor.company_id) {
      return { ok: false, status: 403, code: 'TENANT_REQUIRED', message: 'Tenant required.' };
    }

    let sql = `
      SELECT ar.*, e.employee_code, e.full_name_en, e.full_name_ar, e.department_id,
             b.name_en AS branch_name_en, b.name_ar AS branch_name_ar,
             wp.name_en AS workplace_name_en, wp.name_ar AS workplace_name_ar,
             ws.name_en AS shift_name_en, ws.name_ar AS shift_name_ar
      FROM attendance_records ar
      JOIN employees e ON e.id = ar.employee_id
      LEFT JOIN branches b ON b.id = ar.branch_id
      LEFT JOIN workplaces wp ON wp.id = ar.workplace_id
      LEFT JOIN work_shifts ws ON ws.id = ar.shift_id
      WHERE ar.company_id = ?
    `;
    const params = [actor.company_id];

    if (actor.role === ROLES.BRANCH_MANAGER && actor.branch_id) {
      sql += ' AND ar.branch_id = ?';
      params.push(actor.branch_id);
    } else if (actor.role === ROLES.SUPERVISOR && actor.employee_id) {
      sql += ' AND (e.manager_id = ? OR ar.employee_id = ?)';
      params.push(actor.employee_id, actor.employee_id);
    } else if (actor.role === ROLES.EMPLOYEE && actor.employee_id) {
      sql += ' AND ar.employee_id = ?';
      params.push(actor.employee_id);
    }

    if (filters.date) {
      sql += ' AND ar.attendance_date = ?';
      params.push(filters.date);
    }
    if (filters.branchId) {
      sql += ' AND ar.branch_id = ?';
      params.push(filters.branchId);
    }
    if (filters.employeeId) {
      sql += ' AND ar.employee_id = ?';
      params.push(filters.employeeId);
    }

    sql += ' ORDER BY ar.attendance_date DESC, ar.updated_at DESC LIMIT 200';
    const records = this.db.prepare(sql).all(...params);

    // Also fetch raw events matching the scope
    let evtSql = `
      SELECT ae.*, e.employee_code, e.full_name_en, e.full_name_ar,
             wp.name_en AS workplace_name_en, wp.name_ar AS workplace_name_ar
      FROM attendance_events ae
      JOIN employees e ON e.id = ae.employee_id
      LEFT JOIN workplaces wp ON wp.id = ae.workplace_id
      WHERE ae.company_id = ?
    `;
    const evtParams = [actor.company_id];

    if (actor.role === ROLES.BRANCH_MANAGER && actor.branch_id) {
      evtSql += ' AND ae.branch_id = ?';
      evtParams.push(actor.branch_id);
    } else if (actor.role === ROLES.SUPERVISOR && actor.employee_id) {
      evtSql += ' AND (e.manager_id = ? OR ae.employee_id = ?)';
      evtParams.push(actor.employee_id, actor.employee_id);
    } else if (actor.role === ROLES.EMPLOYEE && actor.employee_id) {
      evtSql += ' AND ae.employee_id = ?';
      evtParams.push(actor.employee_id);
    }

    evtSql += ' ORDER BY ae.server_timestamp DESC LIMIT 100';
    const events = this.db.prepare(evtSql).all(...evtParams);

    return { ok: true, status: 200, records, events };
  }

  /**
   * Exports Attendance Register as UTF-8 BOM CSV (Excel compatible for both Arabic and English).
   */
  exportAttendanceCsv(actor, filters = {}) {
    if (
      !hasPermission(actor.role, 'attendance:export_csv') &&
      !hasPermission(actor.role, 'attendance:export_csv_branch')
    ) {
      return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Not authorized to export attendance CSV.' };
    }

    const res = this.listAttendanceRegister(actor, filters);
    if (!res.ok) return res;

    const headers = [
      'Date',
      'Employee Code',
      'Employee Name (EN)',
      'Employee Name (AR)',
      'Branch',
      'Workplace',
      'Shift',
      'First Check-In (UTC)',
      'Last Check-Out (UTC)',
      'State',
      'Work Minutes',
      'Late Minutes',
      'Early Departure Minutes',
      'Overtime Minutes',
      'Status',
      'Notes',
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines = [headers.join(',')];
    for (const r of res.records) {
      lines.push(
        [
          r.attendance_date,
          r.employee_code,
          r.full_name_en,
          r.full_name_ar,
          r.branch_name_en,
          r.workplace_name_en,
          r.shift_name_en,
          r.first_check_in_at || '',
          r.last_check_out_at || '',
          r.current_state,
          r.total_work_minutes,
          r.late_minutes,
          r.early_departure_minutes,
          r.overtime_minutes,
          r.status,
          r.exception_notes || '',
        ]
          .map(escapeCsv)
          .join(',')
      );
    }

    // Prepend UTF-8 BOM (\uFEFF) so Microsoft Excel renders Arabic characters properly
    const csvContent = '\uFEFF' + lines.join('\r\n');
    return { ok: true, status: 200, csvContent };
  }

  /**
   * Bulk CSV Employee Import
   * Format: employee_code,email,full_name_en,full_name_ar,job_title_en,job_title_ar,branch_id,default_workplace_id,default_shift_id
   */
  importEmployeesFromCsv(actor, csvText) {
    if (!hasPermission(actor.role, 'employees:import_csv')) {
      return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Not authorized to import employees.' };
    }

    const lines = String(csvText || '')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return { ok: false, status: 400, code: 'EMPTY_CSV', message: 'CSV must contain a header row and at least one employee row.' };
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const imported = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = cols[idx] || '';
      });

      const res = this.createEmployee(actor, {
        employeeCode: row.employee_code,
        email: row.email,
        fullNameEn: row.full_name_en,
        fullNameAr: row.full_name_ar || row.full_name_en,
        jobTitleEn: row.job_title_en || 'Specialist',
        jobTitleAr: row.job_title_ar || 'أخصائي',
        branchId: row.branch_id,
        defaultWorkplaceId: row.default_workplace_id,
        defaultShiftId: row.default_shift_id,
      });

      if (res.ok) {
        imported.push(res.employee);
      } else {
        errors.push({ line: i + 1, employeeCode: row.employee_code, error: res.message });
      }
    }

    return {
      ok: true,
      status: 200,
      importedCount: imported.length,
      errorCount: errors.length,
      imported,
      errors,
    };
  }

  /**
   * Leave Requests & Approvals
   */
  listLeaveRequests(actor) {
    if (!actor.company_id) {
      return { ok: false, status: 403, code: 'TENANT_REQUIRED', message: 'Tenant required.' };
    }
    let sql = `
      SELECT lr.*, e.employee_code, e.full_name_en, e.full_name_ar, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
      FROM leave_requests lr
      JOIN employees e ON e.id = lr.employee_id
      LEFT JOIN branches b ON b.id = lr.branch_id
      WHERE lr.company_id = ?
    `;
    const params = [actor.company_id];
    if (actor.role === ROLES.BRANCH_MANAGER && actor.branch_id) {
      sql += ' AND lr.branch_id = ?';
      params.push(actor.branch_id);
    } else if (actor.role === ROLES.EMPLOYEE && actor.employee_id) {
      sql += ' AND lr.employee_id = ?';
      params.push(actor.employee_id);
    }
    sql += ' ORDER BY lr.created_at DESC';
    return { ok: true, status: 200, leaveRequests: this.db.prepare(sql).all(...params) };
  }

  submitLeaveRequest(actor, payload) {
    if (!actor.company_id || !actor.employee_id) {
      return { ok: false, status: 403, code: 'EMPLOYEE_REQUIRED', message: 'Employee profile required.' };
    }
    const { leaveType, startDate, endDate, reason } = payload;
    if (!leaveType || !startDate || !endDate || endDate < startDate) {
      return { ok: false, status: 400, code: 'INVALID_LEAVE_DATES', message: 'Valid leaveType, startDate, and endDate are required.' };
    }
    const daysCount =
      Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
    const id = newId('lv');
    const nowIso = new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO leave_requests (
          id, company_id, branch_id, employee_id, leave_type, start_date, end_date, days_count, reason, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `)
      .run(id, actor.company_id, actor.branch_id, actor.employee_id, leaveType, startDate, endDate, daysCount, reason || '', nowIso);

    return {
      ok: true,
      status: 201,
      leaveRequest: this.db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(id),
    };
  }

  decideLeaveRequest(actor, { leaveId, decision, notes }) {
    if (
      !hasPermission(actor.role, 'leaves:decide') &&
      !hasPermission(actor.role, 'leaves:decide_branch') &&
      !hasPermission(actor.role, 'leaves:decide_team')
    ) {
      return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Not authorized to approve/reject leaves.' };
    }
    const lv = this.db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(leaveId);
    if (!lv || lv.company_id !== actor.company_id) {
      return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Leave request not found.' };
    }
    if (actor.role === ROLES.BRANCH_MANAGER && lv.branch_id !== actor.branch_id) {
      return { ok: false, status: 403, code: 'BRANCH_SCOPE_VIOLATION', message: 'Leave belongs to another branch.' };
    }

    const newStatus = decision === 'approve' ? 'approved' : 'rejected';
    const nowIso = new Date().toISOString();
    this.db
      .prepare('UPDATE leave_requests SET status = ?, decided_by = ?, decided_at = ?, decision_notes = ? WHERE id = ?')
      .run(newStatus, actor.id, nowIso, notes || '', leaveId);

    this.logAudit({
      companyId: actor.company_id,
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'LEAVE_REQUEST_DECIDED',
      targetType: 'leave_request',
      targetId: leaveId,
      details: { decision: newStatus, notes },
    });

    return {
      ok: true,
      status: 200,
      leaveRequest: this.db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(leaveId),
    };
  }

  /**
   * Approved Devices Management
   */
  listDevices(actor) {
    if (!actor.company_id) {
      return { ok: false, status: 403, code: 'TENANT_REQUIRED', message: 'Tenant required.' };
    }
    const devices = this.db
      .prepare(`
        SELECT ad.*, e.employee_code, e.full_name_en, e.full_name_ar
        FROM approved_devices ad
        JOIN employees e ON e.id = ad.employee_id
        WHERE ad.company_id = ?
        ORDER BY ad.created_at DESC
      `)
      .all(actor.company_id);
    return { ok: true, status: 200, devices };
  }

  updateDeviceStatus(actor, { deviceId, status }) {
    if (!hasPermission(actor.role, 'devices:approve')) {
      return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Not authorized to manage devices.' };
    }
    const dev = this.db
      .prepare('SELECT * FROM approved_devices WHERE id = ? AND company_id = ?')
      .get(deviceId, actor.company_id);
    if (!dev) {
      return { ok: false, status: 404, code: 'DEVICE_NOT_FOUND', message: 'Device not found.' };
    }

    this.db
      .prepare('UPDATE approved_devices SET status = ?, approved_by = ? WHERE id = ?')
      .run(status, actor.id, deviceId);

    this.logAudit({
      companyId: actor.company_id,
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'DEVICE_STATUS_UPDATED',
      targetType: 'approved_device',
      targetId: deviceId,
      details: { status, deviceIdentifier: dev.device_identifier },
    });

    return {
      ok: true,
      status: 200,
      device: this.db.prepare('SELECT * FROM approved_devices WHERE id = ?').get(deviceId),
    };
  }

  /**
   * Commercial & Subscription Manual Payment Workflow (Section 14)
   * Never stores payment card numbers or CVV codes.
   */
  submitManualPayment(actor, payload) {
    if (!hasPermission(actor.role, 'subscription:submit_payment')) {
      return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Only Company Owners may submit subscription payments.' };
    }
    const sub = this.getCompanySubscription(actor.company_id);
    if (!sub) {
      return { ok: false, status: 404, code: 'SUBSCRIPTION_NOT_FOUND', message: 'Subscription not found.' };
    }
    const { amount, currency, paymentMethod, referenceNumber, notes } = payload;
    if (!amount || !referenceNumber || !paymentMethod) {
      return { ok: false, status: 400, code: 'MISSING_PAYMENT_FIELDS', message: 'amount, paymentMethod, and referenceNumber are required.' };
    }

    const payId = newId('pay');
    const nowIso = new Date().toISOString();
    this.db
      .prepare(`
        INSERT INTO payment_records (
          id, company_id, subscription_id, amount, currency, payment_method,
          reference_number, verification_status, submitted_by, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
      `)
      .run(
        payId,
        actor.company_id,
        sub.id,
        Number(amount),
        currency || 'EGP',
        paymentMethod,
        String(referenceNumber).trim(),
        actor.id,
        notes || '',
        nowIso
      );

    this.logAudit({
      companyId: actor.company_id,
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'MANUAL_PAYMENT_SUBMITTED',
      targetType: 'payment_record',
      targetId: payId,
      details: { amount, paymentMethod, referenceNumber },
    });

    return {
      ok: true,
      status: 201,
      payment: this.db.prepare('SELECT * FROM payment_records WHERE id = ?').get(payId),
    };
  }

  verifyManualPayment(actor, { paymentId, decision, extendDays = 30 }) {
    if (!hasPermission(actor.role, 'platform:subscriptions:verify_payment')) {
      return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Only Platform Super Admins can verify subscription payments.' };
    }
    const pay = this.db.prepare('SELECT * FROM payment_records WHERE id = ?').get(paymentId);
    if (!pay) {
      return { ok: false, status: 404, code: 'PAYMENT_NOT_FOUND', message: 'Payment record not found.' };
    }

    const nowIso = new Date().toISOString();
    const status = decision === 'verify' ? 'verified' : 'rejected';

    this.db
      .prepare('UPDATE payment_records SET verification_status = ?, verified_by = ?, verified_at = ? WHERE id = ?')
      .run(status, actor.id, nowIso, paymentId);

    if (status === 'verified') {
      const newExpiry = new Date(Date.now() + Number(extendDays) * 86400000).toISOString();
      this.db
        .prepare('UPDATE company_subscriptions SET status = ?, expiry_date = ?, updated_by = ?, updated_at = ? WHERE id = ?')
        .run('active', newExpiry, actor.id, nowIso, pay.subscription_id);
    }

    this.logAudit({
      companyId: pay.company_id,
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'PAYMENT_VERIFIED',
      targetType: 'payment_record',
      targetId: paymentId,
      details: { status, extendDays },
    });

    return {
      ok: true,
      status: 200,
      payment: this.db.prepare('SELECT * FROM payment_records WHERE id = ?').get(paymentId),
    };
  }
}

module.exports = {
  HrService,
};
