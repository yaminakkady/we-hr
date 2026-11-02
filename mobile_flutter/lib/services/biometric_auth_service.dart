import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:local_auth/error_codes.dart' as auth_error;

/// Result of a single operating-system local authentication challenge.
///
/// SECURITY RULE:
/// This result is single-use for the active attendance transaction and must
/// NEVER be cached or reused for future attendance submissions.
class BiometricVerificationResult {
  final bool osAuthenticated;
  final String authMethod; // 'biometric_strong' | 'biometric_weak' | 'device_credential' | 'exception_fallback' | 'none'
  final bool deviceSupportsBiometrics;
  final bool biometricEnrolled;
  final String? errorCode;
  final String? errorMessage;

  const BiometricVerificationResult({
    required this.osAuthenticated,
    required this.authMethod,
    required this.deviceSupportsBiometrics,
    required this.biometricEnrolled,
    this.errorCode,
    this.errorMessage,
  });

  Map<String, dynamic> toApiJson({
    required String deviceIdentifier,
    required String devicePlatform,
    required String deviceModel,
    required String osVersion,
  }) {
    return {
      'osAuthenticated': osAuthenticated,
      'authMethod': authMethod,
      'deviceSupportsBiometrics': deviceSupportsBiometrics,
      'biometricEnrolled': biometricEnrolled,
      'errorCode': errorCode,
      'deviceIdentifier': deviceIdentifier,
      'devicePlatform': devicePlatform,
      'deviceModel': deviceModel,
      'osVersion': osVersion,
    };
  }
}

/// Wrapper around Android `BiometricPrompt` and iOS `LocalAuthentication`.
///
/// Explicitly distinguishes between:
/// 1. Device supports biometric hardware (`canCheckBiometrics && isDeviceSupported`)
/// 2. At least one biometric is enrolled (`getAvailableBiometrics().isNotEmpty`)
/// 3. Biometric-only authentication (`biometricOnly: true`) vs fallback exception
///
/// Never collects, reads, or transmits raw fingerprint images or face templates.
class BiometricAuthService {
  final LocalAuthentication _localAuth;

  BiometricAuthService({LocalAuthentication? localAuth})
      : _localAuth = localAuth ?? LocalAuthentication();

  Future<BiometricVerificationResult> authenticateForAttendance({
    required String localizedReason,
    required bool requireBiometricOnly,
    required bool allowAdminBiometricException,
  }) async {
    bool isDeviceSupported = false;
    bool canCheckBiometrics = false;
    List<BiometricType> enrolledBiometrics = const [];

    try {
      isDeviceSupported = await _localAuth.isDeviceSupported();
      canCheckBiometrics = await _localAuth.canCheckBiometrics;
      enrolledBiometrics = await _localAuth.getAvailableBiometrics();
    } on PlatformException catch (e) {
      return BiometricVerificationResult(
        osAuthenticated: false,
        authMethod: 'none',
        deviceSupportsBiometrics: false,
        biometricEnrolled: false,
        errorCode: e.code,
        errorMessage: e.message,
      );
    }

    final bool hardwareAvailable = isDeviceSupported && canCheckBiometrics;
    final bool hasEnrolledBiometric = enrolledBiometrics.isNotEmpty;

    // If hardware or enrollment is missing:
    if (!hardwareAvailable || !hasEnrolledBiometric) {
      if (allowAdminBiometricException) {
        return const BiometricVerificationResult(
          osAuthenticated: true,
          authMethod: 'exception_fallback',
          deviceSupportsBiometrics: false,
          biometricEnrolled: false,
        );
      }
      return BiometricVerificationResult(
        osAuthenticated: false,
        authMethod: 'none',
        deviceSupportsBiometrics: hardwareAvailable,
        biometricEnrolled: hasEnrolledBiometric,
        errorCode: 'NOT_ENROLLED',
        errorMessage: 'No fingerprint or Face ID is enrolled on this device.',
      );
    }

    try {
      // Invoke the operating system BiometricPrompt / LocalAuthentication dialog.
      // When requireBiometricOnly is true, `biometricOnly: true` prevents silent fallback
      // to device PIN/passcode/pattern.
      final bool didAuthenticate = await _localAuth.authenticate(
        localizedReason: localizedReason,
        options: AuthenticationOptions(
          biometricOnly: requireBiometricOnly,
          stickyAuth: true,
          useErrorDialogs: true,
        ),
      );

      if (!didAuthenticate) {
        return BiometricVerificationResult(
          osAuthenticated: false,
          authMethod: 'none',
          deviceSupportsBiometrics: hardwareAvailable,
          biometricEnrolled: hasEnrolledBiometric,
          errorCode: 'USER_CANCELED',
          errorMessage: 'Biometric authentication was canceled or did not match.',
        );
      }

      final bool hasStrongType = enrolledBiometrics.contains(BiometricType.strong) ||
          enrolledBiometrics.contains(BiometricType.fingerprint) ||
          enrolledBiometrics.contains(BiometricType.face);

      final String resolvedModality = requireBiometricOnly
          ? (hasStrongType ? 'biometric_strong' : 'biometric_weak')
          : 'device_credential';

      return BiometricVerificationResult(
        osAuthenticated: true,
        authMethod: resolvedModality,
        deviceSupportsBiometrics: hardwareAvailable,
        biometricEnrolled: hasEnrolledBiometric,
      );
    } on PlatformException catch (e) {
      String mappedCode = 'BIOMETRIC_FAILED';
      if (e.code == auth_error.notEnrolled || e.code == auth_error.passcodeNotSet) {
        mappedCode = 'NOT_ENROLLED';
      } else if (e.code == auth_error.lockedOut) {
        mappedCode = 'LOCKED_OUT';
      } else if (e.code == auth_error.permanentlyLockedOut) {
        mappedCode = 'PERMANENTLY_LOCKED_OUT';
      } else if (e.code == auth_error.notAvailable) {
        mappedCode = 'NOT_AVAILABLE';
      }

      return BiometricVerificationResult(
        osAuthenticated: false,
        authMethod: 'none',
        deviceSupportsBiometrics: hardwareAvailable,
        biometricEnrolled: hasEnrolledBiometric,
        errorCode: mappedCode,
        errorMessage: e.message,
      );
    }
  }
}
