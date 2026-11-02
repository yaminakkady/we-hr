'use strict';

/**
 * We HR — Web Dashboard & Employee Mobile Attendance Client Controller
 */

(function () {
  let state = {
    lang: localStorage.getItem('wehr_lang') || 'ar',
    token: localStorage.getItem('wehr_token') || null,
    user: null,
    company: null,
    employee: null,
    referenceData: { branches: [], departments: [], shifts: [], holidays: [] },
    workplaces: [],
    employeesList: [],
    offlineQueue: JSON.parse(localStorage.getItem('wehr_offline_queue') || '[]'),
  };

  function t(key) {
    const dict = window.WE_HR_I18N[state.lang] || window.WE_HR_I18N.ar;
    return dict[key] || key;
  }

  function showAlert(message, type = 'success') {
    const box = document.getElementById('global-alert');
    box.className = `alert alert-${type}`;
    box.textContent = message;
    box.classList.remove('hidden');
    setTimeout(() => box.classList.add('hidden'), 6500);
  }

  async function apiFetch(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }
    const resp = await fetch(path, { ...options, headers });
    const data = await resp.json().catch(() => ({}));
    return { status: resp.status, ok: resp.ok, data };
  }

  function applyLocalization() {
    const dict = window.WE_HR_I18N[state.lang];
    document.documentElement.lang = state.lang;
    document.documentElement.dir = dict.dir;

    document.getElementById('ui-app-title').textContent = t('appTitle');
    document.getElementById('ui-app-tagline').textContent = t('tagline');
    document.getElementById('btn-lang-toggle').textContent = t('langSwitch');
    document.getElementById('btn-logout').textContent = t('logoutBtn');

    document.getElementById('ui-login-title').textContent = t('loginTitle');
    document.getElementById('ui-login-subtitle').textContent = t('loginSubtitle');
    document.getElementById('ui-email-label').textContent = t('emailLabel');
    document.getElementById('ui-password-label').textContent = t('passwordLabel');
    document.getElementById('ui-signin-btn').textContent = t('signInBtn');
    document.getElementById('ui-quick-demo-label').textContent = t('quickDemoLabel');

    document.getElementById('tab-btn-overview').textContent = t('navOverview');
    document.getElementById('tab-btn-mobile').textContent = t('navMobileApp');
    document.getElementById('tab-btn-attendance').textContent = t('navAttendance');
    document.getElementById('tab-btn-employees').textContent = t('navEmployees');
    document.getElementById('tab-btn-workplaces').textContent = t('navWorkplaces');
    document.getElementById('tab-btn-leaves').textContent = t('navLeaves');
    document.getElementById('tab-btn-devices').textContent = t('navDevices');
    document.getElementById('tab-btn-subscription').textContent = t('navSubscription');

    document.getElementById('ui-recent-events-title').textContent = t('recentEventsTitle');
    document.getElementById('th-emp').textContent = t('colEmployee');
    document.getElementById('th-evt').textContent = t('colEventType');
    document.getElementById('th-time').textContent = t('colServerTime');
    document.getElementById('th-wp').textContent = t('colWorkplace');
    document.getElementById('th-dist').textContent = t('colDistance');
    document.getElementById('th-bio').textContent = t('colBiometric');
    document.getElementById('th-status').textContent = t('colStatus');
    document.getElementById('th-actions').textContent = t('colActions');

    document.getElementById('ui-mobile-header').textContent = t('mobileHeader');
    document.getElementById('ui-step1-location').textContent = t('step1Location');
    document.getElementById('ui-step2-biometric').textContent = t('step2Biometric');
    document.getElementById('ui-step3-submit').textContent = t('step3Submit');
    document.getElementById('ui-scenario-label').textContent = t('scenarioLabel');
    document.getElementById('opt-scen-inside').textContent = t('scenInsideHq');
    document.getElementById('opt-scen-outside').textContent = t('scenOutside');
    document.getElementById('opt-scen-poor').textContent = t('scenPoorAcc');
    document.getElementById('opt-scen-stale').textContent = t('scenStale');
    document.getElementById('opt-scen-mock').textContent = t('scenMock');

    document.getElementById('ui-biomode-label').textContent = t('bioModeLabel');
    document.getElementById('opt-bio-strong').textContent = t('bioStrong');
    document.getElementById('opt-bio-pin').textContent = t('bioPinOnly');
    document.getElementById('opt-bio-exc').textContent = t('bioExceptionMode');
    document.getElementById('opt-bio-cancel').textContent = t('bioCanceled');
    document.getElementById('opt-bio-shared').textContent = t('bioSharedDevice');

    document.getElementById('ui-netmode-label').textContent = t('networkModeLabel');
    document.getElementById('opt-net-online').textContent = t('netOnline');
    document.getElementById('opt-net-offline').textContent = t('netOffline');

    document.getElementById('btn-mob-checkin').textContent = t('btnCheckIn');
    document.getElementById('btn-mob-checkout').textContent = t('btnCheckOut');
    document.getElementById('btn-mob-breakstart').textContent = t('btnBreakStart');
    document.getElementById('btn-mob-breakend').textContent = t('btnBreakEnd');
    document.getElementById('btn-mob-sync-offline').textContent = t('btnSyncOffline');

    document.getElementById('btn-export-csv').textContent = t('exportCsvBtn');
    document.getElementById('ui-manual-corr-title').textContent = t('manualCorrectionTitle');
    document.getElementById('ui-add-emp-title').textContent = t('addEmployeeTitle');
    document.getElementById('ui-import-csv-title').textContent = t('importCsvTitle');
    document.getElementById('ui-add-wp-title').textContent = t('addWorkplaceTitle');
  }

  async function loadDemoAccounts() {
    const { ok, data } = await apiFetch('/api/auth/demo-accounts');
    if (!ok || !data.accounts) return;
    const container = document.getElementById('demo-accounts-list');
    container.innerHTML = '';
    for (const acc of data.accounts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'demo-chip';
      const compName = state.lang === 'ar' ? acc.company_name_ar || 'منصة We HR العامة' : acc.company_name_en || 'Platform Super Admin';
      const empName = state.lang === 'ar' ? acc.full_name_ar || acc.email : acc.full_name_en || acc.email;
      btn.innerHTML = `
        <div style="font-weight:700;font-size:0.84rem;color:var(--primary);">${empName} (${acc.role})</div>
        <div style="font-size:0.76rem;color:var(--text-muted);">${compName} — <code>${acc.email}</code></div>
      `;
      btn.addEventListener('click', () => {
        document.getElementById('login-email').value = acc.email;
        document.getElementById('login-password').value = 'WeHR@2026';
        document.getElementById('form-login').requestSubmit();
      });
      container.appendChild(btn);
    }
  }

  function renderBiometricBadge(evt) {
    if (evt.biometric_verified) {
      return `<span class="badge badge-success">${t('bio_verified')}</span>`;
    }
    if (evt.auth_method === 'device_credential') {
      return `<span class="badge badge-danger">${t('bio_pin')}</span>`;
    }
    if (evt.auth_method === 'exception_fallback') {
      return `<span class="badge badge-warn">${t('bio_exception')}</span>`;
    }
    if (evt.auth_method === 'manager_manual') {
      return `<span class="badge badge-info">${t('bio_manual')}</span>`;
    }
    return `<span class="badge badge-danger">${t('bio_none')}</span>`;
  }

  function renderSyncStatusBadge(status) {
    const map = {
      accepted: 'badge-success',
      needs_review: 'badge-warn',
      pending: 'badge-info',
      rejected: 'badge-danger',
    };
    return `<span class="badge ${map[status] || 'badge-info'}">${t('status_' + status)}</span>`;
  }

  async function loadOverview() {
    if (state.user.role === 'platform_super_admin') {
      switchTab('subscription');
      return;
    }
    const { ok, data } = await apiFetch('/api/dashboard/overview');
    if (!ok) return;

    const m = data.metrics;
    const kpiContainer = document.getElementById('overview-kpis');
    kpiContainer.innerHTML = `
      <div class="kpi-card"><div class="kpi-label">${t('kpiTotalEmployees')}</div><div class="kpi-value">${m.totalEmployees}</div></div>
      <div class="kpi-card"><div class="kpi-label">${t('kpiPresent')}</div><div class="kpi-value" style="color:#166534;">${m.presentCount}</div></div>
      <div class="kpi-card"><div class="kpi-label">${t('kpiAbsent')}</div><div class="kpi-value" style="color:#991b1b;">${m.absentCount}</div></div>
      <div class="kpi-card"><div class="kpi-label">${t('kpiLate')}</div><div class="kpi-value" style="color:#854d0e;">${m.lateCount}</div></div>
      <div class="kpi-card"><div class="kpi-label">${t('kpiExceptions')}</div><div class="kpi-value" style="color:#b45309;">${m.pendingExceptions}</div></div>
      <div class="kpi-card"><div class="kpi-label">${t('kpiSuspicious')}</div><div class="kpi-value" style="color:#dc2626;">${m.suspiciousOrRejected}</div></div>
      <div class="kpi-card"><div class="kpi-label">${t('kpiPendingLeaves')}</div><div class="kpi-value">${m.pendingLeaves}</div></div>
    `;

    const tbody = document.getElementById('tbody-recent-events');
    tbody.innerHTML = '';
    for (const evt of data.recentEvents || []) {
      const tr = document.createElement('tr');
      const empName = state.lang === 'ar' ? evt.full_name_ar : evt.full_name_en;
      const wpName = state.lang === 'ar' ? evt.workplace_name_ar || '-' : evt.workplace_name_en || '-';
      const distText =
        typeof evt.calculated_distance_meters === 'number'
          ? `${evt.calculated_distance_meters}m / ${evt.permitted_radius_meters || 150}m`
          : '-';

      let flagsList = [];
      try {
        flagsList = JSON.parse(evt.flags_json || '[]');
      } catch {
        flagsList = [];
      }

      const canReview =
        ['company_owner', 'hr_admin', 'branch_manager'].includes(state.user.role) &&
        ['needs_review', 'pending'].includes(evt.sync_status);

      tr.innerHTML = `
        <td><strong>${empName}</strong><br/><small>${evt.employee_code}</small></td>
        <td>${t('evt_' + evt.event_type)}</td>
        <td><small>${new Date(evt.server_timestamp).toLocaleString(state.lang === 'ar' ? 'ar-EG' : 'en-GB')}</small></td>
        <td>${wpName}</td>
        <td>${distText} ${evt.geofence_passed ? '✅' : '❌'}</td>
        <td>${renderBiometricBadge(evt)}</td>
        <td>
          ${renderSyncStatusBadge(evt.sync_status)}
          ${evt.rejection_reason ? `<div style="font-size:0.74rem;color:#991b1b;margin-top:0.2rem;">${evt.rejection_reason}</div>` : ''}
          ${flagsList.length ? `<div style="font-size:0.72rem;color:#854d0e;">⚠️ ${flagsList.join(', ')}</div>` : ''}
        </td>
        <td>
          ${
            canReview
              ? `<button class="btn btn-primary btn-sm" data-review-id="${evt.id}" data-decision="approve">${t('approveBtn')}</button>
                 <button class="btn btn-danger btn-sm" data-review-id="${evt.id}" data-decision="reject">${t('rejectBtn')}</button>`
              : '-'
          }
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('[data-review-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const eventId = btn.getAttribute('data-review-id');
        const decision = btn.getAttribute('data-decision');
        const res = await apiFetch('/api/attendance/review', {
          method: 'POST',
          body: JSON.stringify({ eventId, decision, notes: `Reviewed via HR Dashboard (${decision})` }),
        });
        if (res.ok) {
          showAlert('Attendance event review saved.', 'success');
          loadOverview();
        } else {
          showAlert(res.data.message || 'Review failed', 'danger');
        }
      });
    });
  }

  async function loadMobileAttendanceContext() {
    const { ok, data } = await apiFetch('/api/employee/context');
    const summaryEl = document.getElementById('mobile-context-summary');
    const wpSelect = document.getElementById('mobile-workplace-select');

    if (!ok) {
      summaryEl.innerHTML = `<div class="alert alert-warn">${data.message || 'No employee profile bound to this account.'}</div>`;
      return;
    }

    state.employee = data.employee;
    state.workplaces = data.authorizedWorkplaces || [];

    const empName = state.lang === 'ar' ? data.employee.full_name_ar : data.employee.full_name_en;
    document.getElementById('mobile-emp-badge').textContent = `${empName} (${data.employee.employee_code})`;

    const shiftName = data.shift
      ? state.lang === 'ar'
        ? `${data.shift.name_ar} (${data.shift.start_time} - ${data.shift.end_time})`
        : `${data.shift.name_en} (${data.shift.start_time} - ${data.shift.end_time})`
      : '-';

    summaryEl.innerHTML = `
      <div><strong>Shift / الوردية:</strong> ${shiftName} | <strong>Current State / الحالة الحالية:</strong> <span class="badge badge-info">${data.todayRecord.current_state}</span></div>
      <div style="margin-top:0.25rem;"><strong>Biometric Policy:</strong> ${
        data.employee.allow_biometric_exception
          ? `<span class="badge badge-warn">HR Exception Enabled (${data.employee.biometric_exception_reason || ''})</span>`
          : `<span class="badge badge-success">Strict OS Biometric Required</span>`
      }</div>
    `;

    wpSelect.innerHTML = '';
    for (const wp of state.workplaces) {
      const opt = document.createElement('option');
      opt.value = wp.id;
      opt.textContent = `${ state.lang === 'ar' ? wp.name_ar : wp.name_en } (Radius: ${wp.radius_meters}m)`;
      wpSelect.appendChild(opt);
    }

    updateMobileGpsPreview();
    renderOfflineQueue();
  }

  function computeSimulatedCoordinates() {
    const wpId = document.getElementById('mobile-workplace-select').value;
    const wp = state.workplaces.find((w) => w.id === wpId) || state.workplaces[0] || {
      id: 'wp_cairo_hq',
      latitude: 29.9697,
      longitude: 31.2761,
      radius_meters: 150,
    };

    const scenario = document.getElementById('mobile-loc-scenario').value;
    const nowMs = Date.now();

    if (scenario === 'inside') {
      return {
        workplaceId: wp.id,
        latitude: Number((wp.latitude + 0.0001).toFixed(6)),
        longitude: Number((wp.longitude + 0.00008).toFixed(6)),
        accuracyMeters: 12.4,
        locationTimestamp: new Date(nowMs - 3000).toISOString(),
        isMockLocation: false,
      };
    }
    if (scenario === 'outside') {
      return {
        workplaceId: wp.id,
        latitude: Number((wp.latitude + 0.0075).toFixed(6)),
        longitude: Number((wp.longitude + 0.0025).toFixed(6)),
        accuracyMeters: 15.0,
        locationTimestamp: new Date(nowMs - 4000).toISOString(),
        isMockLocation: false,
      };
    }
    if (scenario === 'poor_acc') {
      return {
        workplaceId: wp.id,
        latitude: Number((wp.latitude + 0.0001).toFixed(6)),
        longitude: Number((wp.longitude + 0.0001).toFixed(6)),
        accuracyMeters: 125.0,
        locationTimestamp: new Date(nowMs - 4000).toISOString(),
        isMockLocation: false,
      };
    }
    if (scenario === 'stale') {
      return {
        workplaceId: wp.id,
        latitude: Number((wp.latitude + 0.0001).toFixed(6)),
        longitude: Number((wp.longitude + 0.0001).toFixed(6)),
        accuracyMeters: 14.0,
        locationTimestamp: new Date(nowMs - 360000).toISOString(), // 6 minutes old
        isMockLocation: false,
      };
    }
    // mock location
    return {
      workplaceId: wp.id,
      latitude: wp.latitude,
      longitude: wp.longitude,
      accuracyMeters: 5.0,
      locationTimestamp: new Date(nowMs - 2000).toISOString(),
      isMockLocation: true,
    };
  }

  function updateMobileGpsPreview() {
    const loc = computeSimulatedCoordinates();
    const preview = document.getElementById('mobile-gps-preview');
    if (!preview) return;
    preview.innerHTML = `
      <code>lat: ${loc.latitude}, lng: ${loc.longitude}</code> |
      <code>accuracy: ${loc.accuracyMeters}m</code> |
      <code>timestamp: ${loc.locationTimestamp}</code> |
      <code>isMockLocation: ${loc.isMockLocation}</code>
    `;
  }

  function buildAuthPayload() {
    const bioMode = document.getElementById('mobile-bio-mode').value;
    const empCode = state.employee ? state.employee.employee_code : 'EMP';
    const defaultDevId =
      empCode === 'ND-101'
        ? 'ANDROID-SM-A546E-AHMED01'
        : empCode === 'ND-103'
        ? 'IOS-IPHONE13-SARA01'
        : `ANDROID-DEVICE-${empCode}`;

    if (bioMode === 'biometric_strong') {
      return {
        osAuthenticated: true,
        authMethod: 'biometric_strong',
        deviceSupportsBiometrics: true,
        biometricEnrolled: true,
        deviceIdentifier: defaultDevId,
        devicePlatform: 'android',
      };
    }
    if (bioMode === 'device_credential') {
      return {
        osAuthenticated: true,
        authMethod: 'device_credential',
        deviceSupportsBiometrics: true,
        biometricEnrolled: true,
        deviceIdentifier: defaultDevId,
        devicePlatform: 'android',
      };
    }
    if (bioMode === 'exception_fallback') {
      return {
        osAuthenticated: true,
        authMethod: 'exception_fallback',
        deviceSupportsBiometrics: false,
        biometricEnrolled: false,
        deviceIdentifier: defaultDevId,
        devicePlatform: 'ios',
      };
    }
    if (bioMode === 'user_canceled') {
      return {
        osAuthenticated: false,
        authMethod: 'none',
        errorCode: 'USER_CANCELED',
        deviceSupportsBiometrics: true,
        biometricEnrolled: true,
        deviceIdentifier: defaultDevId,
        devicePlatform: 'android',
      };
    }
    // shared_device (using Mahmoud's registered device while logged in as someone else)
    return {
      osAuthenticated: true,
      authMethod: 'biometric_strong',
      deviceSupportsBiometrics: true,
      biometricEnrolled: true,
      deviceIdentifier: 'ANDROID-REDMI-NOTE13-MAH01',
      devicePlatform: 'android',
    };
  }

  function renderOfflineQueue() {
    const box = document.getElementById('offline-queue-box');
    if (!state.offlineQueue.length) {
      box.innerHTML = `<span style="color:var(--text-muted);">Offline Pending Queue: 0 events</span>`;
      return;
    }
    box.innerHTML = `
      <div class="alert alert-warn" style="margin-bottom:0;">
        ⏳ <strong>Pending Offline Attendance Events (${state.offlineQueue.length}):</strong>
        Not yet accepted by server. Click "${t('btnSyncOffline')}" when back online.
      </div>
    `;
  }

  async function submitMobileAttendance(eventType) {
    const loc = computeSimulatedCoordinates();
    const auth = buildAuthPayload();
    const netMode = document.getElementById('mobile-net-mode').value;
    const nowIso = new Date().toISOString();
    const payload = {
      eventType,
      idempotencyKey: `mob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      workplaceId: loc.workplaceId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracyMeters: loc.accuracyMeters,
      locationTimestamp: loc.locationTimestamp,
      deviceTimestamp: nowIso,
      isMockLocation: loc.isMockLocation,
      isOfflineSubmission: netMode === 'offline',
      auth,
    };

    const resultBox = document.getElementById('mobile-tx-result');

    if (netMode === 'offline') {
      state.offlineQueue.push(payload);
      localStorage.setItem('wehr_offline_queue', JSON.stringify(state.offlineQueue));
      renderOfflineQueue();
      resultBox.innerHTML = `
        <div class="alert alert-warn">
          <strong>[PENDING OFFLINE SYNC]</strong> Event stored locally with device timestamp <code>${nowIso}</code>.
          <em>Important:</em> Offline events are NOT marked accepted until synchronized and validated by the We HR server.
        </div>
      `;
      return;
    }

    const { ok, data } = await apiFetch('/api/attendance/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (ok) {
      const v = data.verificationSummary || {};
      resultBox.innerHTML = `
        <div class="alert alert-success">
          ✅ <strong>${data.code}:</strong> ${data.message}<br/>
          <small>Server Timestamp: <code>${v.serverTimestamp}</code> | Distance: <code>${v.distanceMeters}m / ${v.permittedRadiusMeters}m</code> | Biometric Verified: <code>${v.biometricVerified}</code> | Status: <code>${v.syncStatus}</code></small>
        </div>
      `;
      loadMobileAttendanceContext();
    } else {
      resultBox.innerHTML = `
        <div class="alert alert-danger">
          ❌ <strong>Rejected (${data.code}):</strong> ${data.message}
        </div>
      `;
    }
  }

  async function syncOfflineQueue() {
    if (!state.offlineQueue.length) {
      showAlert('No pending offline events to synchronize.', 'warn');
      return;
    }
    let acceptedCount = 0;
    let rejectedCount = 0;
    const remaining = [];

    for (const item of state.offlineQueue) {
      const { ok } = await apiFetch('/api/attendance/events', {
        method: 'POST',
        body: JSON.stringify({ ...item, isOfflineSubmission: true }),
      });
      if (ok) {
        acceptedCount++;
      } else {
        rejectedCount++;
      }
    }

    state.offlineQueue = remaining;
    localStorage.setItem('wehr_offline_queue', JSON.stringify(state.offlineQueue));
    renderOfflineQueue();
    loadMobileAttendanceContext();
    showAlert(
      `Offline Synchronization Complete: ${acceptedCount} accepted for review, ${rejectedCount} rejected.`,
      acceptedCount > 0 ? 'success' : 'warn'
    );
  }

  async function loadAttendanceTab() {
    const dateVal = document.getElementById('filter-att-date').value;
    const query = dateVal ? `?date=${encodeURIComponent(dateVal)}` : '';
    const { ok, data } = await apiFetch(`/api/attendance/register${query}`);
    if (!ok) return;

    const tbody = document.getElementById('tbody-attendance-register');
    tbody.innerHTML = '';
    for (const r of data.records || []) {
      const tr = document.createElement('tr');
      const empName = state.lang === 'ar' ? r.full_name_ar : r.full_name_en;
      tr.innerHTML = `
        <td>${r.attendance_date}</td>
        <td><strong>${empName}</strong> (${r.employee_code})</td>
        <td>${state.lang === 'ar' ? r.branch_name_ar || '-' : r.branch_name_en || '-'}</td>
        <td><small>${r.first_check_in_at ? new Date(r.first_check_in_at).toLocaleTimeString() : '-'}</small></td>
        <td><small>${r.last_check_out_at ? new Date(r.last_check_out_at).toLocaleTimeString() : '-'}</small></td>
        <td><code>${r.current_state}</code></td>
        <td>${r.late_minutes}</td>
        <td>${r.overtime_minutes}</td>
        <td><span class="badge ${r.status === 'present' ? 'badge-success' : r.status === 'late' ? 'badge-warn' : 'badge-danger'}">${r.status}</span></td>
        <td><small>${r.exception_notes || '-'}</small></td>
      `;
      tbody.appendChild(tr);
    }

    const corrRes = await apiFetch('/api/attendance/corrections');
    const corrTbody = document.getElementById('tbody-corrections');
    corrTbody.innerHTML = '';
    if (corrRes.ok && corrRes.data.corrections) {
      for (const c of corrRes.data.corrections) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><small>${new Date(c.created_at).toLocaleDateString()}</small></td>
          <td>${state.lang === 'ar' ? c.full_name_ar : c.full_name_en} (${c.employee_code})</td>
          <td><code>${c.correction_type}</code></td>
          <td><small><code>${c.original_value_json}</code></small></td>
          <td><small><code>${c.corrected_value_json}</code></small></td>
          <td>${c.reason}</td>
          <td><small>${c.approver_email || '-'}</small></td>
        `;
        corrTbody.appendChild(tr);
      }
    }
  }

  async function loadEmployeesTab() {
    const [empRes, refRes, wpRes] = await Promise.all([
      apiFetch('/api/employees'),
      apiFetch('/api/reference-data'),
      apiFetch('/api/workplaces'),
    ]);
    if (refRes.ok) {
      state.referenceData = refRes.data;
      const brSel = document.getElementById('emp-branch');
      const shSel = document.getElementById('emp-shift');
      brSel.innerHTML = refRes.data.branches
        .map((b) => `<option value="${b.id}">${state.lang === 'ar' ? b.name_ar : b.name_en}</option>`)
        .join('');
      shSel.innerHTML = refRes.data.shifts
        .map((s) => `<option value="${s.id}">${state.lang === 'ar' ? s.name_ar : s.name_en}</option>`)
        .join('');
    }
    if (wpRes.ok) {
      const wpSel = document.getElementById('emp-workplace');
      wpSel.innerHTML = wpRes.data.workplaces
        .map((w) => `<option value="${w.id}">${state.lang === 'ar' ? w.name_ar : w.name_en}</option>`)
        .join('');
    }
    if (!empRes.ok) return;
    state.employeesList = empRes.data.employees || [];

    // Populate manual correction employee dropdown as well
    const corrEmpSel = document.getElementById('corr-employee-id');
    if (corrEmpSel) {
      corrEmpSel.innerHTML = state.employeesList
        .map((e) => `<option value="${e.id}">${e.employee_code} — ${state.lang === 'ar' ? e.full_name_ar : e.full_name_en}</option>`)
        .join('');
    }

    const tbody = document.getElementById('tbody-employees');
    tbody.innerHTML = '';
    for (const e of state.employeesList) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${e.employee_code}</strong></td>
        <td>${e.full_name_ar}<br/><small>${e.full_name_en} (${e.email || ''})</small></td>
        <td>${state.lang === 'ar' ? e.job_title_ar : e.job_title_en}</td>
        <td>${state.lang === 'ar' ? e.branch_name_ar || '-' : e.branch_name_en || '-'}</td>
        <td>${state.lang === 'ar' ? e.workplace_name_ar || '-' : e.workplace_name_en || '-'}</td>
        <td>${
          e.allow_biometric_exception
            ? `<span class="badge badge-warn">Exception Allowed</span>`
            : `<span class="badge badge-success">Biometric Strict</span>`
        }</td>
        <td><span class="badge ${e.is_active ? 'badge-success' : 'badge-danger'}">${e.is_active ? 'Active' : 'Inactive'}</span></td>
        <td>
          <button class="btn btn-secondary btn-sm" data-toggle-emp="${e.id}" data-active="${e.is_active ? '0' : '1'}">
            ${e.is_active ? t('deactivateBtn') : t('activateBtn')}
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('[data-toggle-emp]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const employeeId = btn.getAttribute('data-toggle-emp');
        const isActive = btn.getAttribute('data-active') === '1';
        const res = await apiFetch('/api/employees/status', {
          method: 'POST',
          body: JSON.stringify({ employeeId, isActive }),
        });
        if (res.ok) {
          showAlert('Employee status updated & active sessions refreshed.', 'success');
          loadEmployeesTab();
        } else {
          showAlert(res.data.message || 'Failed to update employee', 'danger');
        }
      });
    });
  }

  async function loadWorkplacesTab() {
    const { ok, data } = await apiFetch('/api/workplaces');
    if (!ok) return;
    const tbody = document.getElementById('tbody-workplaces');
    tbody.innerHTML = '';
    for (const w of data.workplaces || []) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code>${w.code}</code></td>
        <td><strong>${w.name_ar}</strong><br/><small>${w.name_en}</small></td>
        <td>${w.workplace_type}</td>
        <td><code>${w.latitude}, ${w.longitude}</code></td>
        <td><strong>${w.radius_meters}m</strong></td>
        <td>${w.max_accuracy_meters}m</td>
        <td>${w.require_biometric ? '✅ Yes' : 'No'}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  async function loadLeavesTab() {
    const { ok, data } = await apiFetch('/api/leaves');
    if (!ok) return;
    const tbody = document.getElementById('tbody-leaves');
    tbody.innerHTML = '';
    const canDecide = ['company_owner', 'hr_admin', 'branch_manager', 'supervisor'].includes(state.user.role);

    for (const lv of data.leaveRequests || []) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${state.lang === 'ar' ? lv.full_name_ar : lv.full_name_en}</strong> (${lv.employee_code})</td>
        <td>${lv.leave_type}</td>
        <td>${lv.start_date}</td>
        <td>${lv.end_date}</td>
        <td>${lv.days_count}</td>
        <td>${lv.reason || '-'}</td>
        <td><span class="badge ${lv.status === 'approved' ? 'badge-success' : lv.status === 'rejected' ? 'badge-danger' : 'badge-warn'}">${lv.status}</span></td>
        <td>
          ${
            canDecide && lv.status === 'pending'
              ? `<button class="btn btn-primary btn-sm" data-lv-id="${lv.id}" data-decision="approve">${t('approveBtn')}</button>
                 <button class="btn btn-danger btn-sm" data-lv-id="${lv.id}" data-decision="reject">${t('rejectBtn')}</button>`
              : '-'
          }
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('[data-lv-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const leaveId = btn.getAttribute('data-lv-id');
        const decision = btn.getAttribute('data-decision');
        const res = await apiFetch('/api/leaves/decide', {
          method: 'POST',
          body: JSON.stringify({ leaveId, decision }),
        });
        if (res.ok) {
          showAlert('Leave request updated.', 'success');
          loadLeavesTab();
        } else {
          showAlert(res.data.message || 'Action failed', 'danger');
        }
      });
    });
  }

  async function loadDevicesAndAuditTab() {
    const [devRes, audRes] = await Promise.all([
      apiFetch('/api/devices'),
      apiFetch('/api/audit-logs'),
    ]);

    if (devRes.ok) {
      const tbody = document.getElementById('tbody-devices');
      tbody.innerHTML = '';
      for (const d of devRes.data.devices || []) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${state.lang === 'ar' ? d.full_name_ar : d.full_name_en}</strong> (${d.employee_code})</td>
          <td><code>${d.device_identifier}</code></td>
          <td>${d.device_model} (${d.os_version || d.platform})</td>
          <td>HW: ${d.biometric_hardware_available ? '✅' : '❌'} | Enrolled: ${d.biometric_enrolled ? '✅' : '❌'}</td>
          <td><span class="badge ${d.status === 'approved' ? 'badge-success' : d.status === 'revoked' ? 'badge-danger' : 'badge-warn'}">${d.status}</span></td>
          <td><small>${d.last_used_at ? new Date(d.last_used_at).toLocaleString() : '-'}</small></td>
          <td>
            <button class="btn btn-primary btn-sm" data-dev-id="${d.id}" data-status="approved">Approve</button>
            <button class="btn btn-danger btn-sm" data-dev-id="${d.id}" data-status="revoked">Revoke</button>
          </td>
        `;
        tbody.appendChild(tr);
      }

      tbody.querySelectorAll('[data-dev-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const deviceId = btn.getAttribute('data-dev-id');
          const status = btn.getAttribute('data-status');
          const res = await apiFetch('/api/devices/status', {
            method: 'POST',
            body: JSON.stringify({ deviceId, status }),
          });
          if (res.ok) {
            showAlert(`Device marked as ${status}.`, 'success');
            loadDevicesAndAuditTab();
          } else {
            showAlert(res.data.message || 'Unable to update device', 'danger');
          }
        });
      });
    }

    if (audRes.ok) {
      const tbody = document.getElementById('tbody-audit-logs');
      tbody.innerHTML = '';
      for (const log of audRes.data.auditLogs || []) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><small>${new Date(log.created_at).toLocaleString()}</small></td>
          <td><code>${log.actor_role || '-'}</code></td>
          <td><strong>${log.action}</strong></td>
          <td>${log.target_type} (${log.target_id || '-'})</td>
          <td><small><code>${log.details_json}</code></small></td>
        `;
        tbody.appendChild(tr);
      }
    }
  }

  async function loadSubscriptionTab() {
    const { ok, data } = await apiFetch('/api/subscriptions');
    if (!ok) return;
    const box = document.getElementById('subscription-summary-box');
    const tbody = document.getElementById('tbody-payments');
    tbody.innerHTML = '';

    if (state.user.role === 'platform_super_admin') {
      box.innerHTML = `
        <h4>Platform Tenants Overview (Strict Tenant Isolation Active)</h4>
        <ul>
          ${(data.tenants || [])
            .map(
              (t) =>
                `<li><strong>${t.name_en} (${t.name_ar})</strong> — Plan: ${t.plan_name_en} | Status: <span class="badge badge-success">${t.sub_status}</span> | Expires: ${t.expiry_date}</li>`
            )
            .join('')}
        </ul>
      `;
    } else if (data.subscription) {
      const s = data.subscription;
      box.innerHTML = `
        <div class="form-grid">
          <div><strong>Plan:</strong> ${state.lang === 'ar' ? s.plan_name_ar : s.plan_name_en} (${s.plan_code})</div>
          <div><strong>Status:</strong> <span class="badge badge-success">${s.status}</span></div>
          <div><strong>Expiry Date:</strong> ${new Date(s.expiry_date).toLocaleDateString()} (Grace Period: ${s.grace_period_days} days)</div>
          <div><strong>Limits:</strong> Max ${s.max_employees} Employees | Max ${s.max_workplaces} Workplaces | Max ${s.max_branches} Branches</div>
        </div>
      `;
    }

    for (const p of data.payments || []) {
      const tr = document.createElement('tr');
      const canVerify = state.user.role === 'platform_super_admin' && p.verification_status === 'pending';
      tr.innerHTML = `
        <td><small>${new Date(p.created_at).toLocaleDateString()}</small></td>
        <td><strong>${p.amount} ${p.currency}</strong></td>
        <td><code>${p.payment_method}</code></td>
        <td><code>${p.reference_number}</code></td>
        <td><span class="badge ${p.verification_status === 'verified' ? 'badge-success' : 'badge-warn'}">${p.verification_status}</span></td>
        <td>
          ${
            canVerify
              ? `<button class="btn btn-primary btn-sm" data-verify-pay="${p.id}">Verify & Extend 30d</button>`
              : '-'
          }
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('[data-verify-pay]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const paymentId = btn.getAttribute('data-verify-pay');
        const res = await apiFetch('/api/subscriptions/verify-payment', {
          method: 'POST',
          body: JSON.stringify({ paymentId, decision: 'verify', extendDays: 30 }),
        });
        if (res.ok) {
          showAlert('Payment verified and tenant subscription extended by 30 days.', 'success');
          loadSubscriptionTab();
        }
      });
    });
  }

  function switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });
    document.querySelectorAll('.tab-pane').forEach((pane) => {
      pane.classList.toggle('hidden', pane.id !== `tab-${tabName}`);
    });

    if (tabName === 'overview') loadOverview();
    if (tabName === 'mobile') loadMobileAttendanceContext();
    if (tabName === 'attendance') {
      loadEmployeesTab();
      loadAttendanceTab();
    }
    if (tabName === 'employees') loadEmployeesTab();
    if (tabName === 'workplaces') loadWorkplacesTab();
    if (tabName === 'leaves') loadLeavesTab();
    if (tabName === 'devices') loadDevicesAndAuditTab();
    if (tabName === 'subscription') loadSubscriptionTab();
  }

  function enterAuthenticatedWorkspace(loginData) {
    state.user = loginData.user || loginData.actor;
    state.company = loginData.company || null;
    state.employee = loginData.employee || null;

    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-workspace').classList.remove('hidden');
    document.getElementById('btn-logout').classList.remove('hidden');

    const badge = document.getElementById('ui-user-badge');
    badge.classList.remove('hidden');
    badge.textContent = `${state.user.email} (${state.user.role})`;

    // Default tab based on role
    if (state.user.role === 'employee') {
      switchTab('mobile');
    } else if (state.user.role === 'platform_super_admin') {
      switchTab('subscription');
    } else {
      switchTab('overview');
    }
  }

  // Event Listeners
  document.getElementById('btn-lang-toggle').addEventListener('click', () => {
    state.lang = state.lang === 'ar' ? 'en' : 'ar';
    localStorage.setItem('wehr_lang', state.lang);
    applyLocalization();
    loadDemoAccounts();
    if (state.user) {
      const activeTab = document.querySelector('.nav-tab.active');
      if (activeTab) switchTab(activeTab.getAttribute('data-tab'));
    }
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    state.token = null;
    state.user = null;
    localStorage.removeItem('wehr_token');
    document.getElementById('view-workspace').classList.add('hidden');
    document.getElementById('btn-logout').classList.add('hidden');
    document.getElementById('ui-user-badge').classList.add('hidden');
    document.getElementById('view-login').classList.remove('hidden');
  });

  document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { ok, data } = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!ok) {
      showAlert(data.message || 'Sign in failed', 'danger');
      return;
    }
    // Platform admins manage everything from the separate admin console
    if (data.user.role === 'platform_super_admin') {
      localStorage.setItem('wehr_admin_token', data.token);
      window.location.href = '/admin';
      return;
    }
    state.token = data.token;
    localStorage.setItem('wehr_token', data.token);
    enterAuthenticatedWorkspace(data);
  });

  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
  });

  document.getElementById('btn-refresh-overview').addEventListener('click', loadOverview);

  document.getElementById('mobile-loc-scenario').addEventListener('change', updateMobileGpsPreview);
  document.getElementById('mobile-workplace-select').addEventListener('change', updateMobileGpsPreview);

  ['btn-mob-checkin', 'btn-mob-checkout', 'btn-mob-breakstart', 'btn-mob-breakend'].forEach((id) => {
    document.getElementById(id).addEventListener('click', (e) => {
      submitMobileAttendance(e.currentTarget.getAttribute('data-evt'));
    });
  });

  document.getElementById('btn-mob-sync-offline').addEventListener('click', syncOfflineQueue);

  document.getElementById('filter-att-date').addEventListener('change', loadAttendanceTab);

  document.getElementById('btn-export-csv').addEventListener('click', async () => {
    const dateVal = document.getElementById('filter-att-date').value;
    const query = dateVal ? `?date=${encodeURIComponent(dateVal)}` : '';
    const resp = await fetch(`/api/attendance/export.csv${query}`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    if (!resp.ok) {
      showAlert('Not authorized to export CSV', 'danger');
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `we_hr_attendance_${dateVal || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('form-manual-correction').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      employeeId: document.getElementById('corr-employee-id').value,
      attendanceDate: document.getElementById('corr-date').value,
      correctionType: document.getElementById('corr-type').value,
      statusOverride: document.getElementById('corr-status').value,
      reason: document.getElementById('corr-reason').value,
    };
    const { ok, data } = await apiFetch('/api/attendance/corrections', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (ok) {
      showAlert('Audited manual attendance correction saved without mutating raw event history.', 'success');
      document.getElementById('corr-reason').value = '';
      loadAttendanceTab();
    } else {
      showAlert(data.message || 'Correction failed', 'danger');
    }
  });

  document.getElementById('form-add-employee').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bioPolicy = document.getElementById('emp-bio-policy').value;
    const payload = {
      employeeCode: document.getElementById('emp-code').value,
      email: document.getElementById('emp-email').value,
      fullNameEn: document.getElementById('emp-name-en').value,
      fullNameAr: document.getElementById('emp-name-ar').value,
      jobTitleEn: document.getElementById('emp-title-en').value,
      jobTitleAr: document.getElementById('emp-title-ar').value,
      branchId: document.getElementById('emp-branch').value,
      defaultWorkplaceId: document.getElementById('emp-workplace').value,
      defaultShiftId: document.getElementById('emp-shift').value,
      requireBiometric: bioPolicy === 'strict',
      allowBiometricException: bioPolicy === 'exception',
      biometricExceptionReason: bioPolicy === 'exception' ? 'Approved by HR Admin during onboarding' : null,
    };
    const { ok, data } = await apiFetch('/api/employees', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (ok) {
      showAlert('Employee created successfully.', 'success');
      e.target.reset();
      loadEmployeesTab();
    } else {
      showAlert(data.message || 'Failed to create employee', 'danger');
    }
  });

  document.getElementById('btn-import-csv').addEventListener('click', async () => {
    const csvText = document.getElementById('csv-import-text').value;
    const { ok, data } = await apiFetch('/api/employees/import-csv', {
      method: 'POST',
      body: JSON.stringify({ csvText }),
    });
    if (ok) {
      showAlert(`CSV Import finished: ${data.importedCount} imported, ${data.errorCount} skipped/errors.`, 'success');
      loadEmployeesTab();
    } else {
      showAlert(data.message || 'CSV import failed', 'danger');
    }
  });

  document.getElementById('form-add-workplace').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      code: document.getElementById('wp-code').value,
      nameEn: document.getElementById('wp-name-en').value,
      nameAr: document.getElementById('wp-name-ar').value,
      workplaceType: document.getElementById('wp-type').value,
      latitude: Number(document.getElementById('wp-lat').value),
      longitude: Number(document.getElementById('wp-lng').value),
      radiusMeters: Number(document.getElementById('wp-radius').value),
      maxAccuracyMeters: Number(document.getElementById('wp-accuracy').value),
    };
    const { ok, data } = await apiFetch('/api/workplaces', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (ok) {
      showAlert('Workplace & geofence configuration created.', 'success');
      loadWorkplacesTab();
    } else {
      showAlert(data.message || 'Failed to create workplace', 'danger');
    }
  });

  document.getElementById('form-leave-request').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      leaveType: document.getElementById('lv-type').value,
      startDate: document.getElementById('lv-start').value,
      endDate: document.getElementById('lv-end').value,
      reason: document.getElementById('lv-reason').value,
    };
    const { ok, data } = await apiFetch('/api/leaves', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (ok) {
      showAlert('Leave request submitted.', 'success');
      loadLeavesTab();
    } else {
      showAlert(data.message || 'Failed to submit leave request', 'danger');
    }
  });

  document.getElementById('form-submit-payment').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      amount: Number(document.getElementById('pay-amount').value),
      currency: document.getElementById('pay-currency').value,
      paymentMethod: document.getElementById('pay-method').value,
      referenceNumber: document.getElementById('pay-ref').value,
    };
    const { ok, data } = await apiFetch('/api/subscriptions/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (ok) {
      showAlert('Payment reference submitted for verification.', 'success');
      loadSubscriptionTab();
    } else {
      showAlert(data.message || 'Payment submission failed', 'danger');
    }
  });

  // Initialize UI
  const todayIso = new Date().toISOString().slice(0, 10);
  document.getElementById('corr-date').value = todayIso;
  document.getElementById('lv-start').value = todayIso;
  document.getElementById('lv-end').value = todayIso;

  applyLocalization();
  loadDemoAccounts();

  if (state.token) {
    apiFetch('/api/auth/me').then(({ ok, data }) => {
      if (ok) {
        enterAuthenticatedWorkspace(data);
      } else {
        localStorage.removeItem('wehr_token');
        state.token = null;
      }
    });
  }
})();
