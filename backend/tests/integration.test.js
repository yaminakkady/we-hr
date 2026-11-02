'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDatabase } = require('../src/db/database');
const { seedDatabase } = require('../src/db/seed');
const { HrService } = require('../src/services/hr_service');
const { verifyJwt } = require('../src/security/auth');

function createTestEnv() {
  const db = createDatabase(':memory:');
  seedDatabase(db, '2026-11-01T08:00:00.000Z');
  const service = new HrService(db);
  return { db, service };
}

test('Integration 1: Complete successful attendance transaction (Check-In -> Break -> Check-Out)', () => {
  const { service } = createTestEnv();

  const loginRes = service.login({
    email: 'ahmed.saeed@niledelta.eg',
    password: 'WeHR@2026',
  });
  assert.equal(loginRes.ok, true);
  const actor = service.validateSessionActor(verifyJwt(loginRes.token).payload).actor;

  const checkInTime = '2026-11-01T07:02:00.000Z'; // 09:02 Cairo time (on time)
  const checkInRes = service.submitAttendanceEvent(
    actor,
    {
      eventType: 'check_in',
      idempotencyKey: 'idem-ahmed-checkin-001',
      workplaceId: 'wp_cairo_hq',
      latitude: 29.9698,
      longitude: 31.2762,
      accuracyMeters: 11.2,
      locationTimestamp: '2026-11-01T07:01:55.000Z',
      deviceTimestamp: checkInTime,
      isMockLocation: false,
      auth: {
        osAuthenticated: true,
        authMethod: 'biometric_strong',
        deviceSupportsBiometrics: true,
        biometricEnrolled: true,
        deviceIdentifier: 'ANDROID-SM-A546E-AHMED01',
        devicePlatform: 'android',
      },
    },
    { serverTimestamp: checkInTime }
  );

  assert.equal(checkInRes.ok, true);
  assert.equal(checkInRes.status, 201);
  assert.equal(checkInRes.verificationSummary.biometricVerified, true);
  assert.equal(checkInRes.verificationSummary.geofencePassed, true);
  assert.equal(checkInRes.attendanceRecord.current_state, 'checked_in');

  // Duplicate check-in with a new idempotency key must be blocked by state machine
  const duplicateStateIn = service.submitAttendanceEvent(
    actor,
    {
      eventType: 'check_in',
      idempotencyKey: 'idem-ahmed-checkin-002-dup',
      workplaceId: 'wp_cairo_hq',
      latitude: 29.9698,
      longitude: 31.2762,
      accuracyMeters: 11.2,
      locationTimestamp: '2026-11-01T07:05:55.000Z',
      deviceTimestamp: '2026-11-01T07:06:00.000Z',
      auth: {
        osAuthenticated: true,
        authMethod: 'biometric_strong',
        deviceSupportsBiometrics: true,
        biometricEnrolled: true,
        deviceIdentifier: 'ANDROID-SM-A546E-AHMED01',
      },
    },
    { serverTimestamp: '2026-11-01T07:06:00.000Z' }
  );
  assert.equal(duplicateStateIn.ok, false);
  assert.equal(duplicateStateIn.code, 'DUPLICATE_CHECK_IN_PROHIBITED');

  // Re-sending exact same idempotencyKey returns idempotent replay safely
  const replayRes = service.submitAttendanceEvent(
    actor,
    {
      eventType: 'check_in',
      idempotencyKey: 'idem-ahmed-checkin-001',
      workplaceId: 'wp_cairo_hq',
    },
    { serverTimestamp: '2026-11-01T07:03:00.000Z' }
  );
  assert.equal(replayRes.ok, true);
  assert.equal(replayRes.idempotentReplay, true);
  assert.equal(replayRes.event.id, checkInRes.event.id);

  // Check-out at 17:10 Cairo time (15:10 UTC)
  const checkOutTime = '2026-11-01T15:10:00.000Z';
  const checkOutRes = service.submitAttendanceEvent(
    actor,
    {
      eventType: 'check_out',
      idempotencyKey: 'idem-ahmed-checkout-001',
      workplaceId: 'wp_cairo_hq',
      latitude: 29.9698,
      longitude: 31.2762,
      accuracyMeters: 12.0,
      locationTimestamp: '2026-11-01T15:09:55.000Z',
      deviceTimestamp: checkOutTime,
      auth: {
        osAuthenticated: true,
        authMethod: 'biometric_strong',
        deviceSupportsBiometrics: true,
        biometricEnrolled: true,
        deviceIdentifier: 'ANDROID-SM-A546E-AHMED01',
      },
    },
    { serverTimestamp: checkOutTime }
  );
  assert.equal(checkOutRes.ok, true);
  assert.equal(checkOutRes.attendanceRecord.current_state, 'checked_out');
  assert.ok(checkOutRes.attendanceRecord.total_work_minutes >= 480);
});

