'use strict';

/**
 * We HR — Server-Side Geospatial & Geofence Validation Engine
 *
 * CRITICAL SECURITY PRINCIPLE:
 * Never trust a client-supplied boolean such as "isInsideGeofence = true".
 * The server independently calculates Haversine distance and validates
 * coordinate bounds, GPS horizontal accuracy, reading freshness, and
 * location-spoofing indicators.
 */

const EARTH_RADIUS_METERS = 6371000.0;

/**
 * Converts degrees to radians.
 * @param {number} degrees
 * @returns {number}
 */
function toRadians(degrees) {
  return (degrees * Math.PI) / 180.0;
}

/**
 * Validates whether latitude and longitude are finite numbers within valid geographic bounds.
 * Also rejects exact (0, 0) "Null Island" default uninitialized GPS coordinates.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateCoordinates(latitude, longitude) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return { valid: false, reason: 'INVALID_COORDINATE_TYPE' };
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { valid: false, reason: 'NON_FINITE_COORDINATES' };
  }
  if (latitude < -90 || latitude > 90) {
    return { valid: false, reason: 'LATITUDE_OUT_OF_RANGE' };
  }
  if (longitude < -180 || longitude > 180) {
    return { valid: false, reason: 'LONGITUDE_OUT_OF_RANGE' };
  }
  if (Math.abs(latitude) < 0.00001 && Math.abs(longitude) < 0.00001) {
    return { valid: false, reason: 'NULL_ISLAND_COORDINATES' };
  }
  return { valid: true };
}

/**
 * Calculates the great-circle distance in meters between two points on Earth
 * using the Haversine formula.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in meters rounded to 2 decimal places
 */
function calculateHaversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const coordCheck1 = validateCoordinates(lat1, lon1);
  const coordCheck2 = validateCoordinates(lat2, lon2);
  if (!coordCheck1.valid || !coordCheck2.valid) {
    throw new Error('Cannot calculate distance for invalid coordinates');
  }

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  const distance = EARTH_RADIUS_METERS * c;
  return Math.round(distance * 100) / 100;
}

/**
 * Evaluates location reading quality, geofence containment, and spoofing indicators.
 *
 * @param {Object} params
 * @param {Object} params.workplace - Workplace configuration record
 * @param {number} params.latitude - Reported employee latitude
 * @param {number} params.longitude - Reported employee longitude
 * @param {number} params.accuracyMeters - Reported GPS horizontal accuracy in meters
 * @param {string|number} params.locationTimestamp - Timestamp when GPS reading was acquired
 * @param {string|number} params.referenceTimestamp - Server timestamp (or device capture timestamp for offline sync)
 * @param {boolean} [params.isMockLocation] - Whether the OS reported a mock location provider
 * @param {Object|null} [params.previousEvent] - Last attendance event of the employee for impossible-travel check
 * @returns {Object} Structured validation verdict
 */
