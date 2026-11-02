'use strict';

/**
 * We HR — Mobile Biometric & Device Authentication Policy Evaluator
 *
 * CRITICAL DISTINCTIONS ENFORCED:
 * 1. Device supports biometric hardware (`deviceSupportsBiometrics`)
 * 2. A biometric is enrolled on the OS (`biometricEnrolled`)
 * 3. The OS local authentication succeeded (`osAuthenticated`)
 * 4. Modality used (`biometric_strong` / `biometric_weak` vs `device_credential` PIN/Pattern/Passcode)
 * 5. Device binding (`deviceIdentifier`) to mitigate "buddy punching" where Employee A logs into
 *    Employee B's phone and Employee B scans their own fingerprint.
 *
 * PRIVACY RULE:
 * We HR NEVER collects, transmits, or stores raw fingerprint images, face meshes, or biometric templates.
 */

const VALID_AUTH_METHODS = new Set([
  'biometric_strong',
  'biometric_weak',
  'device_credential',
  'exception_fallback',
  'manager_manual',
  'none',
]);

/**
 * Evaluates the biometric & device authentication payload against company, workplace, and employee policies.
 *
 * @param {Object} params
 * @param {Object} params.company - Tenant company configuration
 * @param {Object} params.workplace - Workplace configuration
 * @param {Object} params.employee - Employee profile
 * @param {Object} params.authPayload - Client authentication metadata
 * @param {Array<Object>} params.employeeApprovedDevices - Approved devices for this employee
 * @param {Array<Object>} params.otherEmployeesUsingSameDevice - Approved devices belonging to OTHER employees with same device_identifier
 * @returns {Object} Evaluation verdict
 */
