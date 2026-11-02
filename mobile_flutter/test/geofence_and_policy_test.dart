import 'package:flutter_test/flutter_test.dart';
import 'package:we_hr_mobile/services/location_geofence_service.dart';

void main() {
  group('We HR Flutter Location & Geofence Unit Tests', () {
    test('calculates Haversine distance accurately for Cairo HQ coordinates', () {
      final distance = LocationGeofenceService.calculateHaversineMeters(
        29.9697,
        31.2761,
        29.9698,
        31.2762,
      );
      expect(distance, greaterThan(10.0));
      expect(distance, lessThan(20.0));
    });

    test('returns 0m when coordinates are identical', () {
      final distance = LocationGeofenceService.calculateHaversineMeters(
        24.7136,
        46.6753,
        24.7136,
        46.6753,
      );
      expect(distance, equals(0.0));
    });
  });
}