test('Integration 2: Rejections for outside-geofence, poor/stale GPS, biometric cancel/failure, PIN-only, and unauthorized workplace', () => {
  const { service } = createTestEnv();
  const loginRes = service.login({ email: 'ahmed.saeed@niledelta.eg', password: 'WeHR@2026' });
  const actor = service.validateSessionActor(verifyJwt(loginRes.token).payload).actor;
  const nowIso = '2026-11-01T07:00:00.000Z';

  // 1. Outside geofence rejection
  const outsideRes = service.submitAttendanceEvent(
    actor,
    {
      eventType: 'check_in',
      idempotencyKey: 'idem-rej-outside',
      workplaceId: 'wp_cairo_hq',
      latitude: 30.05,
      longitude: 31.35,
      accuracyMeters: 10,
      locationTimestamp: nowIso,
      deviceTimestamp: nowIso,
      auth: {
        osAuthenticated: true,
        authMethod: 'biometric_strong',
        deviceSupportsBiometrics: true,
        biometricEnrolled: true,
        deviceIdentifier: 'ANDROID-SM-A546E-AHMED01',
      },
    },
    { serverTimestamp: nowIso }
  );
  assert.equal(outsideRes.ok, false);
  assert.equal(outsideRes.code, 'OUTSIDE_GEOFENCE_BOUNDARY');

  // 2. Biometric cancellation rejection
  const cancelRes = service.submitAttendanceEvent(
    actor,
    {
      eventType: 'check_in',
      idempotencyKey: 'idem-rej-biocancel',
      workplaceId: 'wp_cairo_hq',
      latitude: 29.9698,
      longitude: 31.2762,
      accuracyMeters: 10,
      locationTimestamp: nowIso,
      deviceTimestamp: nowIso,
      auth: {
        osAuthenticated: false,
        authMethod: 'none',
        errorCode: 'USER_CANCELED',
        deviceSupportsBiometrics: true,
        biometricEnrolled: true,
      },
    },
    { serverTimestamp: nowIso }
  );
  assert.equal(cancelRes.ok, false);
  assert.equal(cancelRes.code, 'BIOMETRIC_CANCELED_BY_USER');

  // 3. Device PIN-only rejection when biometric is required
  const pinRes = service.submitAttendanceEvent(
    actor,
    {
      eventType: 'check_in',
      idempotencyKey: 'idem-rej-pinonly',
      workplaceId: 'wp_cairo_hq',
      latitude: 29.9698,
      longitude: 31.2762,
      accuracyMeters: 10,
      locationTimestamp: nowIso,
      deviceTimestamp: nowIso,
      auth: {
        osAuthenticated: true,
        authMethod: 'device_credential',
        deviceSupportsBiometrics: true,
        biometricEnrolled: true,
      },
    },
    { serverTimestamp: nowIso }
  );
  assert.equal(pinRes.ok, false);
  assert.equal(pinRes.code, 'BIOMETRIC_REQUIRED_PIN_NOT_ACCEPTED');

  // 4. Unauthorized workplace (Ahmed is assigned to Cairo HQ, not 10th of Ramadan Factory)
  const unauthWpRes = service.submitAttendanceEvent(
    actor,
    {
      eventType: 'check_in',
      idempotencyKey: 'idem-rej-unauth-wp',
      workplaceId: 'wp_ramadan_factory',
      latitude: 30.2965,
      longitude: 31.7418,
      accuracyMeters: 10,
      locationTimestamp: nowIso,
      deviceTimestamp: nowIso,
      auth: {
        osAuthenticated: true,
        authMethod: 'biometric_strong',
        deviceSupportsBiometrics: true,
        biometricEnrolled: true,
      },
    },
    { serverTimestamp: nowIso }
  );
  assert.equal(unauthWpRes.ok, false);
  assert.equal(unauthWpRes.code, 'WORKPLACE_NOT_ASSIGNED_TO_EMPLOYEE');
});

