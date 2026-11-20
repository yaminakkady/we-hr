'use strict';

/**
 * We HR — Fieldnote Ops Workspace & Employee Attendance Client Controller
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
    chartMode: localStorage.getItem('wehr_chart_mode') || 'dots',
    pulseFilter: 'all',
    range: 'today',
    searchQuery: '',
    selectedBranchId: null,
    selectedDeptId: null,
    collapsedBranches: {},
    activeQueueIndex: 0,
    lastOverviewData: null,
    lastLeavesData: null,
    lastDevicesData: null,
    lastEmployeesData: [],
    pendingQueueItems: [],
    liveTimer: null,
  };

  function t(key) {
    const dict = (window.WE_HR_I18N && window.WE_HR_I18N[state.lang]) || (window.WE_HR_I18N && window.WE_HR_I18N.ar) || {};
    return dict[key] || key;
  }

  function esc(val) {
    return String(val ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c]);
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function showAlert(message, type = 'success') {
    const box = document.getElementById('global-alert');
    if (!box) return;
    box.className = `alert alert-${type} ops-global-alert`;
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

  function formatLiveClockString() {
    const now = new Date();
    const formattedDate = now.toLocaleDateString(state.lang === 'ar' ? 'ar-EG' : 'en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const formattedTime = now.toLocaleTimeString(state.lang === 'ar' ? 'ar-EG' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${formattedDate} · ${formattedTime}`;
  }

  function updateMainHeaderMeta(tabName) {
    const labelMap = {
      overview: t('navOverview'),
      mobile: t('navMobileApp'),
      attendance: t('navAttendance'),
      employees: t('navEmployees'),
      workplaces: t('navWorkplaces'),
      leaves: t('navLeaves'),
      devices: t('navDevices'),
      subscription: t('navSubscription'),
    };
    const tenantTag = state.company
      ? (state.lang === 'ar' ? state.company.name_ar : state.company.name_en)
      : 'WE HR';
    setText('ops-breadcrumb', `${String(tenantTag).toUpperCase()} / ${String(tabName).toUpperCase()}`);
    setText('ops-page-title', labelMap[tabName] || tabName);
    setText('ops-live-datetime', formatLiveClockString());
  }

  function applyLocalization() {
    const dict = (window.WE_HR_I18N && window.WE_HR_I18N[state.lang]) || {};
    document.documentElement.lang = state.lang;
    document.documentElement.dir = dict.dir || 'rtl';

    setText('ui-app-title', t('appTitle'));
    setText('ui-app-tagline', t('tagline'));
    setText('btn-lang-toggle', t('langSwitch'));
    setText('btn-logout', t('logoutBtn'));

    setText('ui-login-title', t('loginTitle'));
    setText('ui-login-subtitle', t('loginSubtitle'));
    setText('ui-email-label', t('emailLabel'));
    setText('ui-password-label', t('passwordLabel'));
    setText('ui-signin-btn', t('signInBtn'));
    setText('ui-quick-demo-label', t('quickDemoLabel'));

    setText('tab-btn-overview', t('navOverview'));
    setText('tab-btn-mobile', t('navMobileApp'));
    setText('tab-btn-attendance', t('navAttendance'));
    setText('tab-btn-employees', t('navEmployees'));
    setText('tab-btn-workplaces', t('navWorkplaces'));
    setText('tab-btn-leaves', t('navLeaves'));
    setText('tab-btn-devices', t('navDevices'));
    setText('tab-btn-subscription', t('navSubscription'));

    setText('ui-ops-workspace-sub', t('opsWorkspaceSub'));
    setText('ui-side-workspace-lbl', t('opsSideWorkspace'));
    setText('ui-side-live-lbl', t('opsSideLive'));
    setText('ui-side-branches-lbl', t('opsSideBranches'));
    setText('branch-filter-chip', t('clearFilter'));

    const searchEl = document.getElementById('ops-quick-search');
    if (searchEl) searchEl.placeholder = t('opsSearchPlaceholder');

    setText('ui-live-present-lbl', t('opsLivePresent'));
    setText('ui-live-review-lbl', t('opsLiveReview'));
    setText('ui-live-rejected-lbl', t('opsLiveRejected'));

    setText('btn-range-today', t('opsRangeToday'));
    setText('btn-range-7d', t('opsRange7d'));
    setText('btn-range-30d', t('opsRange30d'));
    setText('btn-header-record-attendance', t('opsRecordAttendance'));

    setText('ui-hero-title', t('heroTitle'));
    setText('ui-leg-verified', t('legVerified'));
    setText('ui-leg-scheduled', t('legScheduled'));
    setText('ui-leg-flagged', t('legFlagged'));
    setText('ui-leg-review', t('legReview'));
    setText('btn-hero-open-register-top', t('heroOpenRegister'));
    setText('ui-kv-bio-lbl', t('heroKvBio'));
    setText('ui-kv-dist-lbl', t('heroKvDist'));
    setText('ui-kv-peak-lbl', t('heroKvPeak'));
    setText('hero-runs-subtitle', t('heroSubDesc'));
    setText('btn-hero-focus-queue', t('heroReviewQueueBtn'));
    setText('btn-hero-open-register', t('heroLogBtn'));

    setText('ui-workflows-title', t('workflowsTitle'));
    setText('btn-pulse-all-link', t('workflowsAllLink'));
    setText('pulse-tab-all', t('pulseFilterAll'));
    setText('pulse-tab-exc', t('pulseFilterExc'));
    setText('pulse-tab-ok', t('pulseFilterOk'));
    setText('ui-col-stream', t('colStream'));
    setText('ui-col-last24', t('colLast24'));
    setText('ui-col-pulse-status', t('colPulseStatus'));
    setText('ui-needs-you-title', t('needsYouTitle'));
    setText('btn-open-full-queue', t('openQueueBtn'));
    setText('ui-needs-you-footer', t('needsYouFooter'));

    setText('ui-recent-events-title', t('recentEventsTitle'));
    setText('th-emp', t('colEmployee'));
    setText('th-evt', t('colEventType'));
    setText('th-time', t('colServerTime'));
    setText('th-wp', t('colWorkplace'));
    setText('th-dist', t('colDistance'));
    setText('th-bio', t('colBiometric'));
    setText('th-status', t('colStatus'));
    setText('th-actions', t('colActions'));

    setText('ui-mobile-header', t('mobileHeader'));
    setText('ui-step1-location', t('step1Location'));
    setText('ui-step2-biometric', t('step2Biometric'));
    setText('ui-step3-submit', t('step3Submit'));
    setText('ui-scenario-label', t('scenarioLabel'));
    setText('opt-scen-inside', t('scenInsideHq'));
    setText('opt-scen-outside', t('scenOutside'));
    setText('opt-scen-poor', t('scenPoorAcc'));
    setText('opt-scen-stale', t('scenStale'));
    setText('opt-scen-mock', t('scenMock'));

    setText('ui-biomode-label', t('bioModeLabel'));
    setText('opt-bio-strong', t('bioStrong'));
    setText('opt-bio-pin', t('bioPinOnly'));
    setText('opt-bio-exc', t('bioExceptionMode'));
    setText('opt-bio-cancel', t('bioCanceled'));
    setText('opt-bio-shared', t('bioSharedDevice'));

    setText('ui-netmode-label', t('networkModeLabel'));
    setText('opt-net-online', t('netOnline'));
    setText('opt-net-offline', t('netOffline'));

    setText('btn-mob-checkin', t('btnCheckIn'));
    setText('btn-mob-checkout', t('btnCheckOut'));
    setText('btn-mob-breakstart', t('btnBreakStart'));
    setText('btn-mob-breakend', t('btnBreakEnd'));
    setText('btn-mob-sync-offline', t('btnSyncOffline'));

    setText('btn-export-csv', t('exportCsvBtn'));
    setText('ui-manual-corr-title', t('manualCorrectionTitle'));
    setText('ui-add-emp-title', t('addEmployeeTitle'));
    setText('ui-import-csv-title', t('importCsvTitle'));
    setText('ui-add-wp-title', t('addWorkplaceTitle'));
  }

  async function loadDemoAccounts() {
    const { ok, data } = await apiFetch('/api/auth/demo-accounts');
    if (!ok || !data.accounts) return;
    const container = document.getElementById('demo-accounts-list');
    if (!container) return;
    container.innerHTML = '';
    for (const acc of data.accounts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'demo-chip';
      const compName = state.lang === 'ar' ? acc.company_name_ar || 'منصة We HR العامة' : acc.company_name_en || 'Platform Super Admin';
      const empName = state.lang === 'ar' ? acc.full_name_ar || acc.email : acc.full_name_en || acc.email;
      btn.innerHTML = `
        <div style="font-weight:700;font-size:0.83rem;color:var(--obsidian);">${esc(empName)} <span class="badge badge-neutral">${esc(acc.role)}</span></div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.2rem;">${esc(compName)} — <code>${esc(acc.email)}</code></div>
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
      return `<span class="badge badge-lime">${t('bio_verified')}</span>`;
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
      accepted: 'badge-lime',
      needs_review: 'badge-warn',
      pending: 'badge-info',
      rejected: 'badge-danger',
    };
    return `<span class="badge ${map[status] || 'badge-info'}">${t('status_' + status)}</span>`;
  }

  // ==========================================================================
  // HIERARCHICAL BRANCHES -> DEPARTMENTS SIDEBAR TREE
  // ==========================================================================
  function getFilteredEventsAndEmployees() {
    const allEvents = (state.lastOverviewData && state.lastOverviewData.recentEvents) || [];
    const allEmps = state.lastEmployeesData || [];
    if (!state.selectedBranchId && !state.selectedDeptId) {
      return { events: allEvents, employees: allEmps };
    }
    const empMap = new Map();
    for (const e of allEmps) empMap.set(e.id, e);

    const employees = allEmps.filter((e) => {
      if (state.selectedDeptId) return e.department_id === state.selectedDeptId;
      if (state.selectedBranchId) return e.branch_id === state.selectedBranchId;
      return true;
    });

    const events = allEvents.filter((ev) => {
      const emp = empMap.get(ev.employee_id);
      const bId = (emp && emp.branch_id) || ev.branch_id;
      const dId = (emp && emp.department_id) || ev.department_id;
      if (state.selectedDeptId) return dId === state.selectedDeptId;
      if (state.selectedBranchId) return bId === state.selectedBranchId;
      return true;
    });

    return { events, employees };
  }

  function renderBranchesTree() {
    const brTree = document.getElementById('sidebar-branches-tree');
    const clearChip = document.getElementById('branch-filter-chip');
    if (clearChip) {
      clearChip.classList.toggle('hidden', !state.selectedBranchId && !state.selectedDeptId);
    }
    if (!brTree) return;

    const branches = (state.referenceData && state.referenceData.branches) || [];
    const depts = (state.referenceData && state.referenceData.departments) || [];
    const emps = state.lastEmployeesData || [];
    const allEvents = (state.lastOverviewData && state.lastOverviewData.recentEvents) || [];

    const empMap = new Map();
    for (const e of emps) empMap.set(e.id, e);

    const branchAlertSet = new Set();
    const deptAlertSet = new Set();
    for (const ev of allEvents) {
      if (['rejected', 'needs_review', 'pending'].includes(ev.sync_status)) {
        const emp = empMap.get(ev.employee_id);
        if (emp && emp.branch_id) branchAlertSet.add(emp.branch_id);
        if (emp && emp.department_id) deptAlertSet.add(emp.department_id);
      }
    }

    const folderSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
    const chevronSvg = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 12 15 18 9"/></svg>';

    brTree.innerHTML = branches
      .map((b) => {
        const bName = state.lang === 'ar' ? b.name_ar || b.name_en : b.name_en || b.name_ar;
        const bCount = emps.filter((e) => e.branch_id === b.id).length;
        const bDepts = depts.filter((d) => d.branch_id === b.id);
        const isCollapsed = Boolean(state.collapsedBranches[b.id]);
        const isBranchSelected = state.selectedBranchId === b.id && !state.selectedDeptId;
        const hasBranchAlert = branchAlertSet.has(b.id);

        const deptHtml = bDepts
          .map((d) => {
            const dName = state.lang === 'ar' ? d.name_ar || d.name_en : d.name_en || d.name_ar;
            const dCount = emps.filter((e) => e.department_id === d.id).length;
            const isDeptSelected = state.selectedDeptId === d.id;
            const hasDeptAlert = deptAlertSet.has(d.id);
            return `
              <button type="button" class="tree-dept-row ${isDeptSelected ? 'is-selected' : ''}" data-tree-branch="${esc(b.id)}" data-tree-dept="${esc(d.id)}">
                <span class="tree-row-left">
                  ${folderSvg}
                  <span class="tree-row-name">${esc(dName)}</span>
                </span>
                <span class="tree-row-right">
                  ${hasDeptAlert ? '<span class="tree-alert-dot" title="Active exceptions"></span>' : ''}
                  <span class="tree-count">${dCount}</span>
                </span>
              </button>
            `;
          })
          .join('');

        return `
          <div class="tree-branch-group ${isCollapsed ? 'is-collapsed' : ''}">
            <button type="button" class="tree-branch-row ${isBranchSelected ? 'is-selected' : ''}" data-tree-branch-row="${esc(b.id)}">
              <span class="tree-row-left">
                <span class="tree-chevron" data-tree-toggle="${esc(b.id)}">${chevronSvg}</span>
                ${folderSvg}
                <span class="tree-row-name">${esc(bName)}</span>
              </span>
              <span class="tree-row-right">
                ${hasBranchAlert ? '<span class="tree-alert-dot" title="Active exceptions"></span>' : ''}
                <span class="tree-count">${bCount || esc(b.code)}</span>
              </span>
            </button>
            ${bDepts.length ? `<div class="tree-dept-list">${deptHtml}</div>` : ''}
          </div>
        `;
      })
      .join('');

    brTree.querySelectorAll('[data-tree-branch-row]').forEach((rowBtn) => {
      rowBtn.addEventListener('click', (ev) => {
        const branchId = rowBtn.getAttribute('data-tree-branch-row');
        const toggleEl = ev.target.closest('[data-tree-toggle]');
        if (toggleEl) {
          state.collapsedBranches[branchId] = !state.collapsedBranches[branchId];
          renderBranchesTree();
          return;
        }
        const alreadyBranchOnly = state.selectedBranchId === branchId && !state.selectedDeptId;
        state.selectedBranchId = alreadyBranchOnly ? null : branchId;
        state.selectedDeptId = null;
        if (state.selectedBranchId) state.collapsedBranches[branchId] = false;
        applyOverviewFiltersAndRender();
      });
    });

    brTree.querySelectorAll('[data-tree-dept]').forEach((deptBtn) => {
      deptBtn.addEventListener('click', () => {
        const branchId = deptBtn.getAttribute('data-tree-branch');
        const deptId = deptBtn.getAttribute('data-tree-dept');
        const alreadyDept = state.selectedDeptId === deptId;
        state.selectedBranchId = alreadyDept ? null : branchId;
        state.selectedDeptId = alreadyDept ? null : deptId;
        applyOverviewFiltersAndRender();
      });
    });
  }

  // ==========================================================================
  // FIELDNOTE HERO 3-MODE ANIMATED CHART & 24H RAIL TICKS
  // ==========================================================================
  function buildHourlyBuckets(events) {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      verified: 0,
      flagged: 0,
      scheduled: 0,
      items: [],
    }));
    for (const evt of events || []) {
      const dt = new Date(evt.server_timestamp);
      const hr = Number.isNaN(dt.getTime()) ? 9 : dt.getHours();
      const b = buckets[Math.max(0, Math.min(23, hr))];
      b.items.push(evt);
      if (evt.sync_status === 'rejected' || evt.sync_status === 'needs_review' || evt.sync_status === 'pending') {
        b.flagged += 1;
      } else {
        b.verified += 1;
      }
    }
    const nowHour = new Date().getHours();
    [9, 10, 14, 17, 21].forEach((sh) => {
      if (sh > nowHour) {
        buckets[sh].scheduled = Math.max(buckets[sh].scheduled, 2);
      }
    });
    return { buckets, nowHour };
  }

  function renderRail24hTicks(buckets, nowHour) {
    const container = document.getElementById('rail-24h-ticks');
    if (!container) return;
    container.innerHTML = buckets
      .map((b, h) => {
        const cls = [];
        if (h === nowHour) cls.push('now');
        else if (b.flagged > 0) cls.push('alert');
        else if (b.verified > 0) cls.push('active');
        else if (h % 6 === 0) cls.push('major');
        return `<span class="${cls.join(' ')}" title="${String(h).padStart(2, '0')}:00"></span>`;
      })
      .join('');
  }

  function renderHeroChart(mode, events) {
    const stage = document.getElementById('hero-chart-canvas');
    if (!stage) return;
    const { buckets, nowHour } = buildHourlyBuckets(events);
    renderRail24hTicks(buckets, nowHour);

    const W = 640;
    const H = 206;
    const padL = mode === 'waves' ? 118 : 22;
    const padR = 16;
    const padT = 30;
    const padB = 26;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const stepX = plotW / 24;
    const nowMin = new Date().getMinutes();
    const nowX = padL + (nowHour + nowMin / 60) * stepX;
    const nowLabel = `${String(nowHour).padStart(2, '0')}:${String(nowMin).padStart(2, '0')}`;

    const flaggedEvent = (events || []).find((e) => e.sync_status === 'rejected' || e.sync_status === 'needs_review');
    const flaggedTime = flaggedEvent
      ? new Date(flaggedEvent.server_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      : null;

    let bodySvg = '';
    const monoFont = "'JetBrains Mono', ui-monospace, monospace";

    bodySvg += `<defs>
      <pattern id="weGridDots" width="10" height="10" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.85" fill="#DFE3EC"/>
      </pattern>
    </defs>`;
    bodySvg += `<rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="url(#weGridDots)" rx="10"/>`;

    if (mode === 'dots') {
      const maxStack = Math.max(7, ...buckets.map((b) => b.verified + b.flagged + b.scheduled));
      const rowH = Math.min(12.5, (plotH - 12) / maxStack);
      buckets.forEach((b, h) => {
        const cx = padL + h * stepX + stepX / 2;
        const delayBase = h * 14;
        let idx = 0;
        for (let i = 0; i < b.verified; i++) {
          const cy = padT + plotH - 8 - idx * rowH;
          bodySvg += `<circle class="chart-dot" style="--d:${delayBase + idx * 18}ms" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.9" fill="#1A1A1D"><title>${String(h).padStart(2, '0')}:00 · Verified (${b.verified})</title></circle>`;
          idx++;
        }
        for (let i = 0; i < b.flagged; i++) {
          const cy = padT + plotH - 8 - idx * rowH;
          bodySvg += `<circle class="chart-dot" style="--d:${delayBase + idx * 18}ms" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.1" fill="#F04438"><title>${String(h).padStart(2, '0')}:00 · Flagged (${b.flagged})</title></circle>`;
          idx++;
        }
        for (let i = 0; i < b.scheduled; i++) {
          const cy = padT + plotH - 8 - idx * rowH;
          bodySvg += `<circle class="chart-dot" style="--d:${delayBase + idx * 18}ms" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.5" fill="#FFFFFF" stroke="#9AA3B2" stroke-width="1.4"><title>${String(h).padStart(2, '0')}:00 · Scheduled</title></circle>`;
          idx++;
        }
        if (b.verified + b.flagged + b.scheduled === 0 && h % 2 === 0) {
          const cy = padT + plotH - 8;
          bodySvg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2" fill="#D2D7E0"/>`;
        }
      });
    } else if (mode === 'waves') {
      const groupsMap = new Map();
      for (const e of events || []) {
        const name = (state.lang === 'ar' ? e.workplace_name_ar || e.workplace_name_en : e.workplace_name_en || e.workplace_name_ar) || 'Main HQ';
        if (!groupsMap.has(name)) {
          groupsMap.set(name, { counts: new Array(24).fill(0), flags: new Array(24).fill(0), total: 0 });
        }
        const dt = new Date(e.server_timestamp);
        const hr = Math.max(0, Math.min(23, Number.isNaN(dt.getTime()) ? 9 : dt.getHours()));
        const entry = groupsMap.get(name);
        entry.counts[hr] += 1;
        entry.total += 1;
        if (e.sync_status === 'rejected' || e.sync_status === 'needs_review') entry.flags[hr] += 1;
      }
      if (groupsMap.size === 0) {
        groupsMap.set(state.lang === 'ar' ? 'المقر الرئيسي' : 'Main HQ', { counts: new Array(24).fill(0), flags: new Array(24).fill(0), total: 0 });
      }
      const streams = Array.from(groupsMap.entries()).slice(0, 5);
      const laneH = plotH / streams.length;

      streams.forEach(([name, entry], idx) => {
        const baseY = padT + (idx + 1) * laneH - 6;
        const maxVal = Math.max(1, ...entry.counts);
        const points = entry.counts.map((v, h) => ({
          x: padL + h * stepX + stepX / 2,
          y: baseY - (v / maxVal) * (laneH * 0.64),
          flagged: entry.flags[h] > 0,
        }));

        // Build solid path up to nowHour & dashed forecast path after
        const splitIdx = Math.max(0, Math.min(23, nowHour));
        let solidD = `M ${padL} ${baseY}`;
        let prevX = padL;
        let prevY = baseY;
        for (let h = 0; h <= splitIdx; h++) {
          const p = points[h];
          const midX = (prevX + p.x) / 2;
          solidD += ` C ${midX.toFixed(1)} ${prevY.toFixed(1)}, ${midX.toFixed(1)} ${p.y.toFixed(1)}, ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
          prevX = p.x;
          prevY = p.y;
        }
        const nowInterY = prevY;
        solidD += ` L ${nowX.toFixed(1)} ${nowInterY.toFixed(1)}`;
        const fillD = `${solidD} L ${nowX.toFixed(1)} ${baseY} L ${padL} ${baseY} Z`;

        bodySvg += `<line x1="${padL}" y1="${baseY.toFixed(1)}" x2="${W - padR}" y2="${baseY.toFixed(1)}" stroke="#E6E9EF" stroke-width="1"/>`;
        bodySvg += `<path d="${fillD}" fill="rgba(26,26,29,0.045)"/>`;
        bodySvg += `<path class="chart-wave-line" style="--d:${idx * 70}ms" d="${solidD}" fill="none" stroke="#1A1A1D" stroke-width="1.65" stroke-linecap="round"/>`;

        if (splitIdx < 23) {
          let dashD = `M ${nowX.toFixed(1)} ${nowInterY.toFixed(1)}`;
          let dPrevX = nowX;
          let dPrevY = nowInterY;
          for (let h = splitIdx + 1; h < 24; h++) {
            const p = points[h];
            const midX = (dPrevX + p.x) / 2;
            dashD += ` C ${midX.toFixed(1)} ${dPrevY.toFixed(1)}, ${midX.toFixed(1)} ${p.y.toFixed(1)}, ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
            dPrevX = p.x;
            dPrevY = p.y;
          }
          dashD += ` L ${padL + plotW} ${baseY}`;
          bodySvg += `<path d="${dashD}" fill="none" stroke="#BDC4D0" stroke-width="1.25" stroke-dasharray="3 3"/>`;
        }

        // Flagged anomaly peaks + lime intersection dot at NOW
        points.forEach((p, h) => {
          if (p.flagged && h <= splitIdx) {
            bodySvg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.8" fill="#F04438"/>`;
          }
        });
        bodySvg += `<circle cx="${nowX.toFixed(1)}" cy="${nowInterY.toFixed(1)}" r="3.4" fill="#D6F849" stroke="#1A1A1D" stroke-width="1.1"/>`;

        // Left lane title & count
        const shortName = name.length > 16 ? name.slice(0, 14) + '…' : name;
        bodySvg += `<text x="8" y="${(baseY - 11).toFixed(1)}" font-size="10" font-weight="600" fill="#1A1A1D" font-family="Inter,IBM Plex Sans Arabic,sans-serif">${esc(shortName)}</text>`;
        bodySvg += `<text x="8" y="${baseY.toFixed(1)}" font-size="8.5" fill="#7C8594" font-family="${monoFont}">${entry.total} PUNCHES</text>`;
      });
    } else {
      // True 3-Face Isometric 3D Columns (Slide 3)
      const maxTotal = Math.max(4, ...buckets.map((b) => b.verified + b.flagged + b.scheduled));
      const barW = Math.max(9, stepX * 0.52);
      const dx = 4.5;
      const dy = 4.5;

      buckets.forEach((b, h) => {
        const total = b.verified + b.flagged;
        const val = total || b.scheduled;
        const bx = padL + h * stepX + (stepX - barW - dx) / 2;
        if (!val) {
          const baseY = padT + plotH - 4;
          bodySvg += `<rect x="${bx.toFixed(1)}" y="${baseY.toFixed(1)}" width="${barW.toFixed(1)}" height="3" rx="1" fill="#E4E7EE"/>`;
          return;
        }
        const barH = Math.max(12, (val / maxTotal) * (plotH - 18));
        const by = padT + plotH - barH;
        const isAlert = b.flagged > 0;
        const isFuture = total === 0 && b.scheduled > 0;
        const isNow = h === nowHour;

        const topFill = isAlert ? '#FEE4E2' : isNow ? '#D6F849' : isFuture ? '#FFFFFF' : '#FFFFFF';
        const frontFill = isAlert ? '#FEF3F2' : isFuture ? '#FFFFFF' : '#EFF1F5';
        const sideFill = isAlert ? '#FECACA' : isFuture ? '#F3F4F6' : '#D5DBE4';
        const strokeCol = isAlert ? '#F04438' : isFuture ? '#B0B8C5' : '#8A93A2';
        const dashAttr = isFuture ? 'stroke-dasharray="2.5 2"' : '';

        const x1 = bx.toFixed(1);
        const y1 = by.toFixed(1);
        const x2 = (bx + barW).toFixed(1);
        const y2 = (by + barH).toFixed(1);
        const x1d = (bx + dx).toFixed(1);
        const y1d = (by - dy).toFixed(1);
        const x2d = (bx + barW + dx).toFixed(1);
        const y2d = (by + barH - dy).toFixed(1);

        bodySvg += `<g class="chart-iso-bar" style="--d:${h * 20}ms">
          <title>${String(h).padStart(2, '0')}:00 · Verified ${b.verified}, Flagged ${b.flagged}</title>
          <polygon points="${x1},${y1} ${x1d},${y1d} ${x2d},${y1d} ${x2},${y1}" fill="${topFill}" stroke="${strokeCol}" stroke-width="0.9" stroke-linejoin="round" ${dashAttr}/>
          <rect x="${x1}" y="${y1}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${frontFill}" stroke="${strokeCol}" stroke-width="0.9" ${dashAttr}/>
          <polygon points="${x2},${y1} ${x2d},${y1d} ${x2d},${y2d} ${x2},${y2}" fill="${sideFill}" stroke="${strokeCol}" stroke-width="0.9" stroke-linejoin="round" ${dashAttr}/>
          ${isAlert ? `<polygon points="${(bx + barW / 2).toFixed(1)},${(by - 9).toFixed(1)} ${(bx + barW / 2 - 4).toFixed(1)},${(by - 4).toFixed(1)} ${(bx + barW / 2 + 4).toFixed(1)},${(by - 4).toFixed(1)}" fill="#F04438"/>` : ''}
        </g>`;
      });
    }

    // X-Axis ticks (00..24)
    for (let h = 0; h <= 24; h += 3) {
      const lx = padL + h * stepX;
      bodySvg += `<text x="${lx.toFixed(1)}" y="${H - 7}" text-anchor="middle" font-size="9.5" fill="#9AA3B2" font-family="${monoFont}">${String(h).padStart(2, '0')}</text>`;
    }

    // NOW marker line & glossy pill
    bodySvg += `<line x1="${nowX.toFixed(1)}" y1="${padT - 5}" x2="${nowX.toFixed(1)}" y2="${padT + plotH}" stroke="#1A1A1D" stroke-width="1.2" stroke-dasharray="3 3"/>`;
    const pillX = Math.min(W - 86, Math.max(padL, nowX + 4));
    bodySvg += `<rect x="${pillX.toFixed(1)}" y="5" width="76" height="19" rx="9.5" fill="#1A1A1D"/>`;
    bodySvg += `<circle class="chart-now-dot" cx="${(pillX + 11).toFixed(1)}" cy="14.5" r="3" fill="#D6F849"/>`;
    bodySvg += `<text x="${(pillX + 19).toFixed(1)}" y="18" font-size="9.5" font-weight="600" fill="#FFFFFF" font-family="${monoFont}">NOW ${nowLabel}</text>`;

    // Anomaly callout pill
    if (flaggedEvent && flaggedTime) {
      const fx = Math.max(padL + 8, Math.min(W - 155, padL + 7.5 * stepX));
      bodySvg += `<rect x="${fx}" y="6" width="144" height="18" rx="9" fill="#FFFFFF" stroke="rgba(15,23,42,0.1)"/>`;
      bodySvg += `<circle cx="${fx + 10}" cy="15" r="3" fill="#F04438"/>`;
      bodySvg += `<text x="${fx + 18}" y="18" font-size="8.5" font-weight="600" fill="#1A1A1D" font-family="${monoFont}">${flaggedTime} · ${esc(flaggedEvent.rejection_code ? flaggedEvent.rejection_code.slice(0, 14) : 'NEEDS REVIEW')}</text>`;
    }

    stage.innerHTML = `<svg class="hero-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Attendance activity chart">${bodySvg}</svg>`;
  }

  function startLiveClockTimer() {
    if (state.liveTimer) clearInterval(state.liveTimer);
    state.liveTimer = setInterval(() => {
      const ws = document.getElementById('view-workspace');
      if (!ws || ws.classList.contains('hidden')) return;
      setText('ops-live-datetime', formatLiveClockString());
      const tabOv = document.getElementById('tab-overview');
      if (tabOv && !tabOv.classList.contains('hidden') && state.lastOverviewData) {
        const { events } = getFilteredEventsAndEmployees();
        renderHeroChart(state.chartMode, events);
      }
    }, 30000);
  }

  // ==========================================================================
  // ATTENDANCE STREAMS PULSE & NEEDS YOU DECISION QUEUE
  // ==========================================================================
  function renderWorkflowsPulse(events, employees) {
    const container = document.getElementById('workflows-pulse-list');
    if (!container) return;

    const query = state.searchQuery.trim().toLowerCase();
    const byEmp = new Map();
    for (const e of employees || []) {
      byEmp.set(e.id, { employee: e, events: [] });
    }
    for (const ev of events || []) {
      if (!byEmp.has(ev.employee_id)) {
        byEmp.set(ev.employee_id, {
          employee: {
            id: ev.employee_id,
            employee_code: ev.employee_code,
            full_name_ar: ev.full_name_ar,
            full_name_en: ev.full_name_en,
            workplace_name_ar: ev.workplace_name_ar,
            workplace_name_en: ev.workplace_name_en,
          },
          events: [],
        });
      }
      byEmp.get(ev.employee_id).events.push(ev);
    }

    let baseRows = Array.from(byEmp.values());
    if (query) {
      baseRows = baseRows.filter((r) =>
        `${r.employee.full_name_en || ''} ${r.employee.full_name_ar || ''} ${r.employee.employee_code || ''}`
          .toLowerCase()
          .includes(query)
      );
    }

    const excRows = baseRows.filter((r) => r.events.some((ev) => ev.sync_status === 'rejected' || ev.sync_status === 'needs_review' || ev.sync_status === 'pending'));
    const okRows = baseRows.filter((r) => r.events.length > 0 && r.events.every((ev) => ev.sync_status === 'accepted'));

    setText('pulse-count-all', String(baseRows.length));
    setText('pulse-count-exc', String(excRows.length));
    setText('pulse-count-ok', String(okRows.length));

    let rows = baseRows;
    if (state.pulseFilter === 'exceptions') rows = excRows;
    else if (state.pulseFilter === 'healthy') rows = okRows;

    if (!rows.length) {
      container.innerHTML = `<div style="padding:1.25rem;text-align:center;color:var(--text-muted);font-size:0.83rem;">${esc(t('noMatchingStreams'))}</div>`;
      return;
    }

    const streamIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

    container.innerHTML = rows
      .slice(0, 6)
      .map((row) => {
        const empName = state.lang === 'ar' ? row.employee.full_name_ar || row.employee.full_name_en : row.employee.full_name_en || row.employee.full_name_ar;
        const wpName =
          (state.lang === 'ar' ? row.employee.workplace_name_ar || row.employee.workplace_name_en : row.employee.workplace_name_en || row.employee.workplace_name_ar) || 'Workplace';
        const latest = row.events[0];

        const ticks = Array.from({ length: 24 }, (_, idx) => {
          const ev = row.events[idx % Math.max(1, row.events.length)];
          if (!row.events.length || idx < 24 - Math.min(20, row.events.length * 4)) {
            return '<span></span>';
          }
          if (!ev) return '<span class="ok"></span>';
          if (ev.sync_status === 'rejected') return '<span class="bad"></span>';
          if (ev.sync_status === 'needs_review' || ev.sync_status === 'pending') return '<span class="warn"></span>';
          return '<span class="ok"></span>';
        }).join('');

        let statusBadge = `<span class="badge badge-neutral">${esc(t('statusScheduled'))}</span>`;
        if (latest) {
          if (latest.sync_status === 'rejected') {
            statusBadge = `<span class="badge badge-danger"><span class="dot dot-coral"></span>${esc(latest.rejection_code || t('status_rejected'))}</span>`;
          } else if (latest.sync_status === 'needs_review' || latest.sync_status === 'pending') {
            statusBadge = `<span class="badge badge-lime">${esc(t('statusWaiting'))}</span>`;
          } else {
            statusBadge = `<span class="badge badge-success"><span class="dot dot-lime"></span>${esc(t('statusHealthy'))}</span>`;
          }
        }

        return `
          <div class="pulse-row">
            <div class="pulse-stream-left">
              <div class="pulse-icon-tile">${streamIcon}</div>
              <div style="min-width:0;">
                <div class="pulse-title">${esc(empName)}</div>
                <div class="pulse-sub">${esc(row.employee.employee_code || '')} · ${esc(wpName)}</div>
              </div>
            </div>
            <div class="barcode-strip" aria-hidden="true">${ticks}</div>
            <div>${statusBadge}</div>
          </div>
        `;
      })
      .join('');
  }

  function renderNeedsYouQueue(overviewData, leavesData, devicesData) {
    const queueEl = document.getElementById('needs-you-queue');
    const countBadge = document.getElementById('needs-you-count');
    const bellDot = document.getElementById('header-bell-dot');
    const navExcBadge = document.getElementById('nav-badge-exceptions');
    const navLvBadge = document.getElementById('nav-badge-leaves');
    if (!queueEl) return;

    const items = [];

    for (const ev of (overviewData && overviewData.recentEvents) || []) {
      if (['needs_review', 'pending'].includes(ev.sync_status)) {
        const empName = state.lang === 'ar' ? ev.full_name_ar || ev.full_name_en : ev.full_name_en || ev.full_name_ar;
        items.push({
          kind: 'attendance',
          id: ev.id,
          ref: ev.employee_code || 'ATT',
          time: new Date(ev.server_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
          title: `${t('evt_' + ev.event_type)} — ${empName}`,
          sub: ev.rejection_reason || ev.flags_json || 'Offline / flagged biometric or location review',
        });
      }
    }

    for (const lv of (leavesData && leavesData.leaveRequests) || []) {
      if (lv.status === 'pending') {
        const empName = state.lang === 'ar' ? lv.full_name_ar || lv.full_name_en : lv.full_name_en || lv.full_name_ar;
        items.push({
          kind: 'leave',
          id: lv.id,
          ref: `LV-${lv.days_count}d`,
          time: lv.start_date,
          title: `${String(lv.leave_type || 'LEAVE').toUpperCase()} · ${empName}`,
          sub: `${lv.start_date} → ${lv.end_date}${lv.reason ? ` · ${lv.reason}` : ''}`,
        });
      }
    }

    for (const dev of (devicesData && devicesData.devices) || []) {
      if (dev.status === 'pending') {
        const empName = state.lang === 'ar' ? dev.full_name_ar || dev.full_name_en : dev.full_name_en || dev.full_name_ar;
        items.push({
          kind: 'device',
          id: dev.id,
          ref: 'DEV',
          time: 'New',
          title: `Device · ${empName}`,
          sub: `${dev.device_model} (${dev.device_identifier})`,
        });
      }
    }

    state.pendingQueueItems = items;
    if (state.activeQueueIndex >= items.length) state.activeQueueIndex = 0;

    if (countBadge) countBadge.textContent = String(items.length);
    if (bellDot) bellDot.classList.toggle('hidden', items.length === 0);

    const attPending = items.filter((i) => i.kind === 'attendance').length;
    const lvPending = items.filter((i) => i.kind === 'leave').length;
    if (navExcBadge) {
      navExcBadge.textContent = String(attPending);
      navExcBadge.classList.toggle('hidden', attPending === 0);
    }
    if (navLvBadge) {
      navLvBadge.textContent = String(lvPending);
      navLvBadge.classList.toggle('hidden', lvPending === 0);
    }

    if (!items.length) {
      queueEl.innerHTML = `<div class="alert alert-success" style="margin-bottom:0.5rem;">${esc(t('noPendingDecisions'))}</div>`;
      return;
    }

    const canDecide = state.user && ['company_owner', 'hr_admin', 'branch_manager', 'supervisor'].includes(state.user.role);
    const activeItem = items[state.activeQueueIndex];
    const otherItems = items
      .map((item, origIdx) => ({ item, origIdx }))
      .filter((x) => x.origIdx !== state.activeQueueIndex)
      .slice(0, 3);

    const gripSvg = '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style="opacity:0.45;"><circle cx="5" cy="4" r="1.2"/><circle cx="10" cy="4" r="1.2"/><circle cx="5" cy="8" r="1.2"/><circle cx="10" cy="8" r="1.2"/><circle cx="5" cy="12" r="1.2"/><circle cx="10" cy="12" r="1.2"/></svg>';

    let html = `
      <div class="decision-item is-active">
        <div class="decision-meta">
          <span class="decision-meta-ref">${gripSvg} #${esc(activeItem.ref)}</span>
          <span>${esc(activeItem.time)}</span>
        </div>
        <div class="decision-title">${esc(activeItem.title)}</div>
        <div class="decision-sub">${esc(activeItem.sub)}</div>
        ${
          canDecide
            ? `<div class="decision-actions">
                <button type="button" class="btn-approve-pill" data-q-kind="${activeItem.kind}" data-q-id="${activeItem.id}" data-q-act="approve">
                  ${esc(t('approveKeyBtn'))} <span class="kbd-hint">↵</span>
                </button>
                <button type="button" class="btn-decline-pill" data-q-kind="${activeItem.kind}" data-q-id="${activeItem.id}" data-q-act="reject">
                  ${esc(t('declineKeyBtn'))} <span class="kbd-hint">Esc</span>
                </button>
              </div>`
            : ''
        }
      </div>
    `;

    for (const { item, origIdx } of otherItems) {
      html += `
        <div class="decision-item is-queued" data-promote-idx="${origIdx}" title="Click to focus / review">
          <div class="decision-meta">
            <span class="decision-meta-ref">${gripSvg} #${esc(item.ref)}</span>
            <span>${esc(item.time)}</span>
          </div>
          <div class="decision-title">${esc(item.title)}</div>
          <div class="decision-sub">${esc(item.sub)}</div>
        </div>
      `;
    }

    queueEl.innerHTML = html;

    queueEl.querySelectorAll('[data-q-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        executeDecisionItem(
          btn.getAttribute('data-q-kind'),
          btn.getAttribute('data-q-id'),
          btn.getAttribute('data-q-act')
        );
      });
    });

    queueEl.querySelectorAll('[data-promote-idx]').forEach((card) => {
      card.addEventListener('click', () => {
        state.activeQueueIndex = Number(card.getAttribute('data-promote-idx')) || 0;
        renderNeedsYouQueue(state.lastOverviewData, state.lastLeavesData, state.lastDevicesData);
      });
    });
  }

  async function executeDecisionItem(kind, id, action) {
    let res;
    if (kind === 'attendance') {
      res = await apiFetch('/api/attendance/review', {
        method: 'POST',
        body: JSON.stringify({ eventId: id, decision: action, notes: `Decided from Needs You queue (${action})` }),
      });
    } else if (kind === 'leave') {
      res = await apiFetch('/api/leaves/decide', {
        method: 'POST',
        body: JSON.stringify({ leaveId: id, decision: action }),
      });
    } else if (kind === 'device') {
      res = await apiFetch('/api/devices/status', {
        method: 'POST',
        body: JSON.stringify({ deviceId: id, status: action === 'approve' ? 'approved' : 'revoked' }),
      });
    }

    if (res && res.ok) {
      showAlert(`Decision recorded (${action}).`, 'success');
      loadOverview();
    } else if (res) {
      showAlert(res.data.message || 'Action failed', 'danger');
    }
  }

  function applyOverviewFiltersAndRender() {
    if (!state.lastOverviewData) return;
    renderBranchesTree();

    const data = state.lastOverviewData;
    const { events, employees } = getFilteredEventsAndEmployees();

    const verifiedBio = events.filter((e) => e.biometric_verified).length;
    const bioRate = events.length ? `${Math.round((verifiedBio / events.length) * 100)}%` : '—';
    const distEvents = events.filter((e) => typeof e.calculated_distance_meters === 'number');
    const avgDist = distEvents.length
      ? `${Math.round(distEvents.reduce((acc, e) => acc + e.calculated_distance_meters, 0) / distEvents.length)} m`
      : '—';
    const acceptedCount = events.filter((e) => e.sync_status === 'accepted').length;
    const m = data.metrics;

    setText('hero-total-runs', String(events.length));
    setText('hero-trend-badge', `${acceptedCount}/${events.length || 0} ${t('legVerified')}`);
    setText('hero-trend-note', `${m.presentCount}/${m.totalEmployees} ${t('opsLivePresent')}`);
    setText('hero-kv-bio-val', bioRate);
    setText('hero-kv-dist-val', avgDist);
    setText(
      'hero-kv-peak-val',
      events.length ? new Date(events[0].server_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '09:00'
    );

    const insightEl = document.getElementById('hero-insight-text');
    if (insightEl) {
      if (m.suspiciousOrRejected > 0 || m.pendingExceptions > 0 || m.pendingLeaves > 0) {
        insightEl.innerHTML =
          state.lang === 'ar'
            ? `<strong>${m.pendingExceptions + m.pendingLeaves} عناصر بانتظار قرارك</strong> · تم رصد <strong>${m.suspiciousOrRejected} محاولات مرفوضة/خارج السياج</strong>.`
            : `<strong>${m.pendingExceptions + m.pendingLeaves} items waiting on your decision</strong> · <strong>${m.suspiciousOrRejected} outside-geofence or flagged attempts</strong> recorded.`;
      } else {
        insightEl.innerHTML =
          state.lang === 'ar'
            ? `<strong>جميع عمليات الحضور مستقرة</strong> · نسبة الامتثال الجغرافي والحيوي مكتملة.`
            : `<strong>All attendance streams healthy</strong> · Geofence and biometric checks verified.`;
      }
    }

    renderHeroChart(state.chartMode, events);
    renderWorkflowsPulse(events, employees);
    renderNeedsYouQueue(data, state.lastLeavesData, state.lastDevicesData);

    // Recent Events Table
    const tbody = document.getElementById('tbody-recent-events');
    if (!tbody) return;
    tbody.innerHTML = '';
    const q = state.searchQuery.trim().toLowerCase();
    for (const evt of events) {
      const empName = state.lang === 'ar' ? evt.full_name_ar : evt.full_name_en;
      if (q && !`${empName} ${evt.employee_code} ${evt.workplace_name_en || ''}`.toLowerCase().includes(q)) {
        continue;
      }
      const tr = document.createElement('tr');
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
        <td><strong>${esc(empName)}</strong><br/><small>${esc(evt.employee_code)}</small></td>
        <td>${t('evt_' + evt.event_type)}</td>
        <td><small class="mono">${new Date(evt.server_timestamp).toLocaleString(state.lang === 'ar' ? 'ar-EG' : 'en-GB')}</small></td>
        <td>${esc(wpName)}</td>
        <td>${distText} ${evt.geofence_passed ? '✅' : '❌'}</td>
        <td>${renderBiometricBadge(evt)}</td>
        <td>
          ${renderSyncStatusBadge(evt.sync_status)}
          ${evt.rejection_reason ? `<div style="font-size:0.74rem;color:#991b1b;margin-top:0.2rem;">${esc(evt.rejection_reason)}</div>` : ''}
          ${flagsList.length ? `<div style="font-size:0.72rem;color:#854d0e;">⚠️ ${esc(flagsList.join(', '))}</div>` : ''}
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

  async function loadOverview() {
    if (state.user.role === 'platform_super_admin') {
      switchTab('subscription');
      return;
    }

    const [ovRes, lvRes, devRes, empRes, refRes] = await Promise.all([
      apiFetch('/api/dashboard/overview'),
      apiFetch('/api/leaves').catch(() => ({ ok: false })),
      apiFetch('/api/devices').catch(() => ({ ok: false })),
      apiFetch('/api/employees').catch(() => ({ ok: false })),
      apiFetch('/api/reference-data').catch(() => ({ ok: false })),
    ]);

    if (!ovRes.ok) return;
    const data = ovRes.data;
    state.lastOverviewData = data;
    state.lastLeavesData = lvRes.ok ? lvRes.data : null;
    state.lastDevicesData = devRes.ok ? devRes.data : null;
    state.lastEmployeesData = empRes.ok ? empRes.data.employees || [] : [];
    if (refRes.ok) state.referenceData = refRes.data;

    if (data.company) {
      state.company = data.company;
      setText('sidebar-company-name', state.lang === 'ar' ? data.company.name_ar : data.company.name_en);
      setText('ops-chrome-tenant', `${data.company.country_code || 'EG'} · ${data.company.timezone || 'Africa/Cairo'}`);
    }

    const m = data.metrics;
    setText('live-present-count', String(m.presentCount));
    setText('live-late-count', String(m.pendingExceptions));
    setText('live-alert-count', String(m.suspiciousOrRejected));
    setText('nav-badge-employees', String(m.totalEmployees));

    const kpiContainer = document.getElementById('overview-kpis');
    if (kpiContainer) {
      kpiContainer.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">${t('kpiTotalEmployees')}</div><div class="kpi-value">${m.totalEmployees}</div></div>
        <div class="kpi-card"><div class="kpi-label">${t('kpiPresent')}</div><div class="kpi-value" style="color:#1D4D14;">${m.presentCount}</div></div>
        <div class="kpi-card"><div class="kpi-label">${t('kpiAbsent')}</div><div class="kpi-value" style="color:#B42318;">${m.absentCount}</div></div>
        <div class="kpi-card"><div class="kpi-label">${t('kpiLate')}</div><div class="kpi-value" style="color:#854D0E;">${m.lateCount}</div></div>
        <div class="kpi-card"><div class="kpi-label">${t('kpiExceptions')}</div><div class="kpi-value" style="color:#B45309;">${m.pendingExceptions}</div></div>
        <div class="kpi-card"><div class="kpi-label">${t('kpiSuspicious')}</div><div class="kpi-value" style="color:#F04438;">${m.suspiciousOrRejected}</div></div>
        <div class="kpi-card"><div class="kpi-label">${t('kpiPendingLeaves')}</div><div class="kpi-value">${m.pendingLeaves}</div></div>
      `;
    }

    applyOverviewFiltersAndRender();
  }

  // ==========================================================================
  // MOBILE TERMINAL, ATTENDANCE REGISTER, EMPLOYEES, WORKPLACES, LEAVES, DEVICES, SUBSCRIPTION
  // ==========================================================================
  async function loadMobileAttendanceContext() {
    const { ok, data } = await apiFetch('/api/employee/context');
    const summaryEl = document.getElementById('mobile-context-summary');
    const wpSelect = document.getElementById('mobile-workplace-select');
    if (!summaryEl || !wpSelect) return;

    if (!ok) {
      summaryEl.innerHTML = `<div class="alert alert-warn">${data.message || 'No employee profile bound to this account.'}</div>`;
      return;
    }

    state.employee = data.employee;
    state.workplaces = data.authorizedWorkplaces || [];

    const empName = state.lang === 'ar' ? data.employee.full_name_ar : data.employee.full_name_en;
    setText('mobile-emp-badge', `${empName} (${data.employee.employee_code})`);

    const shiftName = data.shift
      ? state.lang === 'ar'
        ? `${data.shift.name_ar} (${data.shift.start_time} - ${data.shift.end_time})`
        : `${data.shift.name_en} (${data.shift.start_time} - ${data.shift.end_time})`
      : '-';

    summaryEl.innerHTML = `
      <div><strong>Shift / الوردية:</strong> ${esc(shiftName)} | <strong>Current State / الحالة الحالية:</strong> <span class="badge badge-info">${esc(data.todayRecord.current_state)}</span></div>
      <div style="margin-top:0.25rem;"><strong>Biometric Policy:</strong> ${
        data.employee.allow_biometric_exception
          ? `<span class="badge badge-warn">HR Exception Enabled (${esc(data.employee.biometric_exception_reason || '')})</span>`
          : `<span class="badge badge-lime">Strict OS Biometric Required</span>`
      }</div>
    `;

    wpSelect.innerHTML = '';
    for (const wp of state.workplaces) {
      const opt = document.createElement('option');
      opt.value = wp.id;
      opt.textContent = `${state.lang === 'ar' ? wp.name_ar : wp.name_en} (Radius: ${wp.radius_meters}m)`;
      wpSelect.appendChild(opt);
    }

    updateMobileGpsPreview();
    renderOfflineQueue();
  }

  function computeSimulatedCoordinates() {
    const wpSel = document.getElementById('mobile-workplace-select');
    const wpId = wpSel ? wpSel.value : '';
    const wp = state.workplaces.find((w) => w.id === wpId) || state.workplaces[0] || {
      id: 'wp_cairo_hq',
      latitude: 29.9697,
      longitude: 31.2761,
      radius_meters: 150,
    };

    const scenEl = document.getElementById('mobile-loc-scenario');
    const scenario = scenEl ? scenEl.value : 'inside';
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
        locationTimestamp: new Date(nowMs - 360000).toISOString(),
        isMockLocation: false,
      };
    }
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
    if (!box) return;
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
          ✅ <strong>${esc(data.code)}:</strong> ${esc(data.message)}<br/>
          <small>Server Timestamp: <code>${esc(v.serverTimestamp)}</code> | Distance: <code>${v.distanceMeters}m / ${v.permittedRadiusMeters}m</code> | Biometric Verified: <code>${v.biometricVerified}</code> | Status: <code>${esc(v.syncStatus)}</code></small>
        </div>
      `;
      loadMobileAttendanceContext();
    } else {
      resultBox.innerHTML = `
        <div class="alert alert-danger">
          ❌ <strong>Rejected (${esc(data.code)}):</strong> ${esc(data.message)}
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
      if (ok) acceptedCount++;
      else rejectedCount++;
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
        <td>${esc(r.attendance_date)}</td>
        <td><strong>${esc(empName)}</strong> (${esc(r.employee_code)})</td>
        <td>${esc(state.lang === 'ar' ? r.branch_name_ar || '-' : r.branch_name_en || '-')}</td>
        <td><small>${r.first_check_in_at ? new Date(r.first_check_in_at).toLocaleTimeString() : '-'}</small></td>
        <td><small>${r.last_check_out_at ? new Date(r.last_check_out_at).toLocaleTimeString() : '-'}</small></td>
        <td><code>${esc(r.current_state)}</code></td>
        <td>${r.late_minutes}</td>
        <td>${r.overtime_minutes}</td>
        <td><span class="badge ${r.status === 'present' ? 'badge-lime' : r.status === 'late' ? 'badge-warn' : 'badge-danger'}">${esc(r.status)}</span></td>
        <td><small>${esc(r.exception_notes || '-')}</small></td>
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
          <td>${esc(state.lang === 'ar' ? c.full_name_ar : c.full_name_en)} (${esc(c.employee_code)})</td>
          <td><code>${esc(c.correction_type)}</code></td>
          <td><small><code>${esc(c.original_value_json)}</code></small></td>
          <td><small><code>${esc(c.corrected_value_json)}</code></small></td>
          <td>${esc(c.reason)}</td>
          <td><small>${esc(c.approver_email || '-')}</small></td>
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
      if (brSel) {
        brSel.innerHTML = refRes.data.branches
          .map((b) => `<option value="${b.id}">${esc(state.lang === 'ar' ? b.name_ar : b.name_en)}</option>`)
          .join('');
      }
      if (shSel) {
        shSel.innerHTML = refRes.data.shifts
          .map((s) => `<option value="${s.id}">${esc(state.lang === 'ar' ? s.name_ar : s.name_en)}</option>`)
          .join('');
      }
    }
    if (wpRes.ok) {
      const wpSel = document.getElementById('emp-workplace');
      if (wpSel) {
        wpSel.innerHTML = wpRes.data.workplaces
          .map((w) => `<option value="${w.id}">${esc(state.lang === 'ar' ? w.name_ar : w.name_en)}</option>`)
          .join('');
      }
    }
    if (!empRes.ok) return;
    state.employeesList = empRes.data.employees || [];
    state.lastEmployeesData = state.employeesList;

    const corrEmpSel = document.getElementById('corr-employee-id');
    if (corrEmpSel) {
      corrEmpSel.innerHTML = state.employeesList
        .map((e) => `<option value="${e.id}">${esc(e.employee_code)} — ${esc(state.lang === 'ar' ? e.full_name_ar : e.full_name_en)}</option>`)
        .join('');
    }

    const tbody = document.getElementById('tbody-employees');
    if (!tbody) return;
    tbody.innerHTML = '';
    const q = state.searchQuery.trim().toLowerCase();
    for (const e of state.employeesList) {
      if (q && !`${e.employee_code} ${e.full_name_en} ${e.full_name_ar} ${e.email || ''}`.toLowerCase().includes(q)) {
        continue;
      }
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${esc(e.employee_code)}</strong></td>
        <td>${esc(e.full_name_ar)}<br/><small>${esc(e.full_name_en)} (${esc(e.email || '')})</small></td>
        <td>${esc(state.lang === 'ar' ? e.job_title_ar : e.job_title_en)}</td>
        <td>${esc(state.lang === 'ar' ? e.branch_name_ar || '-' : e.branch_name_en || '-')}</td>
        <td>${esc(state.lang === 'ar' ? e.workplace_name_ar || '-' : e.workplace_name_en || '-')}</td>
        <td>${
          e.allow_biometric_exception
            ? `<span class="badge badge-warn">Exception Allowed</span>`
            : `<span class="badge badge-lime">Biometric Strict</span>`
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
        <td><code>${esc(w.code)}</code></td>
        <td><strong>${esc(w.name_ar)}</strong><br/><small>${esc(w.name_en)}</small></td>
        <td>${esc(w.workplace_type)}</td>
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
        <td><strong>${esc(state.lang === 'ar' ? lv.full_name_ar : lv.full_name_en)}</strong> (${esc(lv.employee_code)})</td>
        <td>${esc(lv.leave_type)}</td>
        <td>${esc(lv.start_date)}</td>
        <td>${esc(lv.end_date)}</td>
        <td>${lv.days_count}</td>
        <td>${esc(lv.reason || '-')}</td>
        <td><span class="badge ${lv.status === 'approved' ? 'badge-lime' : lv.status === 'rejected' ? 'badge-danger' : 'badge-warn'}">${esc(lv.status)}</span></td>
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
          <td><strong>${esc(state.lang === 'ar' ? d.full_name_ar : d.full_name_en)}</strong> (${esc(d.employee_code)})</td>
          <td><code>${esc(d.device_identifier)}</code></td>
          <td>${esc(d.device_model)} (${esc(d.os_version || d.platform)})</td>
          <td>HW: ${d.biometric_hardware_available ? '✅' : '❌'} | Enrolled: ${d.biometric_enrolled ? '✅' : '❌'}</td>
          <td><span class="badge ${d.status === 'approved' ? 'badge-lime' : d.status === 'revoked' ? 'badge-danger' : 'badge-warn'}">${esc(d.status)}</span></td>
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
          <td><code>${esc(log.actor_role || '-')}</code></td>
          <td><strong>${esc(log.action)}</strong></td>
          <td>${esc(log.target_type)} (${esc(log.target_id || '-')})</td>
          <td><small><code>${esc(log.details_json)}</code></small></td>
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
              (tn) =>
                `<li><strong>${esc(tn.name_en)} (${esc(tn.name_ar)})</strong> — Plan: ${esc(tn.plan_name_en)} | Status: <span class="badge badge-lime">${esc(tn.sub_status)}</span> | Expires: ${esc(tn.expiry_date)}</li>`
            )
            .join('')}
        </ul>
      `;
    } else if (data.subscription) {
      const s = data.subscription;
      box.innerHTML = `
        <div class="form-grid">
          <div><strong>Plan:</strong> ${esc(state.lang === 'ar' ? s.plan_name_ar : s.plan_name_en)} (${esc(s.plan_code)})</div>
          <div><strong>Status:</strong> <span class="badge badge-lime">${esc(s.status)}</span></div>
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
        <td><strong>${p.amount} ${esc(p.currency)}</strong></td>
        <td><code>${esc(p.payment_method)}</code></td>
        <td><code>${esc(p.reference_number)}</code></td>
        <td><span class="badge ${p.verification_status === 'verified' ? 'badge-lime' : 'badge-warn'}">${esc(p.verification_status)}</span></td>
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
    document.querySelectorAll('.rail-btn[data-rail-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-rail-tab') === tabName);
    });
    document.querySelectorAll('.tab-pane').forEach((pane) => {
      pane.classList.toggle('hidden', pane.id !== `tab-${tabName}`);
    });
    updateMainHeaderMeta(tabName);

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
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.classList.remove('hidden');

    const badge = document.getElementById('ui-user-badge');
    if (badge) {
      badge.classList.remove('hidden');
      badge.textContent = `${state.user.role}`;
    }

    const displayName = state.employee
      ? (state.lang === 'ar' ? state.employee.full_name_ar : state.employee.full_name_en)
      : state.user.email;
    setText('sidebar-user-name', displayName);
    setText('sidebar-user-role', state.user.role);
    setText(
      'sidebar-user-initials',
      String(displayName || 'HR')
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0] || '')
        .join('')
        .toUpperCase() || 'HR'
    );

    startLiveClockTimer();

    if (state.user.role === 'employee') {
      switchTab('mobile');
    } else if (state.user.role === 'platform_super_admin') {
      switchTab('subscription');
    } else {
      switchTab('overview');
    }
  }

  function signOut() {
    state.token = null;
    state.user = null;
    if (state.liveTimer) {
      clearInterval(state.liveTimer);
      state.liveTimer = null;
    }
    localStorage.removeItem('wehr_token');
    document.getElementById('view-workspace').classList.add('hidden');
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    const badge = document.getElementById('ui-user-badge');
    if (badge) badge.classList.add('hidden');
    document.getElementById('view-login').classList.remove('hidden');
  }

  function toggleLanguage() {
    state.lang = state.lang === 'ar' ? 'en' : 'ar';
    localStorage.setItem('wehr_lang', state.lang);
    applyLocalization();
    loadDemoAccounts();
    if (state.user) {
      const activeTab = document.querySelector('.nav-tab.active');
      if (activeTab) switchTab(activeTab.getAttribute('data-tab'));
    }
  }

  // Event Listeners (null-safe bindings)
  const langToggleBtn = document.getElementById('btn-lang-toggle');
  if (langToggleBtn) langToggleBtn.addEventListener('click', toggleLanguage);
  const railLangBtn = document.getElementById('btn-rail-lang');
  if (railLangBtn) railLangBtn.addEventListener('click', toggleLanguage);

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', signOut);
  const railLogoutBtn = document.getElementById('btn-rail-logout');
  if (railLogoutBtn) railLogoutBtn.addEventListener('click', signOut);

  const addBranchJumpBtn = document.getElementById('btn-add-branch-jump');
  if (addBranchJumpBtn) addBranchJumpBtn.addEventListener('click', () => switchTab('workplaces'));

  const clearFilterChip = document.getElementById('branch-filter-chip');
  if (clearFilterChip) {
    clearFilterChip.addEventListener('click', () => {
      state.selectedBranchId = null;
      state.selectedDeptId = null;
      applyOverviewFiltersAndRender();
    });
  }

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

  document.querySelectorAll('.rail-btn[data-rail-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-rail-tab')));
  });

  document.querySelectorAll('.chart-mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-chart-mode') === state.chartMode);
    btn.addEventListener('click', () => {
      state.chartMode = btn.getAttribute('data-chart-mode');
      localStorage.setItem('wehr_chart_mode', state.chartMode);
      document.querySelectorAll('.chart-mode-btn').forEach((b) =>
        b.classList.toggle('active', b.getAttribute('data-chart-mode') === state.chartMode)
      );
      if (state.lastOverviewData) {
        const { events } = getFilteredEventsAndEmployees();
        renderHeroChart(state.chartMode, events);
      }
    });
  });

  document.querySelectorAll('.pulse-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.pulseFilter = btn.getAttribute('data-pulse-filter');
      document.querySelectorAll('.pulse-filter-btn').forEach((b) =>
        b.classList.toggle('active', b.getAttribute('data-pulse-filter') === state.pulseFilter)
      );
      if (state.lastOverviewData) {
        const { events, employees } = getFilteredEventsAndEmployees();
        renderWorkflowsPulse(events, employees);
      }
    });
  });

  document.querySelectorAll('#ops-range-switcher button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.range = btn.getAttribute('data-range');
      document.querySelectorAll('#ops-range-switcher button').forEach((b) =>
        b.classList.toggle('active', b.getAttribute('data-range') === state.range)
      );
      loadOverview();
    });
  });

  const quickSearchEl = document.getElementById('ops-quick-search');
  if (quickSearchEl) {
    quickSearchEl.addEventListener('input', () => {
      state.searchQuery = quickSearchEl.value;
      const activeTab = document.querySelector('.nav-tab.active');
      const tabName = activeTab ? activeTab.getAttribute('data-tab') : 'overview';
      if (tabName === 'overview' && state.lastOverviewData) {
        applyOverviewFiltersAndRender();
      } else if (tabName === 'employees') {
        loadEmployeesTab();
      }
    });
  }

  document.addEventListener('keydown', (ev) => {
    const ws = document.getElementById('view-workspace');
    if (!ws || ws.classList.contains('hidden')) return;

    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
      if (quickSearchEl) {
        ev.preventDefault();
        quickSearchEl.focus();
      }
      return;
    }

    // Queue keyboard shortcuts (only when Overview is active and not typing in inputs/buttons)
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(tag)) return;
    const ovTab = document.getElementById('tab-overview');
    if (!ovTab || ovTab.classList.contains('hidden')) return;
    if (!state.pendingQueueItems.length) return;
    const canDecide = state.user && ['company_owner', 'hr_admin', 'branch_manager', 'supervisor'].includes(state.user.role);
    if (!canDecide) return;

    const active = state.pendingQueueItems[state.activeQueueIndex] || state.pendingQueueItems[0];
    if (ev.key === 'Enter') {
      ev.preventDefault();
      executeDecisionItem(active.kind, active.id, 'approve');
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      executeDecisionItem(active.kind, active.id, 'reject');
    }
  });

  const needsYouCard = document.getElementById('needs-you-card');
  const headerRecordBtn = document.getElementById('btn-header-record-attendance');
  if (headerRecordBtn) headerRecordBtn.addEventListener('click', () => switchTab('mobile'));
  const heroRegTopBtn = document.getElementById('btn-hero-open-register-top');
  if (heroRegTopBtn) heroRegTopBtn.addEventListener('click', () => switchTab('attendance'));
  const heroRegBtn = document.getElementById('btn-hero-open-register');
  if (heroRegBtn) heroRegBtn.addEventListener('click', () => switchTab('attendance'));
  const pulseAllBtn = document.getElementById('btn-pulse-all-link');
  if (pulseAllBtn) pulseAllBtn.addEventListener('click', () => switchTab('employees'));
  const openFullQueueBtn = document.getElementById('btn-open-full-queue');
  if (openFullQueueBtn) openFullQueueBtn.addEventListener('click', () => switchTab('attendance'));
  const heroFocusQueueBtn = document.getElementById('btn-hero-focus-queue');
  if (heroFocusQueueBtn) {
    heroFocusQueueBtn.addEventListener('click', () => {
      if (needsYouCard) needsYouCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  const headerBellBtn = document.getElementById('btn-header-bell');
  if (headerBellBtn) {
    headerBellBtn.addEventListener('click', () => {
      switchTab('overview');
      if (needsYouCard) needsYouCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

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
