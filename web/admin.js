/**
 * We HR — Platform Admin Console
 * Cross-tenant control of companies, subscriptions, login accounts, roles, branches,
 * workplaces, shifts, devices, payments and the audit trail (platform_super_admin only).
 */
(() => {
  'use strict';

  const I18N = {
    ar: {
      appTitle: 'We HR — لوحة الإدارة',
      appTagline: 'التحكم الكامل في الشركات والمستخدمين والصلاحيات',
      hrDashboardLink: 'لوحة الموارد البشرية',
      signOut: 'تسجيل الخروج',
      langToggle: 'English',
      loginTitle: 'دخول مدير المنصة',
      loginHint: 'هذه اللوحة مخصصة لمديري المنصة فقط.',
      username: 'اسم المستخدم أو البريد',
      password: 'كلمة المرور',
      signIn: 'دخول',
      notAdmin: 'هذا الحساب ليس مدير منصة. استخدم لوحة الموارد البشرية بدلاً من ذلك.',
      cancel: 'إلغاء',
      save: 'حفظ',
      create: 'إنشاء',
      confirm: 'تأكيد',
      saved: 'تم الحفظ',
      loading: 'جارٍ التحميل…',
      none: 'لا توجد بيانات',
      all: 'الكل',
      actions: 'إجراءات',
      status: 'الحالة',
      active: 'نشط',
      inactive: 'معطّل',
      enable: 'تفعيل',
      disable: 'تعطيل',
      edit: 'تعديل',
      company: 'الشركة',
      branch: 'الفرع',
      optional: '(اختياري)',
      nameEn: 'الاسم (إنجليزي)',
      nameAr: 'الاسم (عربي)',
      code: 'الرمز',
      never: 'لم يسجل دخول',
      sec_overview: 'نظرة عامة',
      sec_companies: 'الشركات',
      sec_users: 'المستخدمون والصلاحيات',
      sec_branches: 'الفروع',
      sec_workplaces: 'مواقع العمل',
      sec_shifts: 'الورديات',
      sec_devices: 'الأجهزة',
      sec_payments: 'المدفوعات',
      sec_audit: 'سجل التدقيق',
      kpi_companies: 'الشركات',
      kpi_activeCompanies: 'شركات نشطة',
      kpi_users: 'الحسابات',
      kpi_activeUsers: 'حسابات نشطة',
      kpi_employees: 'الموظفون',
      kpi_workplaces: 'مواقع العمل',
      kpi_attendanceEventsToday: 'حركات حضور اليوم',
      kpi_pendingPayments: 'مدفوعات معلقة',
      kpi_pendingDevices: 'أجهزة بانتظار الموافقة',
      usersByRole: 'الحسابات حسب الدور',
      recentLogins: 'آخر عمليات الدخول',
      role_platform_super_admin: 'مدير المنصة',
      role_company_owner: 'مالك الشركة',
      role_hr_admin: 'مسؤول موارد بشرية',
      role_branch_manager: 'مدير فرع',
      role_supervisor: 'مشرف',
      role_employee: 'موظف',
      newCompany: 'شركة جديدة',
      country: 'الدولة',
      plan: 'الباقة',
      subscription: 'الاشتراك',
      expires: 'ينتهي',
      days: 'مدة الاشتراك (أيام)',
      trial: 'فترة تجريبية',
      usersEmployees: 'حسابات / موظفون',
      editSubscription: 'تعديل الاشتراك',
      companySettings: 'إعدادات الشركة',
      suspend: 'إيقاف',
      activate: 'تفعيل',
      confirmSuspend: 'سيتم إيقاف الشركة وتسجيل خروج جميع مستخدميها فوراً. متابعة؟',
      sub_active: 'نشط',
      sub_trial: 'تجريبي',
      sub_suspended: 'موقوف',
      sub_grace_period: 'فترة سماح',
      sub_expired: 'منتهي',
      expiryDate: 'تاريخ الانتهاء',
      requireBiometricStrict: 'إلزام البصمة الحيوية (بدون رمز PIN)',
      requireApprovedDevice: 'السماح بالأجهزة المعتمدة فقط',
      allowOfflineAttendance: 'السماح بالحضور دون اتصال',
      newUser: 'مستخدم جديد',
      searchUsers: 'بحث بالاسم أو المستخدم',
      platformAdmins: 'مديرو المنصة',
      role: 'الدور',
      user: 'المستخدم',
      lastLogin: 'آخر دخول',
      fullNameEn: 'الاسم الكامل (إنجليزي)',
      fullNameAr: 'الاسم الكامل (عربي)',
      jobTitleEn: 'المسمى الوظيفي (إنجليزي)',
      resetPassword: 'كلمة مرور جديدة',
      newPassword: 'كلمة المرور الجديدة (6 أحرف على الأقل)',
      confirmPassword: 'تأكيد كلمة المرور',
      passwordMismatch: 'كلمتا المرور غير متطابقتين.',
      forceSignOut: 'إنهاء الجلسات',
      confirmSignOut: 'سيتم تسجيل خروج هذا المستخدم من كل الأجهزة. متابعة؟',
      editUser: 'تعديل المستخدم',
      you: 'أنت',
      newBranch: 'فرع جديد',
      city: 'المدينة',
      employees: 'الموظفون',
      newWorkplace: 'موقع عمل جديد',
      workplace: 'موقع العمل',
      type: 'النوع',
      latitude: 'خط العرض',
      longitude: 'خط الطول',
      radius: 'نطاق السماح (متر)',
      location: 'الموقع',
      useMyLocation: '📍 استخدم موقعي الحالي',
      locating: 'جارٍ تحديد الموقع…',
      locationFailed: 'تعذر تحديد الموقع: ',
      authorizeAll: 'السماح لكل موظفي الفرع/الشركة بالحضور هنا',
      editWorkplace: 'تعديل موقع العمل',
      openMap: 'خريطة',
      wp_office: 'مكتب',
      wp_factory: 'مصنع',
      wp_warehouse: 'مخزن',
      wp_branch: 'فرع',
      wp_site: 'موقع مشروع',
      wp_field: 'ميداني',
      newShift: 'وردية جديدة',
      shift: 'الوردية',
      startTime: 'البداية',
      endTime: 'النهاية',
      grace: 'سماح التأخير (دقيقة)',
      overnight: 'ليلية',
      employee: 'الموظف',
      device: 'الجهاز',
      biometric: 'البصمة',
      lastUsed: 'آخر استخدام',
      dev_approved: 'معتمد',
      dev_pending: 'بانتظار الموافقة',
      dev_revoked: 'ملغى',
      approve: 'اعتماد',
      revoke: 'إلغاء',
      amount: 'المبلغ',
      method: 'الطريقة',
      reference: 'المرجع',
      submitted: 'تاريخ الإرسال',
      verify: 'تأكيد الدفع',
      reject: 'رفض',
      pay_pending: 'معلق',
      pay_verified: 'مؤكد',
      pay_rejected: 'مرفوض',
      time: 'الوقت',
      actor: 'المنفّذ',
      action: 'الإجراء',
      target: 'الهدف',
      details: 'التفاصيل',
      filterAction: 'تصفية بالإجراء (مثال: LOGIN)',
      refresh: 'تحديث',
      yes: 'نعم',
      no: 'لا',
    },
    en: {
      appTitle: 'We HR — Admin Console',
      appTagline: 'Full control over companies, users and access',
      hrDashboardLink: 'HR dashboard',
      signOut: 'Sign out',
      langToggle: 'العربية',
      loginTitle: 'Platform admin sign-in',
      loginHint: 'This console is for platform administrators only.',
      username: 'Username or email',
      password: 'Password',
      signIn: 'Sign in',
      notAdmin: 'This account is not a platform admin. Use the HR dashboard instead.',
      cancel: 'Cancel',
      save: 'Save',
      create: 'Create',
      confirm: 'Confirm',
      saved: 'Saved',
      loading: 'Loading…',
      none: 'Nothing here yet',
      all: 'All',
      actions: 'Actions',
      status: 'Status',
      active: 'Active',
      inactive: 'Disabled',
      enable: 'Enable',
      disable: 'Disable',
      edit: 'Edit',
      company: 'Company',
      branch: 'Branch',
      optional: '(optional)',
      nameEn: 'Name (English)',
      nameAr: 'Name (Arabic)',
      code: 'Code',
      never: 'Never signed in',
      sec_overview: 'Overview',
      sec_companies: 'Companies',
      sec_users: 'Users & access',
      sec_branches: 'Branches',
      sec_workplaces: 'Workplaces',
      sec_shifts: 'Shifts',
      sec_devices: 'Devices',
      sec_payments: 'Payments',
      sec_audit: 'Audit log',
      kpi_companies: 'Companies',
      kpi_activeCompanies: 'Active companies',
      kpi_users: 'Accounts',
      kpi_activeUsers: 'Active accounts',
      kpi_employees: 'Employees',
      kpi_workplaces: 'Workplaces',
      kpi_attendanceEventsToday: 'Attendance events today',
      kpi_pendingPayments: 'Pending payments',
      kpi_pendingDevices: 'Devices awaiting approval',
      usersByRole: 'Accounts by role',
      recentLogins: 'Recent sign-ins',
      role_platform_super_admin: 'Platform admin',
      role_company_owner: 'Company owner',
      role_hr_admin: 'HR admin',
      role_branch_manager: 'Branch manager',
      role_supervisor: 'Supervisor',
      role_employee: 'Employee',
      newCompany: 'New company',
      country: 'Country',
      plan: 'Plan',
      subscription: 'Subscription',
      expires: 'Expires',
      days: 'Subscription length (days)',
      trial: 'Trial period',
      usersEmployees: 'Accounts / employees',
      editSubscription: 'Edit subscription',
      companySettings: 'Company settings',
      suspend: 'Suspend',
      activate: 'Activate',
      confirmSuspend: 'The company will be suspended and all of its users signed out immediately. Continue?',
      sub_active: 'Active',
      sub_trial: 'Trial',
      sub_suspended: 'Suspended',
      sub_grace_period: 'Grace period',
      sub_expired: 'Expired',
      expiryDate: 'Expiry date',
      requireBiometricStrict: 'Require biometric (no PIN fallback)',
      requireApprovedDevice: 'Approved devices only',
      allowOfflineAttendance: 'Allow offline attendance',
      newUser: 'New user',
      searchUsers: 'Search name or username',
      platformAdmins: 'Platform admins',
      role: 'Role',
      user: 'User',
      lastLogin: 'Last sign-in',
      fullNameEn: 'Full name (English)',
      fullNameAr: 'Full name (Arabic)',
      jobTitleEn: 'Job title (English)',
      resetPassword: 'Reset password',
      newPassword: 'New password (at least 6 characters)',
      confirmPassword: 'Confirm password',
      passwordMismatch: 'The passwords do not match.',
      forceSignOut: 'Sign out everywhere',
      confirmSignOut: 'This user will be signed out on every device. Continue?',
      editUser: 'Edit user',
      you: 'you',
      newBranch: 'New branch',
      city: 'City',
      employees: 'Employees',
      newWorkplace: 'New workplace',
      workplace: 'Workplace',
      type: 'Type',
      latitude: 'Latitude',
      longitude: 'Longitude',
      radius: 'Allowed radius (m)',
      location: 'Location',
      useMyLocation: '📍 Use my current location',
      locating: 'Finding your location…',
      locationFailed: 'Could not get location: ',
      authorizeAll: 'Let every employee of the branch/company check in here',
      editWorkplace: 'Edit workplace',
      openMap: 'Map',
      wp_office: 'Office',
      wp_factory: 'Factory',
      wp_warehouse: 'Warehouse',
      wp_branch: 'Branch',
      wp_site: 'Project site',
      wp_field: 'Field',
      newShift: 'New shift',
      shift: 'Shift',
      startTime: 'Start',
      endTime: 'End',
      grace: 'Late grace (min)',
      overnight: 'Overnight',
      employee: 'Employee',
      device: 'Device',
      biometric: 'Biometric',
      lastUsed: 'Last used',
      dev_approved: 'Approved',
      dev_pending: 'Pending',
      dev_revoked: 'Revoked',
      approve: 'Approve',
      revoke: 'Revoke',
      amount: 'Amount',
      method: 'Method',
      reference: 'Reference',
      submitted: 'Submitted',
      verify: 'Verify payment',
      reject: 'Reject',
      pay_pending: 'Pending',
      pay_verified: 'Verified',
      pay_rejected: 'Rejected',
      time: 'Time',
      actor: 'Actor',
      action: 'Action',
      target: 'Target',
      details: 'Details',
      filterAction: 'Filter by action (e.g. LOGIN)',
      refresh: 'Refresh',
      yes: 'Yes',
      no: 'No',
    },
  };

  const ROLES = ['platform_super_admin', 'company_owner', 'hr_admin', 'branch_manager', 'supervisor', 'employee'];
  const COMPANY_ROLES = ROLES.slice(1);
  const COUNTRIES = [['EG', 'Egypt / مصر'], ['SA', 'Saudi Arabia / السعودية'], ['AE', 'UAE / الإمارات'], ['KW', 'Kuwait / الكويت'], ['QA', 'Qatar / قطر'], ['BH', 'Bahrain / البحرين'], ['OM', 'Oman / عُمان']];
  const WP_TYPES = ['office', 'factory', 'warehouse', 'branch', 'site', 'field'];
  const SECTIONS = ['overview', 'companies', 'users', 'branches', 'workplaces', 'shifts', 'devices', 'payments', 'audit'];

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
      /* storage unavailable: keep in memory only */
    }
  }

  const state = {
    lang: storageGet('wehr_lang') || 'ar',
    token: storageGet('wehr_admin_token'),
    user: null,
    section: 'overview',
    companies: [],
    branches: [],
    plans: [],
    usersFilter: { companyId: '', role: '', q: '' },
    auditFilter: { companyId: '', action: '' },
  };

  const $ = (id) => document.getElementById(id);
  // Native phone features when the console runs inside the We HR mobile app (see native-bridge.js)
  const bridge = window.WeHrBridge || { available: false };
  const t = (key) => (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || key;
  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nameOf = (row, base = 'name') => (state.lang === 'ar' ? row[`${base}_ar`] || row[`${base}_en`] : row[`${base}_en`] || row[`${base}_ar`]) || '';
  const companyName = (row) => (state.lang === 'ar' ? row.company_name_ar || row.company_name_en : row.company_name_en || row.company_name_ar) || '—';
  const branchName = (row) => (state.lang === 'ar' ? row.branch_name_ar || row.branch_name_en : row.branch_name_en || row.branch_name_ar) || '—';
  const fmtDate = (iso, withTime = true) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return esc(iso);
    return d.toLocaleString(state.lang === 'ar' ? 'ar-EG' : 'en-GB', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
  };
  const badge = (text, kind) => `<span class="badge badge-${kind}">${esc(text)}</span>`;
  const activeBadge = (on) => (on ? badge(t('active'), 'success') : badge(t('inactive'), 'danger'));

  // --------------------------------------------------------------------------
  // API & feedback
  // --------------------------------------------------------------------------
  async function api(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    let resp;
    try {
      resp = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (err) {
      return { ok: false, status: 0, data: { message: err.message } };
    }
    const data = await resp.json().catch(() => ({}));
    if (resp.status === 401 && state.token && path !== '/api/auth/login') {
      signOut();
      toast(data.message || 'Session expired', 'danger');
    }
    return { ok: resp.ok && data.ok !== false, status: resp.status, data };
  }

  let toastTimer;
  function toast(message, kind = 'success') {
    const el = $('toast');
    el.className = `alert alert-${kind}`;
    el.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
  }

  // --------------------------------------------------------------------------
  // Dialog helper: fields -> values, keeps the dialog open on server errors
  // --------------------------------------------------------------------------
  function fieldHtml(f) {
    const id = `fld-${f.name}`;
    const req = f.required ? 'required' : '';
    const label = `${esc(f.label)}${f.optional ? ` <span class="muted">${esc(t('optional'))}</span>` : ''}`;
    if (f.type === 'checkbox') {
      return `<label class="check-row" data-field="${f.name}"><input type="checkbox" id="${id}" name="${f.name}" ${f.value ? 'checked' : ''} /> ${esc(f.label)}</label>`;
    }
    if (f.type === 'button') {
      return `<div class="form-group" data-field="${f.name}"><button type="button" class="btn btn-ghost" id="${id}">${esc(f.label)}</button></div>`;
    }
    let control;
    if (f.type === 'select') {
      control = `<select id="${id}" name="${f.name}" class="form-control" ${req}>${(f.options || [])
        .map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(f.value ?? '') ? 'selected' : ''}>${esc(l)}</option>`)
        .join('')}</select>`;
    } else {
      const attrs = ['min', 'max', 'step', 'placeholder', 'autocomplete', 'minlength']
        .filter((a) => f[a] !== undefined)
        .map((a) => `${a}="${esc(f[a])}"`)
        .join(' ');
      control = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" class="form-control" value="${esc(f.value ?? '')}" ${attrs} ${req} />`;
    }
    return `<div class="form-group" data-field="${f.name}"><label for="${id}">${label}</label>${control}<span class="muted" id="${id}-hint"></span></div>`;
  }

  function readForm(form, fields) {
    const values = {};
    for (const f of fields) {
      if (f.type === 'button') continue;
      const el = form.querySelector(`[name="${f.name}"]`);
      if (!el) continue;
      if (f.type === 'checkbox') values[f.name] = el.checked;
      else if (f.type === 'number') values[f.name] = el.value === '' ? undefined : Number(el.value);
      else values[f.name] = el.value.trim();
    }
    return values;
  }

  function openDialog({ title, fields = [], message, submitLabel, danger = false, onChange, onOpen, onSubmit }) {
    const dlg = $('dialog');
    const form = $('dialog-form');
    $('dialog-title').textContent = title;
    $('dialog-body').innerHTML =
      (message ? `<p>${esc(message)}</p>` : '') +
      fields.map(fieldHtml).join('') +
      '<div id="dialog-error" class="alert alert-danger hidden"></div>';
    const submit = $('dialog-submit');
    submit.textContent = submitLabel || t('save');
    submit.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;

    const sync = () => {
      if (onChange) onChange(readForm(form, fields), form);
    };
    form.oninput = sync;
    form.onchange = sync;
    $('dialog-cancel').onclick = () => dlg.close();
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      if (!form.reportValidity()) return;
      submit.disabled = true;
      const errorBox = $('dialog-error');
      errorBox.classList.add('hidden');
      try {
        const res = await onSubmit(readForm(form, fields));
        if (res && res.error) {
          errorBox.textContent = res.error;
          errorBox.classList.remove('hidden');
          return;
        }
        dlg.close();
        if (res && res.message !== null) toast((res && res.message) || t('saved'));
      } finally {
        submit.disabled = false;
      }
    };
    dlg.showModal();
    if (onOpen) onOpen(form);
    sync();
  }

  function setOptions(form, name, options, keep = true) {
    const sel = form.querySelector(`[name="${name}"]`);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    if (keep && options.some(([v]) => String(v) === prev)) sel.value = prev;
  }
  function toggleField(form, name, show) {
    const wrap = form.querySelector(`[data-field="${name}"]`);
    if (wrap) wrap.classList.toggle('hidden', !show);
    const el = form.querySelector(`[name="${name}"]`);
    if (el && el.dataset.wasRequired === undefined) el.dataset.wasRequired = el.required ? '1' : '';
    if (el) el.required = show && el.dataset.wasRequired === '1';
  }

  // Shared "write then refresh" helper for dialog submissions and row actions
  async function mutate(path, body, { successMessage } = {}) {
    const res = await api(path, { method: 'POST', body });
    if (!res.ok) return { error: res.data.message || res.data.code || `HTTP ${res.status}` };
    await render();
    return { message: successMessage || t('saved') };
  }
  async function rowAction(path, body, opts) {
    const res = await mutate(path, body, opts);
    toast(res.error || res.message, res.error ? 'danger' : 'success');
  }
  function confirmThen(message, path, body, label) {
    openDialog({ title: t('confirm'), message, submitLabel: label || t('confirm'), danger: true, onSubmit: () => mutate(path, body) });
  }

  // --------------------------------------------------------------------------
  // Reference data (companies, branches, plans) used by many forms
  // --------------------------------------------------------------------------
  async function loadReference() {
    const [c, b, p] = await Promise.all([api('/api/admin/companies'), api('/api/admin/branches'), api('/api/admin/plans')]);
    if (c.ok) state.companies = c.data.companies;
    if (b.ok) state.branches = b.data.branches;
    if (p.ok) state.plans = p.data.plans;
  }
  const companyOptions = () => state.companies.map((c) => [c.id, nameOf(c)]);
  const branchOptions = (companyId, withNone = false) => [
    ...(withNone ? [['', '—']] : []),
    ...state.branches.filter((b) => b.company_id === companyId).map((b) => [b.id, `${nameOf(b)} (${b.code})`]),
  ];
  const planOptions = () => state.plans.map((p) => [p.code, `${nameOf(p)} — ${p.max_employees} ${t('employees')}`]);

  // --------------------------------------------------------------------------
  // Sections
  // --------------------------------------------------------------------------
  const card = (title, body, actionsHtml = '') =>
    `<div class="card"><div class="card-header"><h2 class="card-title">${esc(title)}</h2><div class="toolbar">${actionsHtml}</div></div>${body}</div>`;
  const table = (heads, rows) =>
    `<div class="table-responsive"><table><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
      rows.length ? rows.join('') : `<tr><td colspan="${heads.length}" class="empty">${esc(t('none'))}</td></tr>`
    }</tbody></table></div>`;
  const btn = (label, action, id, extra = '') =>
    `<button type="button" class="btn btn-sm btn-ghost ${extra}" data-action="${action}" data-id="${esc(id)}">${esc(label)}</button>`;

  const renderers = {
    async overview(main) {
      const res = await api('/api/admin/overview');
      if (!res.ok) return;
      const { metrics, usersByRole, recentLogins } = res.data;
      updateNavCounts(metrics);
      const kpis = Object.entries(metrics)
        .map(([k, v]) => `<div class="kpi-card"><div class="kpi-label">${esc(t('kpi_' + k))}</div><div class="kpi-value">${esc(v)}</div></div>`)
        .join('');
      main.innerHTML =
        `<div class="kpi-grid">${kpis}</div><div class="split">` +
        card(t('usersByRole'), `<ul class="list-plain">${usersByRole.map((r) => `<li><span>${esc(t('role_' + r.role))}</span><strong>${esc(r.n)}</strong></li>`).join('')}</ul>`) +
        card(
          t('recentLogins'),
          `<ul class="list-plain">${
            recentLogins
              .map((u) => `<li><span><strong>${esc(u.email)}</strong><br><span class="muted">${esc(t('role_' + u.role))} · ${esc(companyName(u))}</span></span><span class="muted">${fmtDate(u.last_login_at)}</span></li>`)
              .join('') || `<li class="empty">${esc(t('none'))}</li>`
          }</ul>`
        ) +
        '</div>';
    },

    async companies(main) {
      await loadReference();
      const rows = state.companies.map((c) => {
        const s = c.subscription;
        const subKind = !s ? 'danger' : s.status === 'suspended' ? 'danger' : s.status === 'trial' ? 'warn' : 'success';
        return `<tr>
          <td><strong>${esc(nameOf(c))}</strong><span class="sub mono">${esc(c.slug)}</span></td>
          <td>${esc(c.country_code)}</td>
          <td>${s ? esc(state.lang === 'ar' ? s.plan_name_ar : s.plan_name_en) : '—'}</td>
          <td>${s ? badge(t('sub_' + s.status), subKind) : '—'}<span class="sub">${esc(t('expires'))}: ${s ? fmtDate(s.expiry_date, false) : '—'}</span></td>
          <td class="num">${esc(c.user_count)} / ${esc(c.employee_count)}</td>
          <td>${activeBadge(c.is_active)}</td>
          <td><div class="row-actions">${btn(t('subscription'), 'company-sub', c.id)}${btn(t('companySettings'), 'company-settings', c.id)}${
            c.is_active ? btn(t('suspend'), 'company-suspend', c.id, 'danger') : btn(t('activate'), 'company-activate', c.id)
          }</div></td></tr>`;
      });
      main.innerHTML = card(
        t('sec_companies'),
        table([t('company'), t('country'), t('plan'), t('subscription'), t('usersEmployees'), t('status'), t('actions')], rows),
        `<button type="button" class="btn btn-primary" data-action="company-new">+ ${esc(t('newCompany'))}</button>`
      );
    },

    async users(main) {
      await loadReference();
      const f = state.usersFilter;
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
      const res = await api(`/api/admin/users${qs ? '?' + qs : ''}`);
      if (!res.ok) return;
      const rows = res.data.users.map((u) => {
        const self = state.user && u.id === state.user.id;
        return `<tr>
          <td><strong>${esc(u.email)}</strong>${self ? ` <span class="badge badge-info">${esc(t('you'))}</span>` : ''}<span class="sub">${esc(nameOf(u, 'full_name'))}${u.employee_code ? ` · ${esc(u.employee_code)}` : ''}</span></td>
          <td>${esc(t('role_' + u.role))}</td>
          <td>${esc(companyName(u))}<span class="sub">${u.company_id ? esc(branchName(u)) : ''}</span></td>
          <td>${activeBadge(u.is_active)}</td>
          <td>${u.last_login_at ? fmtDate(u.last_login_at) : `<span class="muted">${esc(t('never'))}</span>`}</td>
          <td><div class="row-actions">
            ${u.company_id ? btn(t('edit'), 'user-edit', u.id) : ''}
            ${btn(t('resetPassword'), 'user-password', u.id)}
            ${btn(t('forceSignOut'), 'user-signout', u.id)}
            ${self ? '' : u.is_active ? btn(t('disable'), 'user-disable', u.id, 'danger') : btn(t('enable'), 'user-enable', u.id)}
          </div></td></tr>`;
      });
      const filters = `
        <select class="form-control" id="flt-company">
          <option value="">${esc(t('company'))}: ${esc(t('all'))}</option>
          <option value="platform" ${f.companyId === 'platform' ? 'selected' : ''}>${esc(t('platformAdmins'))}</option>
          ${companyOptions().map(([v, l]) => `<option value="${esc(v)}" ${f.companyId === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
        </select>
        <select class="form-control" id="flt-role">
          <option value="">${esc(t('role'))}: ${esc(t('all'))}</option>
          ${ROLES.map((r) => `<option value="${r}" ${f.role === r ? 'selected' : ''}>${esc(t('role_' + r))}</option>`).join('')}
        </select>
        <input class="form-control" id="flt-q" type="search" placeholder="${esc(t('searchUsers'))}" value="${esc(f.q)}" />
        <button type="button" class="btn btn-primary" data-action="user-new">+ ${esc(t('newUser'))}</button>`;
      main.innerHTML = card(t('sec_users'), table([t('user'), t('role'), t('company'), t('status'), t('lastLogin'), t('actions')], rows), filters);
      state.usersCache = res.data.users;
      $('flt-company').onchange = (e) => ((f.companyId = e.target.value), render());
      $('flt-role').onchange = (e) => ((f.role = e.target.value), render());
      let debounce;
      $('flt-q').oninput = (e) => {
        clearTimeout(debounce);
        debounce = setTimeout(() => ((f.q = e.target.value.trim()), render().then(() => $('flt-q') && $('flt-q').focus())), 350);
      };
    },

    async branches(main) {
      await loadReference();
      const rows = state.branches.map(
        (b) => `<tr>
          <td><strong>${esc(nameOf(b))}</strong><span class="sub mono">${esc(b.code)}</span></td>
          <td>${esc(companyName(b))}</td>
          <td>${esc(b.city || '—')}</td>
          <td class="num">${esc(b.employee_count)}</td>
          <td>${activeBadge(b.is_active)}</td>
          <td>${b.is_active ? btn(t('disable'), 'branch-disable', b.id, 'danger') : btn(t('enable'), 'branch-enable', b.id)}</td></tr>`
      );
      main.innerHTML = card(
        t('sec_branches'),
        table([t('branch'), t('company'), t('city'), t('employees'), t('status'), t('actions')], rows),
        `<button type="button" class="btn btn-primary" data-action="branch-new">+ ${esc(t('newBranch'))}</button>`
      );
    },

    async workplaces(main) {
      await loadReference();
      const res = await api('/api/admin/workplaces');
      if (!res.ok) return;
      state.workplacesCache = res.data.workplaces;
      const rows = res.data.workplaces.map(
        (w) => `<tr>
          <td><strong>${esc(nameOf(w))}</strong><span class="sub">${esc(t('wp_' + w.workplace_type))} · <span class="mono">${esc(w.code)}</span></span></td>
          <td>${esc(companyName(w))}<span class="sub">${esc(branchName(w))}</span></td>
          <td class="mono">${esc(Number(w.latitude).toFixed(5))}, ${esc(Number(w.longitude).toFixed(5))}
            <a class="sub map-link" href="https://www.google.com/maps?q=${encodeURIComponent(`${w.latitude},${w.longitude}`)}" target="_blank" rel="noopener noreferrer">${esc(t('openMap'))} ↗</a></td>
          <td class="num">${esc(Math.round(w.radius_meters))}</td>
          <td>${activeBadge(w.is_active)}</td>
          <td><div class="row-actions">${btn(t('edit'), 'wp-edit', w.id)}${
            w.is_active ? btn(t('disable'), 'wp-disable', w.id, 'danger') : btn(t('enable'), 'wp-enable', w.id)
          }</div></td></tr>`
      );
      main.innerHTML = card(
        t('sec_workplaces'),
        table([t('workplace'), t('company'), t('location'), t('radius'), t('status'), t('actions')], rows),
        `<button type="button" class="btn btn-primary" data-action="wp-new">+ ${esc(t('newWorkplace'))}</button>`
      );
    },

    async shifts(main) {
      await loadReference();
      const res = await api('/api/admin/shifts');
      if (!res.ok) return;
      const rows = res.data.shifts.map(
        (s) => `<tr>
          <td><strong>${esc(nameOf(s))}</strong></td>
          <td>${esc(companyName(s))}<span class="sub">${esc(branchName(s))}</span></td>
          <td class="mono">${esc(s.start_time)} → ${esc(s.end_time)}${s.is_overnight ? ` ${badge(t('overnight'), 'info')}` : ''}</td>
          <td class="num">${esc(s.grace_period_minutes)}</td>
          <td>${activeBadge(s.is_active)}</td>
          <td>${s.is_active ? btn(t('disable'), 'shift-disable', s.id, 'danger') : btn(t('enable'), 'shift-enable', s.id)}</td></tr>`
      );
      main.innerHTML = card(
        t('sec_shifts'),
        table([t('shift'), t('company'), `${t('startTime')} → ${t('endTime')}`, t('grace'), t('status'), t('actions')], rows),
        `<button type="button" class="btn btn-primary" data-action="shift-new">+ ${esc(t('newShift'))}</button>`
      );
    },

    async devices(main) {
      const res = await api('/api/admin/devices');
      if (!res.ok) return;
      const kind = { approved: 'success', pending: 'warn', revoked: 'danger' };
      const rows = res.data.devices.map(
        (d) => `<tr>
          <td><strong>${esc(nameOf(d, 'full_name'))}</strong><span class="sub">${esc(d.employee_code)}</span></td>
          <td>${esc(companyName(d))}</td>
          <td>${esc(d.device_model)}<span class="sub">${esc(d.platform)} ${esc(d.os_version || '')} · <span class="mono">${esc(d.device_identifier)}</span></span></td>
          <td>${d.biometric_enrolled ? esc(t('yes')) : esc(t('no'))}</td>
          <td>${badge(t('dev_' + d.status), kind[d.status] || 'info')}</td>
          <td>${fmtDate(d.last_used_at)}</td>
          <td><div class="row-actions">${d.status !== 'approved' ? btn(t('approve'), 'device-approve', d.id) : ''}${
            d.status !== 'revoked' ? btn(t('revoke'), 'device-revoke', d.id, 'danger') : ''
          }</div></td></tr>`
      );
      main.innerHTML = card(t('sec_devices'), table([t('employee'), t('company'), t('device'), t('biometric'), t('status'), t('lastUsed'), t('actions')], rows));
    },

    async payments(main) {
      const res = await api('/api/admin/payments');
      if (!res.ok) return;
      const kind = { pending: 'warn', verified: 'success', rejected: 'danger' };
      const rows = res.data.payments.map(
        (p) => `<tr>
          <td>${esc(companyName(p))}</td>
          <td class="num">${esc(Number(p.amount).toLocaleString())} ${esc(p.currency)}</td>
          <td>${esc(p.payment_method)}</td>
          <td class="mono">${esc(p.reference_number)}</td>
          <td>${badge(t('pay_' + p.verification_status), kind[p.verification_status] || 'info')}</td>
          <td>${fmtDate(p.created_at)}</td>
          <td><div class="row-actions">${
            p.verification_status === 'pending' ? btn(t('verify'), 'pay-verify', p.id) + btn(t('reject'), 'pay-reject', p.id, 'danger') : ''
          }</div></td></tr>`
      );
      main.innerHTML = card(t('sec_payments'), table([t('company'), t('amount'), t('method'), t('reference'), t('status'), t('submitted'), t('actions')], rows));
    },

    async audit(main) {
      await loadReference();
      const f = state.auditFilter;
      const qs = new URLSearchParams(Object.entries({ ...f, limit: 300 }).filter(([, v]) => v)).toString();
      const res = await api(`/api/admin/audit-logs?${qs}`);
      if (!res.ok) return;
      const rows = res.data.auditLogs.map((a) => {
        let details = a.details_json || '';
        if (details.length > 160) details = details.slice(0, 160) + '…';
        return `<tr>
          <td>${fmtDate(a.created_at)}</td>
          <td>${esc(a.actor_email || '—')}<span class="sub">${a.actor_role ? esc(t('role_' + a.actor_role)) : ''}</span></td>
          <td class="mono">${esc(a.action)}</td>
          <td>${esc(a.target_type)}<span class="sub mono">${esc(a.target_id || '')}</span></td>
          <td>${esc(companyName(a))}</td>
          <td class="mono">${esc(a.ip_address || '')}</td>
          <td class="mono">${esc(details)}</td></tr>`;
      });
      const filters = `
        <select class="form-control" id="flt-audit-company">
          <option value="">${esc(t('company'))}: ${esc(t('all'))}</option>
          <option value="platform" ${f.companyId === 'platform' ? 'selected' : ''}>${esc(t('platformAdmins'))}</option>
          ${companyOptions().map(([v, l]) => `<option value="${esc(v)}" ${f.companyId === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
        </select>
        <input class="form-control" id="flt-audit-action" type="search" placeholder="${esc(t('filterAction'))}" value="${esc(f.action)}" />
        <button type="button" class="btn btn-secondary" data-action="refresh">${esc(t('refresh'))}</button>`;
      main.innerHTML = card(t('sec_audit'), table([t('time'), t('actor'), t('action'), t('target'), t('company'), 'IP', t('details')], rows), filters);
      $('flt-audit-company').onchange = (e) => ((f.companyId = e.target.value), render());
      $('flt-audit-action').onchange = (e) => ((f.action = e.target.value.trim()), render());
    },
  };

  // --------------------------------------------------------------------------
  // Actions (event delegation on the main panel)
  // --------------------------------------------------------------------------
  function geoButton(form) {
    const button = form.querySelector('#fld-geo');
    if (!button) return;
    button.onclick = () => {
      const hint = form.querySelector('#fld-latitude-hint');
      const fill = (lat, lng, acc) => {
        form.querySelector('[name="latitude"]').value = lat.toFixed(6);
        form.querySelector('[name="longitude"]').value = lng.toFixed(6);
        hint.textContent = `± ${Math.round(acc)} m`;
      };
      if (bridge.available) {
        hint.textContent = t('locating');
        bridge
          .call('locate')
          .then((res) => (res.error ? (hint.textContent = t('locationFailed') + res.error) : fill(res.latitude, res.longitude, res.accuracy)));
        return;
      }
      if (!navigator.geolocation) {
        hint.textContent = t('locationFailed') + 'unsupported';
        return;
      }
      hint.textContent = t('locating');
      navigator.geolocation.getCurrentPosition(
        (pos) => fill(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        (err) => (hint.textContent = t('locationFailed') + err.message),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    };
  }

  const actions = {
    refresh: () => render(),

    'company-new': () =>
      openDialog({
        title: t('newCompany'),
        submitLabel: t('create'),
        fields: [
          { name: 'nameEn', label: t('nameEn'), required: true },
          { name: 'nameAr', label: t('nameAr'), optional: true },
          { name: 'countryCode', label: t('country'), type: 'select', options: COUNTRIES, value: 'EG' },
          { name: 'planCode', label: t('plan'), type: 'select', options: planOptions(), value: 'STARTER' },
          { name: 'subscriptionDays', label: t('days'), type: 'number', value: 30, min: 1, max: 3660 },
          { name: 'trial', label: t('trial'), type: 'checkbox' },
        ],
        onSubmit: (v) => mutate('/api/admin/companies', v),
      }),
    'company-sub': (id) => {
      const c = state.companies.find((x) => x.id === id);
      const s = c.subscription || {};
      openDialog({
        title: `${t('editSubscription')} — ${nameOf(c)}`,
        fields: [
          { name: 'planCode', label: t('plan'), type: 'select', options: planOptions(), value: s.plan_code },
          { name: 'status', label: t('status'), type: 'select', options: ['active', 'trial', 'suspended'].map((x) => [x, t('sub_' + x)]), value: s.status },
          { name: 'expiryDate', label: t('expiryDate'), type: 'date', value: String(s.expiry_date || '').slice(0, 10), required: true },
        ],
        onSubmit: (v) => mutate(`/api/admin/companies/${id}/subscription`, v),
      });
    },
    'company-settings': (id) => {
      const c = state.companies.find((x) => x.id === id);
      openDialog({
        title: `${t('companySettings')} — ${nameOf(c)}`,
        fields: [
          { name: 'nameEn', label: t('nameEn'), value: c.name_en, required: true },
          { name: 'nameAr', label: t('nameAr'), value: c.name_ar, required: true },
          { name: 'requireBiometricStrict', label: t('requireBiometricStrict'), type: 'checkbox', value: c.require_biometric_strict },
          { name: 'requireApprovedDevice', label: t('requireApprovedDevice'), type: 'checkbox', value: c.require_approved_device },
          { name: 'allowOfflineAttendance', label: t('allowOfflineAttendance'), type: 'checkbox', value: c.allow_offline_attendance },
        ],
        onSubmit: (v) => mutate(`/api/admin/companies/${id}`, v),
      });
    },
    'company-suspend': (id) => confirmThen(t('confirmSuspend'), `/api/admin/companies/${id}`, { isActive: false }, t('suspend')),
    'company-activate': (id) => rowAction(`/api/admin/companies/${id}`, { isActive: true }),

    'user-new': () => {
      const firstCompany = state.companies[0] ? state.companies[0].id : '';
      openDialog({
        title: t('newUser'),
        submitLabel: t('create'),
        fields: [
          { name: 'email', label: t('username'), required: true, autocomplete: 'off' },
          { name: 'password', label: t('newPassword'), type: 'password', required: true, minlength: 6, autocomplete: 'new-password' },
          { name: 'role', label: t('role'), type: 'select', options: ROLES.map((r) => [r, t('role_' + r)]), value: 'employee' },
          { name: 'companyId', label: t('company'), type: 'select', options: companyOptions(), value: firstCompany, required: true },
          { name: 'branchId', label: t('branch'), type: 'select', options: branchOptions(firstCompany) },
          { name: 'fullNameEn', label: t('fullNameEn'), required: true },
          { name: 'fullNameAr', label: t('fullNameAr'), optional: true },
          { name: 'jobTitleEn', label: t('jobTitleEn'), optional: true },
        ],
        onChange: (v, form) => {
          const company = v.role !== 'platform_super_admin';
          ['companyId', 'branchId', 'fullNameEn', 'fullNameAr', 'jobTitleEn'].forEach((n) => toggleField(form, n, company));
          if (company) setOptions(form, 'branchId', branchOptions(v.companyId));
        },
        onSubmit: (v) => mutate('/api/admin/users', v),
      });
    },
    'user-edit': (id) => {
      const u = state.usersCache.find((x) => x.id === id);
      openDialog({
        title: `${t('editUser')} — ${u.email}`,
        fields: [
          { name: 'role', label: t('role'), type: 'select', options: COMPANY_ROLES.map((r) => [r, t('role_' + r)]), value: u.role },
          { name: 'branchId', label: t('branch'), type: 'select', options: branchOptions(u.company_id), value: u.effective_branch_id || '' },
        ],
        onSubmit: (v) => mutate(`/api/admin/users/${id}`, v),
      });
    },
    'user-password': (id) => {
      const u = state.usersCache.find((x) => x.id === id);
      openDialog({
        title: `${t('resetPassword')} — ${u.email}`,
        fields: [
          { name: 'password', label: t('newPassword'), type: 'password', required: true, minlength: 6, autocomplete: 'new-password' },
          { name: 'confirm', label: t('confirmPassword'), type: 'password', required: true, minlength: 6, autocomplete: 'new-password' },
        ],
        onSubmit: (v) => (v.password !== v.confirm ? { error: t('passwordMismatch') } : mutate(`/api/admin/users/${id}/password`, { password: v.password })),
      });
    },
    'user-signout': (id) => confirmThen(t('confirmSignOut'), `/api/admin/users/${id}/sign-out`, {}, t('forceSignOut')),
    'user-disable': (id) => rowAction(`/api/admin/users/${id}`, { isActive: false }),
    'user-enable': (id) => rowAction(`/api/admin/users/${id}`, { isActive: true }),

    'branch-new': () =>
      openDialog({
        title: t('newBranch'),
        submitLabel: t('create'),
        fields: [
          { name: 'companyId', label: t('company'), type: 'select', options: companyOptions(), required: true },
          { name: 'nameEn', label: t('nameEn'), required: true },
          { name: 'nameAr', label: t('nameAr'), optional: true },
          { name: 'code', label: t('code'), required: true, placeholder: 'ALX-2' },
          { name: 'city', label: t('city'), optional: true },
        ],
        onSubmit: (v) => mutate('/api/admin/branches', v),
      }),
    'branch-disable': (id) => rowAction(`/api/admin/branches/${id}`, { isActive: false }),
    'branch-enable': (id) => rowAction(`/api/admin/branches/${id}`, { isActive: true }),

    'wp-new': () => {
      const firstCompany = state.companies[0] ? state.companies[0].id : '';
      openDialog({
        title: t('newWorkplace'),
        submitLabel: t('create'),
        fields: [
          { name: 'companyId', label: t('company'), type: 'select', options: companyOptions(), value: firstCompany, required: true },
          { name: 'branchId', label: t('branch'), type: 'select', options: branchOptions(firstCompany, true), optional: true },
          { name: 'nameEn', label: t('nameEn'), required: true },
          { name: 'nameAr', label: t('nameAr'), optional: true },
          { name: 'workplaceType', label: t('type'), type: 'select', options: WP_TYPES.map((x) => [x, t('wp_' + x)]), value: 'office' },
          { name: 'geo', label: t('useMyLocation'), type: 'button' },
          { name: 'latitude', label: t('latitude'), type: 'number', step: 'any', min: -90, max: 90, required: true },
          { name: 'longitude', label: t('longitude'), type: 'number', step: 'any', min: -180, max: 180, required: true },
          { name: 'radiusMeters', label: t('radius'), type: 'number', value: 150, min: 20, max: 5000 },
          { name: 'authorizeAllEmployees', label: t('authorizeAll'), type: 'checkbox', value: true },
        ],
        onOpen: geoButton,
        onChange: (v, form) => {
          if (form.dataset.company !== v.companyId) {
            form.dataset.company = v.companyId;
            setOptions(form, 'branchId', branchOptions(v.companyId, true));
          }
        },
        onSubmit: (v) => mutate('/api/admin/workplaces', v),
      });
    },
    'wp-edit': (id) => {
      const w = state.workplacesCache.find((x) => x.id === id);
      openDialog({
        title: `${t('editWorkplace')} — ${nameOf(w)}`,
        fields: [
          { name: 'geo', label: t('useMyLocation'), type: 'button' },
          { name: 'latitude', label: t('latitude'), type: 'number', step: 'any', min: -90, max: 90, value: w.latitude, required: true },
          { name: 'longitude', label: t('longitude'), type: 'number', step: 'any', min: -180, max: 180, value: w.longitude, required: true },
          { name: 'radiusMeters', label: t('radius'), type: 'number', min: 20, max: 5000, value: Math.round(w.radius_meters), required: true },
        ],
        onOpen: geoButton,
        onSubmit: (v) => mutate(`/api/admin/workplaces/${id}`, v),
      });
    },
    'wp-disable': (id) => rowAction(`/api/admin/workplaces/${id}`, { isActive: false }),
    'wp-enable': (id) => rowAction(`/api/admin/workplaces/${id}`, { isActive: true }),

    'shift-new': () => {
      const firstCompany = state.companies[0] ? state.companies[0].id : '';
      openDialog({
        title: t('newShift'),
        submitLabel: t('create'),
        fields: [
          { name: 'companyId', label: t('company'), type: 'select', options: companyOptions(), value: firstCompany, required: true },
          { name: 'branchId', label: t('branch'), type: 'select', options: branchOptions(firstCompany, true), optional: true },
          { name: 'nameEn', label: t('nameEn'), optional: true },
          { name: 'nameAr', label: t('nameAr'), optional: true },
          { name: 'startTime', label: t('startTime'), type: 'time', value: '09:00', required: true },
          { name: 'endTime', label: t('endTime'), type: 'time', value: '17:00', required: true },
          { name: 'gracePeriodMinutes', label: t('grace'), type: 'number', value: 15, min: 0, max: 180 },
        ],
        onChange: (v, form) => {
          if (form.dataset.company !== v.companyId) {
            form.dataset.company = v.companyId;
            setOptions(form, 'branchId', branchOptions(v.companyId, true));
          }
        },
        onSubmit: (v) => mutate('/api/admin/shifts', v),
      });
    },
    'shift-disable': (id) => rowAction(`/api/admin/shifts/${id}`, { isActive: false }),
    'shift-enable': (id) => rowAction(`/api/admin/shifts/${id}`, { isActive: true }),

    'device-approve': (id) => rowAction(`/api/admin/devices/${id}`, { status: 'approved' }),
    'device-revoke': (id) => rowAction(`/api/admin/devices/${id}`, { status: 'revoked' }),

    'pay-verify': (id) => rowAction(`/api/admin/payments/${id}/verify`, { decision: 'verify', extendDays: 30 }),
    'pay-reject': (id) => rowAction(`/api/admin/payments/${id}/verify`, { decision: 'reject' }),
  };

  // --------------------------------------------------------------------------
  // Shell: language, navigation, session
  // --------------------------------------------------------------------------
  function syncSectionMeta() {
    const titleEl = $('admin-page-title');
    const crumbEl = $('admin-breadcrumb');
    if (titleEl) titleEl.textContent = t('sec_' + state.section);
    if (crumbEl) crumbEl.textContent = `WE HR ADMIN / ${String(state.section).toUpperCase()}`;
    document.querySelectorAll('[data-admin-rail]').forEach((b) => {
      b.classList.toggle('active', b.dataset.adminRail === state.section);
    });
  }

  function applyLanguage() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
    $('btn-lang').textContent = t('langToggle');
    if ($('btn-login-lang')) $('btn-login-lang').textContent = t('langToggle');
    document.querySelectorAll('#admin-nav button').forEach((b) => {
      const count = b.querySelector('.nav-count');
      b.textContent = t('sec_' + b.dataset.section);
      if (count) b.appendChild(count);
    });
    if (state.user) $('admin-user-badge').textContent = `${state.user.email} · ${t('role_' + state.user.role)}`;
    syncSectionMeta();
  }

  function updateNavCounts(metrics) {
    const set = (section, n) => {
      const b = document.querySelector(`#admin-nav [data-section="${section}"]`);
      let span = b.querySelector('.nav-count');
      if (!n) return span && span.remove();
      if (!span) {
        span = document.createElement('span');
        span.className = 'nav-count';
        b.appendChild(span);
      }
      span.textContent = n;
    };
    set('payments', metrics.pendingPayments);
    set('devices', metrics.pendingDevices);
  }

  async function render() {
    const main = $('admin-main');
    document.querySelectorAll('#admin-nav button').forEach((b) => {
      if (b.dataset.section === state.section) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    syncSectionMeta();
    if (!main.innerHTML) main.innerHTML = `<div class="card empty">${esc(t('loading'))}</div>`;
    await renderers[state.section](main);
  }

  function showSection(section) {
    state.section = SECTIONS.includes(section) ? section : 'overview';
    if (location.hash !== `#${state.section}`) history.replaceState(null, '', `#${state.section}`);
    $('admin-main').innerHTML = '';
    render();
  }

  function showConsole() {
    if ($('admin-login-wrap')) $('admin-login-wrap').classList.add('hidden');
    $('view-login').classList.add('hidden');
    $('view-console').classList.remove('hidden');
    $('btn-logout').classList.remove('hidden');
    $('admin-user-badge').classList.remove('hidden');
    applyLanguage();
    showSection(location.hash.slice(1));
  }

  function signOut() {
    state.token = null;
    state.user = null;
    storageSet('wehr_admin_token', null);
    storageSet('wehr_home_token', null);
    $('view-console').classList.add('hidden');
    if ($('admin-login-wrap')) $('admin-login-wrap').classList.remove('hidden');
    $('view-login').classList.remove('hidden');
    $('btn-logout').classList.add('hidden');
    $('admin-user-badge').classList.add('hidden');
    // In the mobile app everyone signs in on the unified start page
    if (bridge.available) window.location.href = '/';
  }

  async function restoreSession() {
    if (!state.token) return signOut();
    const res = await api('/api/auth/me');
    if (!res.ok || res.data.actor.role !== 'platform_super_admin') return signOut();
    state.user = res.data.actor;
    showConsole();
  }

  $('form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { email: $('login-user').value.trim(), password: $('login-pass').value },
    });
    if (!res.ok) return toast(res.data.message || 'Login failed', 'danger');
    if (res.data.user.role !== 'platform_super_admin') return toast(t('notAdmin'), 'danger');
    state.token = res.data.token;
    state.user = res.data.user;
    storageSet('wehr_admin_token', state.token);
    $('login-pass').value = '';
    showConsole();
  });

  $('btn-logout').addEventListener('click', signOut);
  if ($('btn-admin-rail-logout')) $('btn-admin-rail-logout').addEventListener('click', signOut);
  $('btn-lang').addEventListener('click', () => {
    state.lang = state.lang === 'ar' ? 'en' : 'ar';
    storageSet('wehr_lang', state.lang);
    applyLanguage();
    if (state.user) render();
  });
  if ($('btn-login-lang')) $('btn-login-lang').addEventListener('click', () => $('btn-lang').click());
  if ($('btn-admin-rail-lang')) $('btn-admin-rail-lang').addEventListener('click', () => $('btn-lang').click());
  $('admin-nav').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-section]');
    if (b) showSection(b.dataset.section);
  });
  document.querySelectorAll('[data-admin-rail]').forEach((b) => {
    b.addEventListener('click', () => showSection(b.dataset.adminRail));
  });
  $('admin-main').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-action]');
    if (b && actions[b.dataset.action]) actions[b.dataset.action](b.dataset.id);
  });
  window.addEventListener('hashchange', () => state.user && location.hash.slice(1) !== state.section && showSection(location.hash.slice(1)));

  if (bridge.available) {
    $('view-login').classList.add('hidden');
    if ($('admin-login-wrap')) $('admin-login-wrap').classList.add('hidden');
  }
  applyLanguage();
  restoreSession();
})();
