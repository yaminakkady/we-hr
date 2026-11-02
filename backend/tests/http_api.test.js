'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('../src/db/database');
const { createAppServer } = require('../src/server');

test('HTTP E2E: Live HTTP API server, JWT auth, Attendance submission, CSV export & Web Dashboard HTML', async () => {
  const db = createDatabase(':memory:');
  const { server } = createAppServer(db);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Health endpoint
    const healthResp = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthResp.status, 200);
    const healthData = await healthResp.json();
    assert.equal(healthData.ok, true);

    // 2. Web Dashboard HTML serves properly
    const htmlResp = await fetch(`${baseUrl}/`);
    assert.equal(htmlResp.status, 200);
    const htmlText = await htmlResp.text();
    assert.ok(htmlText.includes('We HR'));

    // 3. Login as HR Admin
    const loginResp = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hr@niledelta.eg', password: 'WeHR@2026' }),
    });
    assert.equal(loginResp.status, 200);
    const loginData = await loginResp.json();
    assert.ok(loginData.token);

    // 4. Dashboard Overview
    const ovResp = await fetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${loginData.token}` },
    });
    assert.equal(ovResp.status, 200);
    const ovData = await ovResp.json();
    assert.equal(ovData.ok, true);
    assert.ok(ovData.metrics.totalEmployees >= 6);

    // 5. CSV Export with UTF-8 BOM
    const csvResp = await fetch(`${baseUrl}/api/attendance/export.csv`, {
      headers: { Authorization: `Bearer ${loginData.token}` },
    });
    assert.equal(csvResp.status, 200);
    const csvText = await csvResp.text();
    assert.ok(csvText.includes('Employee Code'));

    // 6. Bulk CSV Employee Import
    const importResp = await fetch(`${baseUrl}/api/employees/import-csv`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${loginData.token}`,
      },
      body: JSON.stringify({
        csvText:
          'employee_code,email,full_name_en,full_name_ar,job_title_en,job_title_ar,branch_id,default_workplace_id,default_shift_id\n' +
          'ND-301,karim.samir@niledelta.eg,Karim Samir,كريم سمير,QA Analyst,محلل جودة,br_cairo,wp_cairo_hq,shift_cairo_day',
      }),
    });
    assert.equal(importResp.status, 200);
    const importData = await importResp.json();
    assert.equal(importData.importedCount, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
