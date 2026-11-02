'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('../src/db/database');
const { createAppServer } = require('../src/server');

async function startServer() {
  const db = createDatabase(':memory:');
  const { server } = createAppServer(db);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function call(method, path, { token, body } = {}) {
    const resp = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: resp.status, data: await resp.json() };
  }

  async function login(email, password) {
    const { status, data } = await call('POST', '/api/auth/login', { body: { email, password } });
    return { status, token: data.token, data };
  }

  return { server, call, login, baseUrl };
}

test('Admin 1: Panel access is limited to platform super admins; admin page is served', async () => {
  const { server, call, login, baseUrl } = await startServer();
  try {
    const page = await fetch(`${baseUrl}/admin`);
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes('admin.js'));

    assert.equal((await call('GET', '/api/admin/overview')).status, 401);

    const hr = await login('hr@niledelta.eg', 'WeHR@2026');
    const denied = await call('GET', '/api/admin/users', { token: hr.token });
    assert.equal(denied.status, 403);
    assert.equal(denied.data.code, 'PLATFORM_ADMIN_ONLY');

    const admin = await login('nakkady', '123456');
    assert.equal(admin.status, 200);
    assert.equal(admin.data.user.role, 'platform_super_admin');
    const overview = await call('GET', '/api/admin/overview', { token: admin.token });
    assert.equal(overview.status, 200);
    assert.ok(overview.data.metrics.companies >= 2);

    // Platform admins are not advertised on the public demo-accounts list
    const demo = await call('GET', '/api/auth/demo-accounts');
    assert.ok(!demo.data.accounts.some((a) => a.role === 'platform_super_admin'));
  } finally {
    server.close();
  }
});

test('Admin 2: Company -> user lifecycle (create, login, role change revokes session, reset password, disable)', async () => {
  const { server, call, login } = await startServer();
  try {
    const { token } = await login('ezz', '123456');

    const company = await call('POST', '/api/admin/companies', {
      token,
      body: { nameEn: 'Delta Foods', nameAr: 'دلتا للأغذية', countryCode: 'EG', planCode: 'GROWTH', subscriptionDays: 60 },
    });
    assert.equal(company.status, 201);
    const companyId = company.data.company.id;
    assert.equal((await call('POST', '/api/admin/companies', { token, body: { nameEn: 'Delta Foods' } })).status, 409);

    const wp = await call('POST', '/api/admin/workplaces', {
      token,
      body: { companyId, nameEn: 'Factory', latitude: 30.0444, longitude: 31.2357, radiusMeters: 200 },
    });
    assert.equal(wp.status, 201);

    const created = await call('POST', '/api/admin/users', {
      token,
      body: { email: 'Worker1', password: 'secret1', role: 'employee', companyId, fullNameEn: 'Worker One' },
    });
    assert.equal(created.status, 201);
    assert.equal((await call('POST', '/api/admin/users', { token, body: { email: 'worker1', password: 'secret1', role: 'employee', companyId } })).status, 409);
    assert.equal((await call('POST', '/api/admin/users', { token, body: { email: 'shorty', password: '123', role: 'employee', companyId } })).data.code, 'WEAK_PASSWORD');

    const worker = await login('worker1', 'secret1');
    assert.equal(worker.status, 200);
    const ctx = await call('GET', '/api/employee/context', { token: worker.token });
    assert.equal(ctx.status, 200);
    assert.ok(JSON.stringify(ctx.data).includes(wp.data.workplaceId), 'new employee is authorized for the company workplace');

    // Promote to HR admin: old token is revoked, new login carries the new role
    assert.equal((await call('POST', `/api/admin/users/${created.data.userId}`, { token, body: { role: 'hr_admin' } })).status, 200);
    assert.equal((await call('GET', '/api/auth/me', { token: worker.token })).status, 401);
    assert.equal((await login('worker1', 'secret1')).data.user.role, 'hr_admin');

    // Platform/company boundary cannot be crossed by an update
    assert.equal(
      (await call('POST', `/api/admin/users/${created.data.userId}`, { token, body: { role: 'platform_super_admin' } })).data.code,
      'ROLE_SCOPE_CHANGE'
    );

    // Reset password
    assert.equal((await call('POST', `/api/admin/users/${created.data.userId}/password`, { token, body: { password: 'newpass9' } })).status, 200);
    assert.equal((await login('worker1', 'secret1')).status, 401);
    assert.equal((await login('worker1', 'newpass9')).status, 200);

    // Disable account
    assert.equal((await call('POST', `/api/admin/users/${created.data.userId}`, { token, body: { isActive: false } })).status, 200);
    assert.equal((await login('worker1', 'newpass9')).data.code, 'ACCOUNT_DEACTIVATED');

    const audit = await call('GET', '/api/admin/audit-logs?action=ADMIN_', { token });
    const actions = audit.data.auditLogs.map((a) => a.action);
    for (const a of ['ADMIN_COMPANY_CREATED', 'ADMIN_USER_CREATED', 'ADMIN_USER_UPDATED', 'ADMIN_PASSWORD_RESET', 'ADMIN_WORKPLACE_CREATED']) {
      assert.ok(actions.includes(a), `audit log contains ${a}`);
    }
  } finally {
    server.close();
  }
});

test('Admin 3: Lockout protection and company suspension', async () => {
  const { server, call, login } = await startServer();
  try {
    const ezz = await login('ezz', '123456');
    const users = (await call('GET', '/api/admin/users?companyId=platform', { token: ezz.token })).data.users;
    const ezzId = users.find((u) => u.email === 'ezz').id;
    const nakkadyId = users.find((u) => u.email === 'nakkady').id;
    const superId = users.find((u) => u.email === 'admin@wehr.cloud').id;

    assert.equal((await call('POST', `/api/admin/users/${ezzId}`, { token: ezz.token, body: { isActive: false } })).data.code, 'CANNOT_MODIFY_SELF');

    // Disable the other two admins; the last remaining one cannot be disabled by anyone
    assert.equal((await call('POST', `/api/admin/users/${superId}`, { token: ezz.token, body: { isActive: false } })).status, 200);
    assert.equal((await call('POST', `/api/admin/users/${nakkadyId}`, { token: ezz.token, body: { isActive: false } })).status, 200);
    assert.equal((await call('POST', `/api/admin/users/${ezzId}`, { token: ezz.token, body: { isActive: false } })).data.code, 'CANNOT_MODIFY_SELF');

    // Suspending a company blocks logins and signs out its existing sessions
    const hr = await login('hr@niledelta.eg', 'WeHR@2026');
    assert.equal((await call('POST', '/api/admin/companies/comp_nile', { token: ezz.token, body: { isActive: false } })).status, 200);
    assert.equal((await call('GET', '/api/auth/me', { token: hr.token })).status, 401);
    assert.equal((await login('hr@niledelta.eg', 'WeHR@2026')).data.code, 'COMPANY_INACTIVE');

    const sub = await call('POST', '/api/admin/companies/comp_riyadh/subscription', {
      token: ezz.token,
      body: { planCode: 'ENTERPRISE', status: 'active', expiryDate: '2030-12-31' },
    });
    assert.equal(sub.status, 200);
    assert.equal(sub.data.subscription.plan_code, 'ENTERPRISE');
  } finally {
    server.close();
  }
});
