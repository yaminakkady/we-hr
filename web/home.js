/**
 * We HR — unified sign-in and employee attendance screen.
 * The same page runs in browsers and inside the We HR mobile app (see native-bridge.js):
 * in the app, GPS and fingerprint/Face ID come from the phone; in a browser, from web APIs.
 * Platform admins are sent to /admin, HR staff get a shortcut to the HR dashboard (/hr).
 */
(() => {
  'use strict';

  const I18N = {
    ar: {
      tagline: 'الحضور الذكي للموظفين',
      langToggle: 'English',
      signOut: 'تسجيل الخروج',
      loginTitle: 'تسجيل الدخول',
      username: 'البريد الإلكتروني أو اسم المستخدم',
      password: 'كلمة المرور',
      signIn: 'تسجيل الدخول',
      signingIn: 'جارٍ تسجيل الدخول… قد يستغرق دقيقة إذا كان الخادم في وضع السكون',
      loading: 'جارٍ التحميل…',
      locationExplanation: 'يتم قراءة موقعك الجغرافي فقط لحظة تسجيل الحضور للتحقق من وجودك داخل مقر العمل، ولا يتم تتبعك في الخلفية.',
      nearestWorkplace: 'أقرب موقع عمل معتمد',
      distance: 'المسافة الحالية',
      accuracy: 'دقة GPS',
      insideGeofence: 'داخل نطاق موقع العمل المسموح',
      outsideGeofence: 'خارج نطاق موقع العمل المعتمد',
      noWorkplace: 'لا يوجد موقع عمل معتمد لك — تواصل مع الموارد البشرية',
      refreshLocation: 'تحديث قراءة الموقع (GPS)',
      locating: 'جارٍ تحديد موقعك…',
      locationError: 'تعذر قراءة الموقع: ',
      checkIn: 'تسجيل حضور',
      checkOut: 'تسجيل انصراف',
      breakStart: 'بدء استراحة',
      breakEnd: 'إنهاء استراحة',
      biometricReason: 'يرجى تأكيد هويتك بالبصمة لتسجيل حركة الحضور في We HR',
      verifying: 'جارٍ التحقق من الهوية والموقع…',
      bioFailed: 'لم يتم التحقق من الهوية: ',
      webAuthUnavailable: 'هذا المتصفح لا يستطيع التحقق من هويتك (بصمة/Windows Hello). استخدم تطبيق We HR على هاتفك.',
      networkError: 'لا يوجد اتصال بالإنترنت — لم يتم تسجيل الحركة. حاول مرة أخرى.',
      recentActivity: 'آخر الحركات',
      none: 'لا توجد حركات بعد',
      hrDashboard: 'لوحة الموارد البشرية',
      noProfile: 'هذا الحساب ليس له ملف موظف لتسجيل الحضور.',
      state_not_checked_in: 'لم يسجل حضور',
      state_checked_in: 'حاضر',
      state_on_break: 'في استراحة',
      state_checked_out: 'انصرف',
      ev_check_in: 'حضور',
      ev_check_out: 'انصراف',
      ev_break_start: 'بدء استراحة',
      ev_break_end: 'إنهاء استراحة',
      ev_field_visit: 'زيارة ميدانية',
      sync_accepted: 'مقبول',
      sync_needs_review: 'قيد المراجعة',
      sync_rejected: 'مرفوض',
      sync_pending: 'معلق',
      meters: 'م',
      shift: 'الوردية',
    },
    en: {
      tagline: 'Smart employee attendance',
      langToggle: 'العربية',
      signOut: 'Sign out',
      loginTitle: 'Sign in',
      username: 'Email or username',
      password: 'Password',
      signIn: 'Sign in',
      signingIn: 'Signing in… this can take up to a minute if the server is waking up',
      loading: 'Loading…',
      locationExplanation: 'Your location is read only at the moment you record attendance, to confirm you are at your workplace. No background tracking.',
      nearestWorkplace: 'Nearest authorized workplace',
      distance: 'Current distance',
      accuracy: 'GPS accuracy',
      insideGeofence: 'Inside the permitted workplace area',
      outsideGeofence: 'Outside the permitted workplace area',
      noWorkplace: 'No workplace is assigned to you — contact HR',
      refreshLocation: 'Refresh GPS location',
      locating: 'Finding your location…',
      locationError: 'Could not read location: ',
      checkIn: 'Check in',
      checkOut: 'Check out',
      breakStart: 'Start break',
      breakEnd: 'End break',
      biometricReason: 'Confirm it is you with your fingerprint or face to record We HR attendance',
      verifying: 'Verifying identity and location…',
      bioFailed: 'Identity not verified: ',
      webAuthUnavailable: 'This browser cannot verify your identity (fingerprint / Windows Hello). Use the We HR app on your phone.',
      networkError: 'No internet connection — nothing was recorded. Please try again.',
      recentActivity: 'Recent activity',
      none: 'No activity yet',
      hrDashboard: 'HR dashboard',
      noProfile: 'This account has no employee profile for attendance.',
      state_not_checked_in: 'Not checked in',
      state_checked_in: 'Checked in',
      state_on_break: 'On break',
      state_checked_out: 'Checked out',
      ev_check_in: 'Check in',
      ev_check_out: 'Check out',
      ev_break_start: 'Break start',
      ev_break_end: 'Break end',
      ev_field_visit: 'Field visit',
      sync_accepted: 'Accepted',
      sync_needs_review: 'Under review',
      sync_rejected: 'Rejected',
      sync_pending: 'Pending',
      meters: 'm',
      shift: 'Shift',
    },
  };

  // Which buttons make sense in each attendance state (the server enforces the real rules).
  const ALLOWED_EVENTS = {
    not_checked_in: ['check_in'],
    checked_in: ['break_start', 'check_out'],
    on_break: ['break_end', 'check_out'],
    checked_out: [],
  };
  const HR_ROLES = new Set(['company_owner', 'hr_admin', 'branch_manager', 'supervisor']);
  const bridge = window.WeHrBridge;

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function storageSet(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: session lasts for this page only */
    }
  }

  const state = {
    lang: storageGet('wehr_lang') || 'ar',
    token: storageGet('wehr_home_token'),
    user: null,
    context: null,
    position: null,
    busy: false,
  };

  const $ = (id) => document.getElementById(id);
  const t = (key) => (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || key;
  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const localized = (row, base) => (state.lang === 'ar' ? row[`${base}_ar`] || row[`${base}_en`] : row[`${base}_en`] || row[`${base}_ar`]) || '';
  const fmtTime = (iso) =>
    new Date(iso).toLocaleString(state.lang === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  async function api(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const resp = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await resp.json().catch(() => ({}));
    if (resp.status === 401 && state.token && path !== '/api/auth/login') signOut();
    return { ok: resp.ok && data.ok !== false, status: resp.status, data };
  }

  function show(viewId) {
    ['view-login', 'view-employee', 'view-no-profile'].forEach((id) => $(id).classList.toggle('hidden', id !== viewId));
    $('btn-logout').classList.toggle('hidden', viewId === 'view-login');
  }

  function banner(message, kind) {
    const el = $('status-banner');
    el.className = `alert alert-${kind}`;
    el.textContent = message;
  }

  function applyLanguage() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
    $('btn-lang').textContent = t('langToggle');
    if (state.context) renderEmployee();
  }

  // --------------------------------------------------------------------------
  // Session
  // --------------------------------------------------------------------------
  function routeAfterSignIn(user) {
    state.user = user;
    if (user.role === 'platform_super_admin') {
      storageSet('wehr_admin_token', state.token);
      window.location.href = '/admin';
      return;
    }
    if (HR_ROLES.has(user.role)) storageSet('wehr_token', state.token);
    $('link-hr').classList.toggle('hidden', !HR_ROLES.has(user.role));
    loadEmployee();
  }

  function signOut() {
    state.token = null;
    state.user = null;
    state.context = null;
    ['wehr_home_token', 'wehr_token', 'wehr_admin_token'].forEach((k) => storageSet(k, null));
    $('login-pass').value = '';
    show('view-login');
  }

  async function restoreSession() {
    if (!state.token) return show('view-login');
    const res = await api('/api/auth/me').catch(() => null);
    if (!res || !res.ok) return signOut();
    routeAfterSignIn(res.data.actor);
  }

  $('form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const errorBox = $('login-error');
    const button = $('btn-signin');
    errorBox.classList.add('hidden');
    button.disabled = true;
    button.textContent = t('signingIn');
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: { email: $('login-user').value.trim(), password: $('login-pass').value },
      });
      if (!res.ok) {
        errorBox.textContent = res.data.message || `HTTP ${res.status}`;
        errorBox.classList.remove('hidden');
        return;
      }
      state.token = res.data.token;
      storageSet('wehr_home_token', state.token);
      routeAfterSignIn(res.data.user);
    } catch {
      errorBox.textContent = t('networkError');
      errorBox.classList.remove('hidden');
    } finally {
      button.disabled = false;
      button.textContent = t('signIn');
    }
  });

  // --------------------------------------------------------------------------
  // Employee attendance
  // --------------------------------------------------------------------------
  async function loadEmployee() {
    const res = await api('/api/employee/context');
    if (!res.ok) {
      if (res.data.code === 'NO_EMPLOYEE_PROFILE') return show('view-no-profile');
      return signOut();
    }
    state.context = res.data;
    show('view-employee');
    renderEmployee();
    refreshLocation();
  }

  function nearestWorkplace() {
    const wps = (state.context && state.context.authorizedWorkplaces) || [];
    if (!wps.length || !state.position) return wps.length ? { wp: wps[0], distance: null } : null;
    let best = null;
    for (const wp of wps) {
      const d = haversine(state.position.latitude, state.position.longitude, wp.latitude, wp.longitude);
      if (!best || d < best.distance) best = { wp, distance: d };
    }
    return best;
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const rad = (d) => (d * Math.PI) / 180;
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  }

  function renderEmployee() {
    const { employee, company, shift, todayRecord, recentEvents } = state.context;
    $('emp-name').textContent = localized(employee, 'full_name');
    $('emp-meta').textContent = [localized(employee, 'job_title'), localized(company, 'name'), shift ? `${t('shift')} ${shift.start_time}–${shift.end_time}` : '']
      .filter(Boolean)
      .join(' · ');
    const current = todayRecord.current_state || 'not_checked_in';
    const stateKind = { checked_in: 'success', on_break: 'warn', checked_out: 'info' }[current] || 'danger';
    $('emp-state').className = `badge badge-${stateKind}`;
    $('emp-state').textContent = t('state_' + current);

    const allowed = ALLOWED_EVENTS[current] || [];
    document.querySelectorAll('[data-event]').forEach((b) => (b.disabled = state.busy || !allowed.includes(b.dataset.event)));

    const near = nearestWorkplace();
    const fence = $('loc-fence');
    if (!near) {
      $('loc-workplace').textContent = t('noWorkplace');
    } else {
      $('loc-workplace').textContent = localized(near.wp, 'name');
    }
    if (near && near.distance !== null) {
      $('loc-distance').textContent = `${Math.round(near.distance)} ${t('meters')}`;
      const inside = near.distance <= near.wp.radius_meters;
      fence.className = `badge badge-${inside ? 'success' : 'danger'}`;
      fence.textContent = t(inside ? 'insideGeofence' : 'outsideGeofence');
    } else {
      $('loc-distance').textContent = '—';
      fence.className = 'badge hidden';
    }
    $('loc-accuracy').textContent = state.position ? `± ${Math.round(state.position.accuracy)} ${t('meters')}` : '—';

    const kind = { accepted: 'success', needs_review: 'warn', rejected: 'danger', pending: 'info' };
    $('recent-events').innerHTML =
      (recentEvents || [])
        .slice(0, 6)
        .map(
          (e) => `<li><span><strong>${esc(t('ev_' + e.event_type))}</strong> · ${esc(fmtTime(e.server_timestamp))}${
            e.rejection_reason ? `<span class="why">${esc(e.rejection_reason)}</span>` : ''
          }</span><span class="badge badge-${kind[e.sync_status] || 'info'}">${esc(t('sync_' + e.sync_status))}</span></li>`
        )
        .join('') || `<li class="empty">${esc(t('none'))}</li>`;
  }

  async function readLocation() {
    if (bridge.available) {
      const res = await bridge.call('locate');
      if (res.error) throw new Error(res.error);
      return res;
    }
    if (!navigator.geolocation) throw new Error('Geolocation not supported');
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 })
    );
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      timestamp: new Date(pos.timestamp).toISOString(),
      isMocked: false,
    };
  }

  async function refreshLocation() {
    $('loc-accuracy').textContent = t('locating');
    try {
      state.position = await readLocation();
    } catch (err) {
      state.position = null;
      banner(t('locationError') + err.message, 'warn');
    }
    renderEmployee();
  }

  function deviceId(prefix) {
    let id = storageGet('wehr_device_id');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/-/g, '').slice(0, 20);
      storageSet('wehr_device_id', id);
    }
    return `${prefix}-${id}`;
  }

  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  // Browser identity check with the device's own authenticator (fingerprint, face, Windows Hello).
  // Browsers cannot prove a fingerprint (vs a PIN) was used, so this is reported as `device_credential`.
  async function verifyInBrowser() {
    const base = { deviceIdentifier: deviceId('WEB'), devicePlatform: 'web', deviceModel: navigator.platform || 'Browser', osVersion: '' };
    const employee = state.context.employee;
    const available =
      window.PublicKeyCredential &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false));
    if (!available) {
      if (employee.allow_biometric_exception) {
        return { ...base, osAuthenticated: true, authMethod: 'exception_fallback', deviceSupportsBiometrics: false, biometricEnrolled: false };
      }
      throw new Error(t('webAuthUnavailable'));
    }
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const storeKey = `wehr_webauthn_${state.user.id}`;
    const existing = storageGet(storeKey);
    if (existing) {
      await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ type: 'public-key', id: unb64(existing) }],
          userVerification: 'required',
          timeout: 60000,
        },
      });
    } else {
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'We HR', id: location.hostname },
          user: { id: crypto.getRandomValues(new Uint8Array(16)), name: state.user.email, displayName: localized(employee, 'full_name') },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
          timeout: 60000,
        },
      });
      storageSet(storeKey, b64(cred.rawId));
    }
    return { ...base, osAuthenticated: true, authMethod: 'device_credential', deviceSupportsBiometrics: true, biometricEnrolled: true };
  }

  async function verifyIdentity() {
    const employee = state.context.employee;
    if (bridge.available) {
      const res = await bridge.call('biometric', {
        reason: t('biometricReason'),
        requireBiometricOnly: Boolean(employee.require_biometric) && !employee.allow_biometric_exception,
        allowException: Boolean(employee.allow_biometric_exception),
        deviceIdentifier: deviceId('APP'),
      });
      if (!res.osAuthenticated) throw new Error(`${res.errorCode || ''} ${res.errorMessage || ''}`.trim() || 'cancelled');
      return res;
    }
    return verifyInBrowser();
  }

  async function submit(eventType) {
    if (state.busy) return;
    state.busy = true;
    renderEmployee();
    banner(t('verifying'), 'info');
    try {
      await refreshLocation();
      const pos = state.position;
      if (!pos) return;

      let auth;
      try {
        auth = await verifyIdentity();
      } catch (err) {
        banner(t('bioFailed') + (err.message || err.name), 'danger');
        return;
      }

      const near = nearestWorkplace();
      const payload = {
        eventType,
        idempotencyKey: `${bridge.available ? 'app' : 'web'}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        workplaceId: near ? near.wp.id : state.context.employee.default_workplace_id,
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracyMeters: pos.accuracy,
        locationTimestamp: pos.timestamp || new Date().toISOString(),
        deviceTimestamp: new Date().toISOString(),
        isMockLocation: Boolean(pos.isMocked),
        auth,
      };
      let res;
      try {
        res = await api('/api/attendance/events', { method: 'POST', body: payload });
      } catch {
        banner(t('networkError'), 'danger');
        return;
      }
      const d = res.data;
      banner(d.message || d.rejectionReason || d.code || `HTTP ${res.status}`, res.ok ? (d.code === 'ACCEPTED_NEEDS_REVIEW' ? 'warn' : 'success') : 'danger');
      const ctx = await api('/api/employee/context');
      if (ctx.ok) state.context = ctx.data;
    } finally {
      state.busy = false;
      renderEmployee();
    }
  }

  // --------------------------------------------------------------------------
  // Wiring
  // --------------------------------------------------------------------------
  document.querySelectorAll('[data-event]').forEach((b) => b.addEventListener('click', () => submit(b.dataset.event)));
  $('btn-refresh-loc').addEventListener('click', refreshLocation);
  $('btn-logout').addEventListener('click', signOut);
  $('btn-lang').addEventListener('click', () => {
    state.lang = state.lang === 'ar' ? 'en' : 'ar';
    storageSet('wehr_lang', state.lang);
    applyLanguage();
  });

  applyLanguage();
  restoreSession();
})();
