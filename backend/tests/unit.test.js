'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateCoordinates,
  calculateHaversineDistanceMeters,
  evaluateGeofenceAndLocation,
} = require('../src/domain/geofence');
const { evaluateBiometricAndDeviceAuth } = require('../src/domain/biometrics');
const {
  resolveShiftAnchorDate,
  validateAttendanceStateTransition,
  calculateShiftMetrics,
  evaluateOfflineSubmission,
} = require('../src/domain/attendance_rules');
const {
  ROLES,
  hasPermission,
  verifyTenantAccess,
  canAccessEmployee,
  evaluateSubscriptionStatus,
} = require('../src/domain/rbac');

test('Unit 1: Geofence Haversine distance calculations & coordinate validation', () => {
  assert.equal(validateCoordinates(29.9697, 31.2761).valid, true);
  assert.equal(validateCoordinates(95, 31).valid, false);
  assert.equal(validateCoordinates(0, 0).reason, 'NULL_ISLAND_COORDINATES');

  const distZero = calculateHaversineDistanceMeters(29.9697, 31.2761, 29.9697, 31.2761);
  assert.equal(distZero, 0);

  // ~14.7m away in Maadi Cairo
  const distNear = calculateHaversineDistanceMeters(29.9697, 31.2761, 29.9698, 31.2762);
  assert.ok(distNear > 12 && distNear < 18, `Expected ~14.7m, got ${distNear}m`);
});

test('Unit 2: Geofence radius boundaries, accuracy threshold, freshness & mock location', () => {
  const workplace = {
    id: 'wp_test',
    name_en: 'Cairo HQ',
    latitude: 30.0,
    longitude: 31.0,
    radius_meters: 100,
    max_accuracy_meters: 50,
    max_location_age_seconds: 120,
    accuracy_buffer_policy: 'strict',
    is_active: 1,
  };

  const nowIso = '2026-11-01T09:00:00.000Z';
  const freshIso = '2026-11-01T08:59:50.000Z';

  // Inside boundary (~11m)
  const inside = evaluateGeofenceAndLocation({
    workplace,
    latitude: 30.0001,
    longitude: 31.0,
    accuracyMeters: 15,
    locationTimestamp: freshIso,
    referenceTimestamp: nowIso,
  });
  assert.equal(inside.passed, true);
  assert.equal(inside.status, 'accepted');

  // Outside boundary (~222m > 100m)
  const outside = evaluateGeofenceAndLocation({
    workplace,
    latitude: 30.002,
    longitude: 31.0,
    accuracyMeters: 15,
    locationTimestamp: freshIso,
    referenceTimestamp: nowIso,
  });
  assert.equal(outside.passed, false);
  assert.equal(outside.rejectionCode, 'OUTSIDE_GEOFENCE_BOUNDARY');

  // Poor GPS accuracy (85m > 50m)
  const poorAcc = evaluateGeofenceAndLocation({
    workplace,
    latitude: 30.0001,
    longitude: 31.0,
    accuracyMeters: 85,
    locationTimestamp: freshIso,
    referenceTimestamp: nowIso,
  });
  assert.equal(poorAcc.passed, false);
  assert.equal(poorAcc.rejectionCode, 'POOR_LOCATION_ACCURACY');

  // Stale location reading (300s > 120s)
  const stale = evaluateGeofenceAndLocation({
    workplace,
    latitude: 30.0001,
    longitude: 31.0,
    accuracyMeters: 15,
    locationTimestamp: '2026-11-01T08:55:00.000Z',
    referenceTimestamp: nowIso,
  });
  assert.equal(stale.passed, false);
  assert.equal(stale.rejectionCode, 'STALE_LOCATION_READING');

  // Mock location indicator
  const mocked = evaluateGeofenceAndLocation({
    workplace,
    latitude: 30.0001,
    longitude: 31.0,
    accuracyMeters: 10,
    locationTimestamp: freshIso,
    referenceTimestamp: nowIso,
    isMockLocation: true,
  });
  assert.equal(mocked.passed, false);
  assert.equal(mocked.rejectionCode, 'MOCK_LOCATION_DETECTED');
});

test('Unit 3: Biometric modality distinction vs PIN/passcode vs Exception vs Shared Device', () => {
  const company = { require_biometric_strict: 1, require_approved_device: 0 };
  const workplace = { require_biometric: 1 };
  const strictEmployee = { id: 'emp_1', require_biometric: 1, allow_biometric_exception: 0 };

  // True biometric passes and marks biometricVerified = true
  const bioOk = evaluateBiometricAndDeviceAuth({
    company,
    workplace,
    employee: strictEmployee,
    authPayload: {
      osAuthenticated: true,
      authMethod: 'biometric_strong',
      deviceSupportsBiometrics: true,
      biometricEnrolled: true,
      deviceIdentifier: 'DEV-1',
    },
    employeeApprovedDevices: [{ device_identifier: 'DEV-1', status: 'approved' }],
  });
  assert.equal(bioOk.passed, true);
  assert.equal(bioOk.biometricVerified, true);

  // Device PIN/passcode only is rejected when policy requires biometrics
  const pinAttempt = evaluateBiometricAndDeviceAuth({
    company,
    workplace,
    employee: strictEmployee,
    authPayload: {
      osAuthenticated: true,
      authMethod: 'device_credential',
      deviceSupportsBiometrics: true,
      biometricEnrolled: true,
    },
  });
  assert.equal(pinAttempt.passed, false);
  assert.equal(pinAttempt.biometricVerified, false);
  assert.equal(pinAttempt.rejectionCode, 'BIOMETRIC_REQUIRED_PIN_NOT_ACCEPTED');

  // Employee with HR-approved biometric exception passes with biometricVerified = false
  const exceptionEmployee = { id: 'emp_2', require_biometric: 0, allow_biometric_exception: 1 };
  const excOk = evaluateBiometricAndDeviceAuth({
    company,
    workplace,
    employee: exceptionEmployee,
    authPayload: {
      osAuthenticated: true,
      authMethod: 'exception_fallback',
      deviceSupportsBiometrics: false,
      biometricEnrolled: false,
    },
  });
  assert.equal(excOk.passed, true);
  assert.equal(excOk.biometricVerified, false);
  assert.equal(excOk.normalizedAuthMethod, 'exception_fallback');
});