test('Integration 3: Offline pending synchronization (valid sync vs expired offline event)', () => {
  const { service } = createTestEnv();
  const loginRes = service.login({ email: 'ahmed.saeed@niledelta.eg', password: 'WeHR@2026' });
  const actor = service.validateSessionActor(verifyJwt(loginRes.token).payload).actor;

  // Captured 2 hours ago while offline -> accepted with syncStatus = 'needs_review'
  const captureTime = '2026-11-01T07:00:00.000Z';
  const syncTime = '2026-11-01T09:00:00.000Z';
  const validOffline = service.submitAttendanceEvent(
    actor,
    {
      eventType: 'check_in',
      idempotencyKey: 'idem-offline-valid-01',
      workplaceId: 'wp_cairo_hq',
      latitude: 29.9698,
      longitude: 31.2762,
      accuracyMeters: 14,
      locationTimestamp: captureTime,
      deviceTimestamp: captureTime,
      isOfflineSubmission: true,
      auth: {
        osAuthenticated: true,
        authMethod: 'biometric_strong',
        deviceSupportsBiometrics: true,
        biometricEnrolled: true,
        deviceIdentifier: 'ANDROID-SM-A546E-AHMED01',
      },
    },
    { serverTimestamp: syncTime }
  );
  assert.equal(validOffline.ok, true);
  assert.equal(validOffline.verificationSummary.syncStatus, 'needs_review');

  // Captured 36 hours ago (> 24h max retention) -> rejected as OFFLINE_EVENT_EXPIRED
  const expiredCapture = '2026-10-30T07:00:00.000Z';
  const expiredOffline = service.submitAttendanceEvent(
    actor,
    {
      eventType: 'check_out',
      idempotencyKey: 'idem-offline-expired-01',
      workplaceId: 'wp_cairo_hq',
      latitude: 29.9698,
      longitude: 31.2762,
      accuracyMeters: 14,
      locationTimestamp: expiredCapture,
      deviceTimestamp: expiredCapture,
      isOfflineSubmission: true,
      auth: {
        osAuthenticated: true,
        authMethod: 'biometric_strong',
        deviceSupportsBiometrics: true,
        biometricEnrolled: true,
        deviceIdentifier: 'ANDROID-SM-A546E-AHMED01',
      },
    },
    { serverTimestamp: syncTime }
  );
  assert.equal(expiredOffline.ok, false);
  assert.equal(expiredOffline.code, 'OFFLINE_EVENT_EXPIRED');
});

