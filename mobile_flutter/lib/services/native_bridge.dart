import 'dart:convert';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'biometric_auth_service.dart';
import 'location_geofence_service.dart';

/// Answers native calls from the We HR web app (web/native-bridge.js).
///
/// The page posts `{"id": n, "type": "...", "payload": {...}}` on the `WeHrNative` channel;
/// the reply is delivered with `window.weHrNativeReply(n, result)`.
///
/// - `locate`    -> fresh GPS fix: latitude, longitude, accuracy, timestamp, isMocked
/// - `biometric` -> OS fingerprint / Face ID prompt, returned in the server's `auth` format
/// - `device`    -> platform, model and OS version
class NativeBridge {
  final WebViewController _controller;
  final LocationGeofenceService _location;
  final BiometricAuthService _biometrics;
  final DeviceInfoPlugin _deviceInfo = DeviceInfoPlugin();

  NativeBridge(
    this._controller, {
    LocationGeofenceService? location,
    BiometricAuthService? biometrics,
  })  : _location = location ?? LocationGeofenceService(),
        _biometrics = biometrics ?? BiometricAuthService();

  Future<void> handle(JavaScriptMessage message) async {
    Map<String, dynamic> request;
    try {
      request = jsonDecode(message.message) as Map<String, dynamic>;
    } catch (_) {
      return; // not a bridge request
    }
    final id = request['id'];
    final payload = (request['payload'] as Map<String, dynamic>?) ?? const {};

    Map<String, dynamic> result;
    try {
      switch (request['type']) {
        case 'locate':
          result = await _locate();
          break;
        case 'biometric':
          result = await _authenticate(payload);
          break;
        case 'device':
          result = await _device();
          break;
        default:
          result = {'error': 'UNKNOWN_BRIDGE_CALL'};
      }
    } catch (e) {
      result = {'error': e.toString()};
    }
    await _controller.runJavaScript('window.weHrNativeReply(${jsonEncode(id)}, ${jsonEncode(result)});');
  }

  Future<Map<String, dynamic>> _locate() async {
    final pos = await _location.acquireFreshLocation();
    return {
      'latitude': pos.latitude,
      'longitude': pos.longitude,
      'accuracy': pos.accuracy,
      'timestamp': pos.timestamp.toUtc().toIso8601String(),
      'isMocked': pos.isMocked,
    };
  }

  Future<Map<String, dynamic>> _authenticate(Map<String, dynamic> payload) async {
    final result = await _biometrics.authenticateForAttendance(
      localizedReason: (payload['reason'] as String?) ?? 'We HR',
      requireBiometricOnly: payload['requireBiometricOnly'] == true,
      allowAdminBiometricException: payload['allowException'] == true,
    );
    final device = await _device();
    return {
      ...result.toApiJson(
        deviceIdentifier: (payload['deviceIdentifier'] as String?) ?? 'APP-UNKNOWN',
        devicePlatform: device['platform'] as String,
        deviceModel: device['model'] as String,
        osVersion: device['osVersion'] as String,
      ),
      'errorMessage': result.errorMessage,
    };
  }

  Future<Map<String, dynamic>> _device() async {
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      final ios = await _deviceInfo.iosInfo;
      return {'platform': 'ios', 'model': ios.utsname.machine, 'osVersion': ios.systemVersion};
    }
    final android = await _deviceInfo.androidInfo;
    return {
      'platform': 'android',
      'model': '${android.manufacturer} ${android.model}',
      'osVersion': 'Android ${android.version.release}',
    };
  }
}