function evaluateBiometricAndDeviceAuth({
  company,
  workplace,
  employee,
  authPayload = {},
  employeeApprovedDevices = [],
  otherEmployeesUsingSameDevice = [],
}) {
  const flags = [];
  const {
    osAuthenticated = false,
    authMethod = 'none',
    deviceSupportsBiometrics = false,
    biometricEnrolled = false,
    errorCode = null, // e.g., 'USER_CANCELED', 'BIOMETRIC_FAILED', 'LOCKED_OUT', 'NOT_ENROLLED', 'NOT_AVAILABLE'
    deviceIdentifier = null,
    devicePlatform = 'android',
  } = authPayload;

  if (!VALID_AUTH_METHODS.has(authMethod)) {
    return {
      passed: false,
      biometricVerified: false,
      normalizedAuthMethod: 'none',
      status: 'rejected',
      rejectionCode: 'INVALID_AUTH_METHOD',
      rejectionReason: `Unrecognized authentication method: ${authMethod}`,
      flags,
    };
  }

  // 1. Handle explicit OS authentication errors (cancellation, failure, lockout)
  if (errorCode === 'USER_CANCELED') {
    return {
      passed: false,
      biometricVerified: false,
      normalizedAuthMethod: 'none',
      status: 'rejected',
      rejectionCode: 'BIOMETRIC_CANCELED_BY_USER',
      rejectionReason: 'Biometric authentication prompt was canceled by the employee.',
      flags,
    };
  }

  if (errorCode === 'LOCKED_OUT' || errorCode === 'PERMANENTLY_LOCKED_OUT') {
    return {
      passed: false,
      biometricVerified: false,
      normalizedAuthMethod: 'none',
      status: 'rejected',
      rejectionCode: 'BIOMETRIC_LOCKED_OUT',
      rejectionReason: 'Device biometric sensor is locked out due to too many failed attempts.',
      flags,
    };
  }

  if (errorCode === 'BIOMETRIC_FAILED' || !osAuthenticated) {
    return {
      passed: false,
      biometricVerified: false,
      normalizedAuthMethod: 'none',
      status: 'rejected',
      rejectionCode: 'BIOMETRIC_AUTHENTICATION_FAILED',
      rejectionReason: 'Operating system local authentication did not succeed.',
      flags,
    };
  }

  // 2. Determine whether true biometric verification occurred
  // CRITICAL: Never claim biometricVerified = true if the device only returned a PIN/pattern/passcode
  // or if hardware/enrollment is absent.
  const isTrueBiometric =
    (authMethod === 'biometric_strong' || authMethod === 'biometric_weak') &&
    deviceSupportsBiometrics === true &&
    biometricEnrolled === true &&
    osAuthenticated === true;

  // Determine whether policy requires biometrics
  const policyRequiresBiometric = Boolean(
    (company && company.require_biometric_strict) ||
      (workplace && workplace.require_biometric) ||
      (employee && employee.require_biometric)
  );

  const hasAdminException = Boolean(employee && employee.allow_biometric_exception);

  // 3. Enforce biometric-only policy vs fallback
  if (!isTrueBiometric) {
    if (policyRequiresBiometric && !hasAdminException) {
      if (authMethod === 'device_credential') {
        return {
          passed: false,
          biometricVerified: false,
          normalizedAuthMethod: 'device_credential',
          status: 'rejected',
          rejectionCode: 'BIOMETRIC_REQUIRED_PIN_NOT_ACCEPTED',
          rejectionReason:
            'Company attendance policy requires biometric verification (Fingerprint / Face ID). Device PIN, pattern, or passcode alone is not permitted.',
          flags,
        };
      }
      if (!deviceSupportsBiometrics || !biometricEnrolled) {
        return {
          passed: false,
          biometricVerified: false,
          normalizedAuthMethod: authMethod,
          status: 'rejected',
          rejectionCode: 'BIOMETRIC_NOT_ENROLLED_OR_UNAVAILABLE',
          rejectionReason:
            'Biometric hardware is unavailable or no fingerprint/face is enrolled on this device. Contact HR for a device exception if applicable.',
          flags,
        };
      }
      return {
        passed: false,
        biometricVerified: false,
        normalizedAuthMethod: authMethod,
        status: 'rejected',
        rejectionCode: 'BIOMETRIC_VERIFICATION_REQUIRED',
        rejectionReason: 'Biometric authentication is required to submit attendance.',
        flags,
      };
    }

    // Employee has an HR-approved exception (e.g., broken sensor or unsupported phone)
    flags.push('AUTHORIZED_NON_BIOMETRIC_FALLBACK');
  }

  // 4. Anti-Buddy-Punching / Employee-Device Binding Controls
  // Remember: OS LocalAuthentication only proves *someone* enrolled on that phone authenticated.
  // If Employee A logs into Employee B's phone, Employee B's fingerprint would pass OS prompt!
  if (otherEmployeesUsingSameDevice && otherEmployeesUsingSameDevice.length > 0) {
    flags.push('SHARED_DEVICE_USED_BY_ANOTHER_EMPLOYEE');
    if (company && company.require_approved_device) {
      return {
        passed: false,
        biometricVerified: isTrueBiometric,
        normalizedAuthMethod: authMethod,
        status: 'rejected',
        rejectionCode: 'SHARED_DEVICE_PROHIBITED',
        rejectionReason:
          'This mobile device is registered to another employee. Shared-device attendance is blocked by company security policy.',
        flags,
      };
    }
  }

  if (company && company.require_approved_device) {
    const matchingDevice = employeeApprovedDevices.find(
      (d) => d.device_identifier === deviceIdentifier && d.status === 'approved'
    );
    if (!matchingDevice) {
      return {
        passed: false,
        biometricVerified: isTrueBiometric,
        normalizedAuthMethod: authMethod,
        status: 'rejected',
        rejectionCode: 'UNAPPROVED_EMPLOYEE_DEVICE',
        rejectionReason:
          'This device is not yet approved for your employee profile. Please request device approval from HR.',
        flags,
      };
    }
  } else if (deviceIdentifier && employeeApprovedDevices.length > 0) {
    const matchingDevice = employeeApprovedDevices.find(
      (d) => d.device_identifier === deviceIdentifier && d.status === 'approved'
    );
    if (!matchingDevice) {
      flags.push('NEW_OR_UNREGISTERED_DEVICE');
    }
  }

  const requiresReview = flags.includes('SHARED_DEVICE_USED_BY_ANOTHER_EMPLOYEE') || flags.includes('NEW_OR_UNREGISTERED_DEVICE');

  return {
    passed: true,
    biometricVerified: isTrueBiometric,
    normalizedAuthMethod: isTrueBiometric
      ? authMethod
      : hasAdminException && authMethod === 'exception_fallback'
      ? 'exception_fallback'
      : authMethod,
    devicePlatform,
    status: requiresReview ? 'needs_review' : 'accepted',
    rejectionCode: null,
    rejectionReason: null,
    flags,
  };
}

module.exports = {
  evaluateBiometricAndDeviceAuth,
};