function evaluateGeofenceAndLocation({
  workplace,
  latitude,
  longitude,
  accuracyMeters,
  locationTimestamp,
  referenceTimestamp,
  isMockLocation = false,
  previousEvent = null,
}) {
  const flags = [];

  if (!workplace || !workplace.is_active) {
    return {
      passed: false,
      status: 'rejected',
      rejectionCode: 'WORKPLACE_INACTIVE_OR_MISSING',
      rejectionReason: 'The target workplace is inactive or does not exist.',
      distanceMeters: null,
      permittedRadiusMeters: workplace ? workplace.radius_meters : null,
      flags,
    };
  }

  // 1. Validate coordinates
  const coordCheck = validateCoordinates(latitude, longitude);
  if (!coordCheck.valid) {
    return {
      passed: false,
      status: 'rejected',
      rejectionCode: coordCheck.reason,
      rejectionReason: `Invalid GPS coordinates (${coordCheck.reason}).`,
      distanceMeters: null,
      permittedRadiusMeters: workplace.radius_meters,
      flags,
    };
  }

  // 2. Check mock location indicator from OS
  if (isMockLocation === true) {
    flags.push('MOCK_LOCATION_REPORTED_BY_OS');
    return {
      passed: false,
      status: 'rejected',
      rejectionCode: 'MOCK_LOCATION_DETECTED',
      rejectionReason: 'Mock location provider detected on device. Disable developer mock locations to record attendance.',
      distanceMeters: calculateHaversineDistanceMeters(
        latitude,
        longitude,
        workplace.latitude,
        workplace.longitude
      ),
      permittedRadiusMeters: workplace.radius_meters,
      flags,
    };
  }

  // 3. Validate GPS accuracy
  const maxAccuracy = Number(workplace.max_accuracy_meters || 50);
  if (typeof accuracyMeters !== 'number' || Number.isNaN(accuracyMeters) || accuracyMeters <= 0) {
    return {
      passed: false,
      status: 'rejected',
      rejectionCode: 'INVALID_LOCATION_ACCURACY',
      rejectionReason: 'Location reading is missing a valid positive accuracy value in meters.',
      distanceMeters: null,
      permittedRadiusMeters: workplace.radius_meters,
      flags,
    };
  }

  // Suspiciously perfect accuracy (< 0.5m on consumer GPS often indicates injected coordinates)
  if (accuracyMeters < 0.5) {
    flags.push('SUSPICIOUSLY_EXACT_GPS_ACCURACY');
  }

  if (accuracyMeters > maxAccuracy) {
    return {
      passed: false,
      status: 'rejected',
      rejectionCode: 'POOR_LOCATION_ACCURACY',
      rejectionReason: `Location accuracy (${accuracyMeters}m) exceeds the workplace maximum threshold (${maxAccuracy}m). Please move to an area with clear sky view.`,
      distanceMeters: calculateHaversineDistanceMeters(
        latitude,
        longitude,
        workplace.latitude,
        workplace.longitude
      ),
      permittedRadiusMeters: workplace.radius_meters,
      flags,
    };
  }

  // 4. Validate timestamp freshness
  const maxAgeSeconds = Number(workplace.max_location_age_seconds || 120);
  const locTimeMs = new Date(locationTimestamp).getTime();
  const refTimeMs = new Date(referenceTimestamp).getTime();

  if (Number.isNaN(locTimeMs) || Number.isNaN(refTimeMs)) {
    return {
      passed: false,
      status: 'rejected',
      rejectionCode: 'INVALID_LOCATION_TIMESTAMP',
      rejectionReason: 'Invalid location timestamp.',
      distanceMeters: null,
      permittedRadiusMeters: workplace.radius_meters,
      flags,
    };
  }

  const ageSeconds = (refTimeMs - locTimeMs) / 1000.0;
  // Reject stale readings or timestamps significantly in the future (> 60s clock drift)
  if (ageSeconds > maxAgeSeconds) {
    return {
      passed: false,
      status: 'rejected',
      rejectionCode: 'STALE_LOCATION_READING',
      rejectionReason: `Location reading is stale (${Math.round(ageSeconds)}s old; max allowed is ${maxAgeSeconds}s). Refresh location and try again.`,
      distanceMeters: calculateHaversineDistanceMeters(
        latitude,
        longitude,
        workplace.latitude,
        workplace.longitude
      ),
      permittedRadiusMeters: workplace.radius_meters,
      flags,
    };
  }

  if (ageSeconds < -60) {
    flags.push('DEVICE_CLOCK_AHEAD_OF_SERVER');
  }

  // 5. Server-side Haversine distance calculation
  const distanceMeters = calculateHaversineDistanceMeters(
    latitude,
    longitude,
    workplace.latitude,
    workplace.longitude
  );

  // Suspicious exact match with workplace center (0.00m distance is statistically rare in real GPS)
  if (distanceMeters === 0 && accuracyMeters <= 2) {
    flags.push('EXACT_WORKPLACE_CENTER_COORDINATES');
  }

  // 6. Impossible travel speed check against previous event
  if (
    previousEvent &&
    typeof previousEvent.latitude === 'number' &&
    typeof previousEvent.longitude === 'number' &&
    previousEvent.server_timestamp
  ) {
    const prevTimeMs = new Date(previousEvent.server_timestamp).getTime();
    const elapsedSeconds = Math.abs(refTimeMs - prevTimeMs) / 1000.0;
    if (elapsedSeconds > 1 && elapsedSeconds < 14400) {
      const travelMeters = calculateHaversineDistanceMeters(
        previousEvent.latitude,
        previousEvent.longitude,
        latitude,
        longitude
      );
      const speedMps = travelMeters / elapsedSeconds;
      // > 55 m/s (~198 km/h) over ground between punches
      if (travelMeters > 1000 && speedMps > 55) {
        flags.push(`IMPOSSIBLE_TRAVEL_SPEED_${Math.round(speedMps)}MPS`);
      }
    }
  }

  // 7. Geofence radius boundary evaluation
  const permittedRadius = Number(workplace.radius_meters);
  const bufferAllowance =
    workplace.accuracy_buffer_policy === 'partial_buffer'
      ? Math.min(accuracyMeters * 0.5, 15)
      : 0;
  const effectiveMaxDistance = permittedRadius + bufferAllowance;

  if (distanceMeters > effectiveMaxDistance) {
    return {
      passed: false,
      status: 'rejected',
      rejectionCode: 'OUTSIDE_GEOFENCE_BOUNDARY',
      rejectionReason: `Outside authorized workplace geofence (${distanceMeters}m from ${workplace.name_en}; permitted radius is ${permittedRadius}m).`,
      distanceMeters,
      permittedRadiusMeters: permittedRadius,
      flags,
    };
  }

  const requiresReview = flags.some((f) => f.startsWith('IMPOSSIBLE_TRAVEL_SPEED_') || f === 'EXACT_WORKPLACE_CENTER_COORDINATES');

  return {
    passed: true,
    status: requiresReview ? 'needs_review' : 'accepted',
    rejectionCode: null,
    rejectionReason: null,
    distanceMeters,
    permittedRadiusMeters: permittedRadius,
    flags,
  };
}

module.exports = {
  validateCoordinates,
  calculateHaversineDistanceMeters,
  evaluateGeofenceAndLocation,
};
