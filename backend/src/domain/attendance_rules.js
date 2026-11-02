'use strict';

/**
 * We HR — Attendance State Machine, Shift, Overnight Shift & Policy Engine
 */

const VALID_EVENT_TYPES = new Set([
  'check_in',
  'check_out',
  'break_start',
  'break_end',
  'field_visit',
  'manual_correction',
]);

/**
 * Parses an "HH:MM" 24-hour string into minutes since 00:00.
 * @param {string} hhmm
 * @returns {number}
 */
function parseTimeToMinutes(hhmm) {
  const parts = String(hhmm || '09:00').split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

/**
 * Extracts local date string (YYYY-MM-DD), day of week (0=Sun..6=Sat), and minutes since midnight
 * in the specified IANA timezone (e.g., 'Africa/Cairo' or 'Asia/Riyadh').
 * @param {Date|string|number} timestamp
 * @param {string} timeZone
 * @returns {{ dateStr: string, dayOfWeek: number, minutesOfDay: number }}
 */
function getZonedDateParts(timestamp, timeZone = 'Africa/Cairo') {
  const dateObj = new Date(timestamp);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(dateObj);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const dateStr = `${map.year}-${map.month}-${map.day}`;
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = weekdays[map.weekday] ?? dateObj.getUTCDay();
  const minutesOfDay = parseInt(map.hour, 10) * 60 + parseInt(map.minute, 10);
  return { dateStr, dayOfWeek, minutesOfDay };
}

/**
 * Subtracts 1 calendar day from a YYYY-MM-DD date string.
 * @param {string} dateStr
 * @returns {string}
 */
function previousDateString(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/**
 * Resolves the anchor attendance date for a shift, accounting for overnight (cross-midnight) shifts.
 * Example: An overnight shift starts at 22:00 on 2026-11-01 and ends at 06:00 on 2026-11-02.
 * An event occurring at 05:45 on 2026-11-02 belongs to the 2026-11-01 shift!
 *
 * @param {Date|string|number} eventTimestamp
 * @param {Object|null} shift
 * @param {string} [fallbackTimezone]
 * @returns {{ attendanceDate: string, zonedParts: { dateStr: string, dayOfWeek: number, minutesOfDay: number }, isPreviousDayOvernightAnchor: boolean }}
 */
function resolveShiftAnchorDate(eventTimestamp, shift, fallbackTimezone = 'Africa/Cairo') {
  const tz = (shift && shift.timezone) || fallbackTimezone || 'Africa/Cairo';
  const zonedParts = getZonedDateParts(eventTimestamp, tz);

  if (!shift) {
    return {
      attendanceDate: zonedParts.dateStr,
      zonedParts,
      isPreviousDayOvernightAnchor: false,
    };
  }

  const startMins = parseTimeToMinutes(shift.start_time);
  const endMins = parseTimeToMinutes(shift.end_time);
  const isOvernight = Boolean(shift.is_overnight || endMins <= startMins);

  // If overnight shift and event time is before noon (endMins + 4 hours buffer), anchor to previous date
  if (isOvernight && zonedParts.minutesOfDay <= endMins + 240) {
    return {
      attendanceDate: previousDateString(zonedParts.dateStr),
      zonedParts,
      isPreviousDayOvernightAnchor: true,
    };
  }

  return {
    attendanceDate: zonedParts.dateStr,
    zonedParts,
    isPreviousDayOvernightAnchor: false,
  };
}

/**
 * Validates whether an attendance event transition is legal given the employee's current daily state.
 * Prevents duplicate check-ins without check-out, check-out before check-in, etc.
 *
 * @param {string} currentState - 'not_checked_in' | 'checked_in' | 'on_break' | 'checked_out'
 * @param {string} eventType - 'check_in' | 'check_out' | 'break_start' | 'break_end' | 'field_visit'
 * @returns {{ valid: boolean, nextState: string, rejectionCode?: string, rejectionReason?: string }}
 */
function validateAttendanceStateTransition(currentState = 'not_checked_in', eventType) {
  if (!VALID_EVENT_TYPES.has(eventType)) {
    return {
      valid: false,
      nextState: currentState,
      rejectionCode: 'INVALID_EVENT_TYPE',
      rejectionReason: `Unsupported attendance event type: ${eventType}`,
    };
  }

  if (eventType === 'field_visit') {
    return {
      valid: true,
      nextState: currentState === 'not_checked_in' ? 'checked_in' : currentState,
    };
  }

  switch (currentState) {
    case 'not_checked_in':
      if (eventType === 'check_in') {
        return { valid: true, nextState: 'checked_in' };
      }
      return {
        valid: false,
        nextState: currentState,
        rejectionCode: 'INVALID_SEQUENCE_NOT_CHECKED_IN',
        rejectionReason: `Cannot record '${eventType}' before recording a valid 'check_in'.`,
      };

    case 'checked_in':
      if (eventType === 'check_in') {
        return {
          valid: false,
          nextState: currentState,
          rejectionCode: 'DUPLICATE_CHECK_IN_PROHIBITED',
          rejectionReason: 'Employee is already checked in for this shift. Duplicate check-in without check-out is prohibited.',
        };
      }
      if (eventType === 'break_start') {
        return { valid: true, nextState: 'on_break' };
      }
      if (eventType === 'check_out') {
        return { valid: true, nextState: 'checked_out' };
      }
      return {
        valid: false,
        nextState: currentState,
        rejectionCode: 'INVALID_SEQUENCE_FROM_CHECKED_IN',
        rejectionReason: `Cannot record '${eventType}' while in 'checked_in' state.`,
      };

    case 'on_break':
      if (eventType === 'break_end') {
        return { valid: true, nextState: 'checked_in' };
      }
      if (eventType === 'check_out') {
        return { valid: true, nextState: 'checked_out' };
      }
      return {
        valid: false,
        nextState: currentState,
        rejectionCode: 'INVALID_SEQUENCE_WHILE_ON_BREAK',
        rejectionReason: `Employee is currently on break. Please record 'break_end' before '${eventType}'.`,
      };

    case 'checked_out':
      return {
        valid: false,
        nextState: currentState,
        rejectionCode: 'SHIFT_ALREADY_COMPLETED',
        rejectionReason: 'Employee has already checked out for this shift.',
      };

    default:
      return {
        valid: false,
        nextState: currentState,
        rejectionCode: 'UNKNOWN_ATTENDANCE_STATE',
        rejectionReason: `Unknown current state: ${currentState}`,
      };
  }
}

/**
 * Calculates shift compliance metrics (late arrival minutes, early departure minutes, overtime minutes)
 * for both regular day shifts and overnight cross-midnight shifts.
 *
 * @param {Object} params
 * @param {Object} params.shift - Shift configuration
 * @param {string|Date} params.checkInTimestamp - First check-in timestamp
 * @param {string|Date|null} [params.checkOutTimestamp] - Check-out timestamp
 * @param {number} [params.breakMinutes] - Total break duration in minutes
 * @param {boolean} [params.isHolidayOrRestDay] - Whether the date is an official holiday or rest day
 * @returns {{ lateMinutes: number, earlyDepartureMinutes: number, totalWorkMinutes: number, overtimeMinutes: number, status: string }}
 */
function calculateShiftMetrics({
  shift,
  checkInTimestamp,
  checkOutTimestamp = null,
  breakMinutes = 0,
  isHolidayOrRestDay = false,
}) {
  if (!checkInTimestamp) {
    return {
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      totalWorkMinutes: 0,
      overtimeMinutes: 0,
      status: isHolidayOrRestDay ? 'holiday' : 'absent',
    };
  }

  const tz = (shift && shift.timezone) || 'Africa/Cairo';
  const startMins = shift ? parseTimeToMinutes(shift.start_time) : 9 * 60;
  const endMins = shift ? parseTimeToMinutes(shift.end_time) : 17 * 60;
  const graceMins = shift ? Number(shift.grace_period_minutes ?? 15) : 15;
  const earlyGraceMins = shift ? Number(shift.early_departure_grace_minutes ?? 10) : 10;
  const minOvertimeMins = shift ? Number(shift.min_overtime_minutes ?? 30) : 30;
  const isOvernight = Boolean(shift && (shift.is_overnight || endMins <= startMins));

  const checkInZoned = getZonedDateParts(checkInTimestamp, tz);
  let checkInRelativeMins = checkInZoned.minutesOfDay;
  if (isOvernight && checkInRelativeMins <= endMins + 240) {
    // Checked in after midnight on an overnight shift
    checkInRelativeMins += 1440;
  }

  // Late arrival calculation
  const rawLate = checkInRelativeMins - startMins;
  const lateMinutes = !isHolidayOrRestDay && rawLate > graceMins ? rawLate : 0;

  // Scheduled shift duration
  const scheduledShiftDuration = isOvernight
    ? 1440 - startMins + endMins
    : endMins - startMins;

  let totalWorkMinutes = 0;
  let earlyDepartureMinutes = 0;
  let overtimeMinutes = 0;

  if (checkOutTimestamp) {
    const inMs = new Date(checkInTimestamp).getTime();
    const outMs = new Date(checkOutTimestamp).getTime();
    const grossMinutes = Math.max(0, Math.round((outMs - inMs) / 60000));
    totalWorkMinutes = Math.max(0, grossMinutes - Math.max(0, breakMinutes));

    if (isHolidayOrRestDay) {
      overtimeMinutes = totalWorkMinutes >= minOvertimeMins ? totalWorkMinutes : 0;
    } else {
      const checkOutZoned = getZonedDateParts(checkOutTimestamp, tz);
      let checkOutRelativeMins = checkOutZoned.minutesOfDay;
      const targetEndMins = isOvernight ? endMins + 1440 : endMins;
      if (isOvernight && checkOutRelativeMins <= endMins + 360) {
        checkOutRelativeMins += 1440;
      }

      const rawEarly = targetEndMins - checkOutRelativeMins;
      if (rawEarly > earlyGraceMins) {
        earlyDepartureMinutes = rawEarly;
      }

      const extraWorked = totalWorkMinutes - scheduledShiftDuration;
      if (extraWorked >= minOvertimeMins) {
        overtimeMinutes = extraWorked;
      }
    }
  }

  let status = 'present';
  if (isHolidayOrRestDay) {
    status = 'holiday';
  } else if (lateMinutes > 0) {
    status = 'late';
  }

  return {
    lateMinutes,
    earlyDepartureMinutes,
    totalWorkMinutes,
    overtimeMinutes,
    status,
  };
}

/**
 * Evaluates an offline pending attendance event when synchronized to the server.
 *
 * @param {Object} params
 * @param {string|number} params.deviceTimestamp - Timestamp when event was captured offline
 * @param {string|number} params.serverTimestamp - Current server timestamp upon receipt
 * @param {number} [params.maxOfflineAgeHours=24] - Maximum allowed age in hours before expiration
 * @param {boolean} [params.allowOfflineAttendance=true] - Whether company allows offline pending attendance
 * @returns {{ valid: boolean, status: string, rejectionCode?: string, rejectionReason?: string, flags: string[] }}
 */
function evaluateOfflineSubmission({
  deviceTimestamp,
  serverTimestamp,
  maxOfflineAgeHours = 24,
  allowOfflineAttendance = true,
}) {
  const flags = ['OFFLINE_SYNCHRONIZED_EVENT'];
  if (!allowOfflineAttendance) {
    return {
      valid: false,
      status: 'rejected',
      rejectionCode: 'OFFLINE_ATTENDANCE_DISABLED',
      rejectionReason: 'Offline attendance submission is disabled by your company policy.',
      flags,
    };
  }

  const devMs = new Date(deviceTimestamp).getTime();
  const srvMs = new Date(serverTimestamp).getTime();
  if (Number.isNaN(devMs) || Number.isNaN(srvMs)) {
    return {
      valid: false,
      status: 'rejected',
      rejectionCode: 'INVALID_OFFLINE_TIMESTAMP',
      rejectionReason: 'Offline event has an invalid device timestamp.',
      flags,
    };
  }

  // Device timestamp cannot be in the future relative to server timestamp (> 2 min tolerance)
  if (devMs - srvMs > 120000) {
    return {
      valid: false,
      status: 'rejected',
      rejectionCode: 'OFFLINE_TIMESTAMP_IN_FUTURE',
      rejectionReason: 'Offline event timestamp is ahead of server time (possible clock tampering).',
      flags: [...flags, 'CLOCK_TAMPERING_SUSPECTED'],
    };
  }

  const ageHours = (srvMs - devMs) / 3600000.0;
  if (ageHours > maxOfflineAgeHours) {
    return {
      valid: false,
      status: 'rejected',
      rejectionCode: 'OFFLINE_EVENT_EXPIRED',
      rejectionReason: `Offline attendance event expired (${ageHours.toFixed(1)}h old; maximum permitted offline retention is ${maxOfflineAgeHours}h).`,
      flags: [...flags, 'OFFLINE_WINDOW_EXPIRED'],
    };
  }

  // Offline events > 4 hours old are accepted into needs_review so HR can confirm
  if (ageHours > 4) {
    flags.push('DELAYED_OFFLINE_SYNC_OVER_4H');
    return {
      valid: true,
      status: 'needs_review',
      flags,
    };
  }

  return {
    valid: true,
    status: 'needs_review', // All offline events require or highlight review since live server challenge wasn't present at capture time
    flags,
  };
}

module.exports = {
  parseTimeToMinutes,
  getZonedDateParts,
  resolveShiftAnchorDate,
  validateAttendanceStateTransition,
  calculateShiftMetrics,
  evaluateOfflineSubmission,
};