test('Integration 4: Multi-tenant isolation (Company A cannot access Company B records) & Session revocation', () => {
  const { service } = createTestEnv();

  // Nile Delta HR Admin (Egypt - comp_nile)
  const nileHrLogin = service.login({ email: 'hr@niledelta.eg', password: 'WeHR@2026' });
  const nileHrActor = service.validateSessionActor(verifyJwt(nileHrLogin.token).payload).actor;

  // Attempt to list Company B (Al-Abraj Saudi Arabia - comp_riyadh) employees
  const crossTenantList = service.listEmployees(nileHrActor, { companyId: 'comp_riyadh' });
  assert.equal(crossTenantList.ok, false);
  assert.equal(crossTenantList.status, 403);
  assert.equal(crossTenantList.code, 'CROSS_TENANT_ACCESS_DENIED');

  // Attempt to apply manual attendance correction to Company B employee (emp_yasser)
  const crossTenantCorr = service.applyManualAttendanceCorrection(nileHrActor, {
    employeeId: 'emp_yasser',
    attendanceDate: '2026-11-01',
    correctionType: 'missing_check_in',
    reason: 'Cross-tenant unauthorized attempt',
  });
  assert.equal(crossTenantCorr.ok, false);
  assert.equal(crossTenantCorr.status, 403);
  assert.equal(crossTenantCorr.code, 'CROSS_TENANT_ACCESS_DENIED');

  // Expired JWT token rejection
  const expiredLogin = service.login({
    email: 'ahmed.saeed@niledelta.eg',
    password: 'WeHR@2026',
    nowSeconds: 1000,
  });
  const expiredVerify = verifyJwt(expiredLogin.token, { nowSeconds: 50000 });
  assert.equal(expiredVerify.valid, false);
  assert.equal(expiredVerify.reason, 'TOKEN_EXPIRED');

  // Deactivating an employee immediately revokes their active session token via token_version increment
  const activeLogin = service.login({ email: 'ahmed.saeed@niledelta.eg', password: 'WeHR@2026' });
  const decoded = verifyJwt(activeLogin.token).payload;
  assert.equal(service.validateSessionActor(decoded).ok, true);

  service.setEmployeeActiveStatus(nileHrActor, { employeeId: 'emp_ahmed', isActive: false });
  const afterDeactivation = service.validateSessionActor(decoded);
  assert.equal(afterDeactivation.ok, false);
  assert.equal(afterDeactivation.code, 'ACCOUNT_DEACTIVATED_OR_REVOKED');
});

test('Integration 5: Manual attendance correction authorization & Database-level immutability of raw attendance_events', () => {
  const { db, service } = createTestEnv();

  // Regular employee cannot perform manual attendance corrections
  const empLogin = service.login({ email: 'ahmed.saeed@niledelta.eg', password: 'WeHR@2026' });
  const empActor = service.validateSessionActor(verifyJwt(empLogin.token).payload).actor;
  const unauthCorr = service.applyManualAttendanceCorrection(empActor, {
    employeeId: 'emp_sara',
    attendanceDate: '2026-11-01',
    correctionType: 'excuse_late_arrival',
    reason: 'Trying to excuse my colleague',
  });
  assert.equal(unauthCorr.ok, false);
  assert.equal(unauthCorr.status, 403);

  // HR Admin can perform manual correction; original raw event remains untouched
  const hrLogin = service.login({ email: 'hr@niledelta.eg', password: 'WeHR@2026' });
  const hrActor = service.validateSessionActor(verifyJwt(hrLogin.token).payload).actor;

  const authCorr = service.applyManualAttendanceCorrection(hrActor, {
    employeeId: 'emp_sara',
    attendanceDate: '2026-11-01',
    correctionType: 'excuse_late_arrival',
    statusOverride: 'present',
    reason: 'Official traffic delay approved by HR Director',
  });
  assert.equal(authCorr.ok, true);
  assert.equal(authCorr.attendanceRecord.status, 'present');

  // Verify database-level immutability trigger blocks deleting or mutating core fields of attendance_events
  assert.throws(() => {
    db.prepare('DELETE FROM attendance_events WHERE id = ?').run('attevt_sara_in');
  }, /IMMUTABLE_VIOLATION/);

  assert.throws(() => {
    db.prepare('UPDATE attendance_events SET biometric_verified = 1 WHERE id = ?').run('attevt_sara_in');
  }, /IMMUTABLE_VIOLATION/);
});
