import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Secure local queue for offline pending attendance events.
///
/// OFFLINE INTEGRITY RULE:
/// Offline events are stored with `status: 'pending'` and local diagnostic metadata.
/// The mobile UI never claims an offline event is officially accepted until the
/// backend revalidates and accepts it upon reconnection.
class OfflineAttendanceQueue {
  static const String _storageKey = 'we_hr_pending_offline_attendance_v1';
  static const Duration maxRetentionWindow = Duration(hours: 24);

  final FlutterSecureStorage _storage;

  OfflineAttendanceQueue({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  Future<List<Map<String, dynamic>>> getPendingEvents() async {
    final raw = await _storage.read(key: _storageKey);
    if (raw == null || raw.isEmpty) return [];
    final List<dynamic> decoded = jsonDecode(raw) as List<dynamic>;
    return decoded.cast<Map<String, dynamic>>();
  }

  Future<void> enqueuePendingEvent(Map<String, dynamic> eventPayload) async {
    final current = await getPendingEvents();
    final enriched = {
      ...eventPayload,
      'isOfflineSubmission': true,
      'localQueueStatus': 'pending',
      'queuedAtIso': DateTime.now().toUtc().toIso8601String(),
    };
    current.add(enriched);
    await _storage.write(key: _storageKey, value: jsonEncode(current));
  }

  Future<void> replaceQueue(List<Map<String, dynamic>> remaining) async {
    await _storage.write(key: _storageKey, value: jsonEncode(remaining));
  }
}