test('Unit 4: Attendance state machine transitions & duplicate check-in prevention', () => {
  assert.equal(validateAttendanceStateTransition('not_checked_in', 'check_in').valid, true);
  assert.equal(validateAttendanceStateTransition('not_checked_in', 'check_out').valid, false);

  const dupIn = validateAttendanceStateTransition('checked_in', 'check_in');
  assert.equal(dupIn.valid, false);
  assert.equal(dupIn.rejectionCode, 'DUPLICATE_CHECK_IN_PROHIBITED');

  assert.equal(validateAttendanceStateTransition('checked_in', 'break_start').nextState, 'on_break');
  assert.equal(validateAttendanceStateTransition('on_break', 'break_end').nextState, 'checked_in');
  assert.equal(validateAttendanceStateTransition('checked_in', 'check_out').nextState, 'checked_out');
  assert.equal(validateAttendanceStateTransition('checked_out', 'check_in').valid, false);
});

test('Unit 5: Day shift, late arrival grace period, and Overnight cross-midnight shift calculations', () => {
  const dayShift = {
    start_time: '09:00',
    end_time: '17:00',
    grace_period_minutes: 15,
    early_departure_grace_minutes: 10,
    min_overtime_minutes: 30,
    is_overnight: 0,
    timezone: 'Africa/Cairo', // UTC+2
  };

  // Check-in at 09:10 Cairo (07:10 UTC) -> within 15m grace period -> lateMinutes = 0
  const withinGrace = calculateShiftMetrics({
    shift: dayShift,
    checkInTimestamp: '2026-11-01T07:10:00.000Z',
    checkOutTimestamp: '2026-11-01T15:05:00.000Z',
  });
  assert.equal(withinGrace.lateMinutes, 0);
  assert.equal(withinGrace.status, 'present');

  // Check-in at 09:25 Cairo (07:25 UTC) -> exceeds 15m grace -> lateMinutes = 25
  const lateArrival = calculateShiftMetrics({
    shift: dayShift,
    checkInTimestamp: '2026-11-01T07:25:00.000Z',
    checkOutTimestamp: '2026-11-01T15:00:00.000Z',
  });
  assert.equal(lateArrival.lateMinutes, 25);
  assert.equal(lateArrival.status, 'late');

  // Overnight shift (22:00 to 06:00 next day)
  const nightShift = {
    start_time: '22:00',
    end_time: '06:00',
    grace_period_minutes: 15,
    early_departure_grace_minutes: 10,
    min_overtime_minutes: 30,
    is_overnight: 1,
    timezone: 'Africa/Cairo',
  };

  // Event at 05:50 Cairo on 2026-11-02 (03:50 UTC) must anchor to shift date 2026-11-01
  const anchor = resolveShiftAnchorDate('2026-11-02T03:50:00.000Z', nightShift, 'Africa/Cairo');
  assert.equal(anchor.attendanceDate, '2026-11-01');
  assert.equal(anchor.isPreviousDayOvernightAnchor, true);
});

test('Unit 6: Subscription expiry & grace period evaluation and RBAC permissions', () => {
  const nowMs = new Date('2026-11-01T12:00:00.000Z').getTime();

  // Active subscription
  const activeSub = evaluateSubscriptionStatus(
    { status: 'active', expiry_date: '2026-11-15T12:00:00.000Z', grace_period_days: 7 },
    nowMs
  );
  assert.equal(activeSub.allowed, true);
  assert.equal(activeSub.effectiveStatus, 'active');

  // Expired 3 days ago, within 7-day grace period
  const graceSub = evaluateSubscriptionStatus(
    { status: 'active', expiry_date: '2026-10-29T12:00:00.000Z', grace_period_days: 7 },
    nowMs
  );
  assert.equal(graceSub.allowed, true);
  assert.equal(graceSub.inGracePeriod, true);
  assert.equal(graceSub.effectiveStatus, 'grace_period');

  // Expired 10 days ago, past 7-day grace period
  const expiredSub = evaluateSubscriptionStatus(
    { status: 'active', expiry_date: '2026-10-20T12:00:00.000Z', grace_period_days: 7 },
    nowMs
  );
  assert.equal(expiredSub.allowed, false);
  assert.equal(expiredSub.reason, 'SUBSCRIPTION_EXPIRED_PAST_GRACE_PERIOD');

  // RBAC & Tenant checks
  assert.equal(hasPermission(ROLES.HR_ADMIN, 'employees:write'), true);
  assert.equal(hasPermission(ROLES.EMPLOYEE, 'employees:write'), false);

  const branchMgr = { id: 'u1', role: ROLES.BRANCH_MANAGER, company_id: 'comp_a', branch_id: 'br_1' };
  assert.equal(canAccessEmployee(branchMgr, { id: 'e1', company_id: 'comp_a', branch_id: 'br_1' }).allowed, true);
  assert.equal(canAccessEmployee(branchMgr, { id: 'e2', company_id: 'comp_a', branch_id: 'br_2' }).allowed, false);
  assert.equal(verifyTenantAccess(branchMgr, 'comp_b').allowed, false);
});
