import 'dart:math' as math;
import 'package:geolocator/geolocator.dart';

/// Client-side GPS reading and preview geofence distance calculation.
///
/// IMPORTANT ARCHITECTURAL RULE:
/// Client-side distance and geofence checks are for immediate user feedback only.
/// The We HR backend independently computes the authoritative Haversine distance
/// and validates accuracy, freshness, and mock-location flags.
class LocationGeofenceService {
  static const double _earthRadiusMeters = 6371000.0;

  /// Calculates Haversine great-circle distance in meters between two coordinate pairs.
  static double calculateHaversineMeters(
    double lat1,
    double lon1,
    double lat2,
    double lon2,
  ) {
    final dLat = _toRadians(lat2 - lat1);
    final dLon = _toRadians(lon2 - lon1);
    final rLat1 = _toRadians(lat1);
    final rLat2 = _toRadians(lat2);

    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(rLat1) * math.cos(rLat2) * math.sin(dLon / 2) * math.sin(dLon / 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(math.max(0.0, 1.0 - a)));
    return ((_earthRadiusMeters * c) * 100.0).roundToDouble() / 100.0;
  }

  static double _toRadians(double deg) => deg * (math.pi / 180.0);

  /// Requests foreground location permission (WhenInUse) and acquires a fresh high-accuracy GPS reading.
  Future<Position> acquireFreshLocation() async {
    final bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw Exception('LOCATION_SERVICES_DISABLED');
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        throw Exception('LOCATION_PERMISSION_DENIED');
      }
    }

    if (permission == LocationPermission.deniedForever) {
      throw Exception('LOCATION_PERMISSION_PERMANENTLY_DENIED');
    }

    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 15),
      ),
    );
  }
}
