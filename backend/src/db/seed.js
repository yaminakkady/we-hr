'use strict';

/**
 * We HR — Multi-Tenant Seed Data Generator (Egypt & Saudi Arabia Tenants)
 */

const { hashPassword } = require('../security/auth');
const { getZonedDateParts } = require('../domain/attendance_rules');

/**
 * Seeds the database with initial subscription plans, two isolated tenant companies
 * (Egypt & Saudi Arabia), branches, departments, workplaces with geofences,
 * shifts (including overnight shift), users across all 6 RBAC roles, employees,
 * approved devices, and sample attendance records.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} [nowIso]
 */
function seedDatabase(db, nowIso = new Date().toISOString()) {
  const existingCount = db.prepare('SELECT COUNT(*) AS cnt FROM companies').get().cnt;
  if (existingCount > 0) {
    return { seeded: false };
  }

  const todayCairo = getZonedDateParts(nowIso, 'Africa/Cairo').dateStr;
  const defaultPassHash = hashPassword('WeHR@2026');

  db.exec('BEGIN');
  try {
    // 1. Subscription Plans
    const insertPlan = db.prepare(`
      INSERT INTO subscription_plans (
        id, code, name_en, name_ar, max_employees, max_workplaces, max_branches,
        biometric_enabled, offline_sync_enabled, csv_export_enabled,
        monthly_price_egp, monthly_price_sar, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);
    insertPlan.run(
      'plan_starter',
      'STARTER',
      'Starter SME Plan',
      'باقة الشركات الناشئة والصغيرة',
      25,
      3,
      2,
      1,
      1,
      1,
      1200,
      150,
      nowIso
    );
    insertPlan.run(
      'plan_growth',
      'GROWTH',
      'Growth Business Plan',
      'باقة نمو الأعمال والمصانع',
      150,
      15,
      10,
      1,
      1,
      1,
      3500,
      450,
      nowIso
    );
    insertPlan.run(
      'plan_enterprise',
      'ENTERPRISE',
      'Enterprise Multi-Branch Plan',
      'باقة المؤسسات متعددة الفروع',
      1000,
      100,
      50,
      1,
      1,
      1,
      8500,
      1100,
      nowIso
    );

    // 2. Companies (Tenant A: Egypt, Tenant B: Saudi Arabia)
    const insertCompany = db.prepare(`
      INSERT INTO companies (
        id, name_en, name_ar, slug, country_code, timezone, currency, default_locale,
        require_biometric_strict, require_approved_device, allow_offline_attendance,
        max_offline_age_hours, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    insertCompany.run(
      'comp_nile',
      'Nile Delta Manufacturing & Logistics',
      'شركة الدلتا للتصنيع والخدمات اللوجستية',
      'nile-delta-eg',
      'EG',
      'Africa/Cairo',
      'EGP',
      'ar',
      1,
      0,
      1,
      24,
      nowIso,
      nowIso
    );
    insertCompany.run(
      'comp_riyadh',
      'Al-Abraj Gulf Contracting Co.',
      'شركة الأبراج الخليجية للمقاولات',
      'alabraj-sa',
      'SA',
      'Asia/Riyadh',
      'SAR',
      'ar',
      1,
      1,
      1,
      24,
      nowIso,
      nowIso
    );

    // 3. Company Subscriptions & Manual Payment Record
    const futureExpiry = new Date(new Date(nowIso).getTime() + 60 * 86400000).toISOString();
    const insertSub = db.prepare(`
      INSERT INTO company_subscriptions (
        id, company_id, plan_id, status, start_date, expiry_date,
        grace_period_days, trial_enabled, renewal_reminder_sent, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `);
    insertSub.run(
      'sub_nile',
      'comp_nile',
      'plan_growth',
      'active',
      nowIso,
      futureExpiry,
      7,
      0,
      'Annual Growth subscription — Egypt Operations',
      nowIso,
      nowIso
    );
    insertSub.run(
      'sub_riyadh',
      'comp_riyadh',
      'plan_enterprise',
      'active',
      nowIso,
      futureExpiry,
      10,
      0,
      'Enterprise subscription — KSA Operations',
      nowIso,
      nowIso
    );

    db.prepare(`
      INSERT INTO payment_records (
        id, company_id, subscription_id, amount, currency, payment_method,
        reference_number, verification_status, verified_at, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'pay_nile_01',
      'comp_nile',
      'sub_nile',
      3500,
      'EGP',
      'instapay',
      'INSTA-EG-2026-994812',
      'verified',
      nowIso,
      'Verified InstaPay corporate transfer',
      nowIso
    );

    // 4. Branches
    const insertBranch = db.prepare(`
      INSERT INTO branches (
        id, company_id, name_en, name_ar, code, city, country_code, timezone, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);
    insertBranch.run('br_cairo', 'comp_nile', 'Cairo Maadi HQ', 'المقر الرئيسي - المعادي القاهرة', 'CAI-HQ', 'Cairo', 'EG', 'Africa/Cairo', nowIso);
    insertBranch.run('br_ramadan', 'comp_nile', '10th of Ramadan Factory', 'مصنع العاشر من رمضان', 'RAM-FAC', '10th of Ramadan', 'EG', 'Africa/Cairo', nowIso);
    insertBranch.run('br_alex', 'comp_nile', 'Alexandria Port Warehouse', 'مخازن ميناء الإسكندرية', 'ALX-WH', 'Alexandria', 'EG', 'Africa/Cairo', nowIso);
    insertBranch.run('br_riyadh', 'comp_riyadh', 'Riyadh Olaya HQ', 'الرياض - برج العليا', 'RUH-HQ', 'Riyadh', 'SA', 'Asia/Riyadh', nowIso);

    // 5. Departments
    const insertDept = db.prepare(`
      INSERT INTO departments (
        id, company_id, branch_id, name_en, name_ar, code, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `);
    insertDept.run('dept_eng', 'comp_nile', 'br_cairo', 'Engineering & Operations', 'الهندسة والعمليات', 'ENG', nowIso);
    insertDept.run('dept_hr', 'comp_nile', 'br_cairo', 'Human Resources', 'الموارد البشرية', 'HR', nowIso);
    insertDept.run('dept_mfg', 'comp_nile', 'br_ramadan', 'Factory Production Line', 'خط الإنتاج والتصنيع', 'MFG', nowIso);
    insertDept.run('dept_log', 'comp_nile', 'br_alex', 'Supply Chain & Warehousing', 'سلاسل الإمداد والمخازن', 'LOG', nowIso);
    insertDept.run('dept_ksa_ops', 'comp_riyadh', 'br_riyadh', 'Field Projects KSA', 'إدارة المشاريع الميدانية', 'KSA-OPS', nowIso);

    // 6. Work Shifts (Standard Day, Factory Morning, Factory Overnight Cross-Midnight)
    const insertShift = db.prepare(`
      INSERT INTO work_shifts (
        id, company_id, branch_id, name_en, name_ar, start_time, end_time,
        grace_period_minutes, early_departure_grace_minutes, min_overtime_minutes,
        max_break_minutes, is_overnight, working_days_json, timezone, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 30, 60, ?, '[0,1,2,3,4]', ?, 1, ?)
    `);
    insertShift.run('shift_cairo_day', 'comp_nile', 'br_cairo', 'Standard Day Shift (09:00 - 17:00)', 'الوردية الصباحية الإدارية (09:00 - 17:00)', '09:00', '17:00', 15, 10, 0, 'Africa/Cairo', nowIso);
    insertShift.run('shift_factory_morn', 'comp_nile', 'br_ramadan', 'Factory Morning Shift (07:00 - 15:00)', 'وردية المصنع الصباحية (07:00 - 15:00)', '07:00', '15:00', 10, 10, 0, 'Africa/Cairo', nowIso);
    insertShift.run('shift_factory_night', 'comp_nile', 'br_ramadan', 'Factory Overnight Shift (22:00 - 06:00)', 'الوردية الليلية للمصنع (22:00 - 06:00)', '22:00', '06:00', 15, 10, 1, 'Africa/Cairo', nowIso);
    insertShift.run('shift_riyadh_day', 'comp_riyadh', 'br_riyadh', 'KSA Standard Shift (08:30 - 16:30)', 'الدوام الرسمي - الرياض (08:30 - 16:30)', '08:30', '16:30', 15, 10, 0, 'Asia/Riyadh', nowIso);

    // 7. Workplaces with Geofences
    const insertWorkplace = db.prepare(`
      INSERT INTO workplaces (
        id, company_id, branch_id, code, name_en, name_ar, workplace_type,
        latitude, longitude, radius_meters, max_accuracy_meters, max_location_age_seconds,
        accuracy_buffer_policy, allowed_event_types_json, applicable_shifts_json,
        require_biometric, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 120, 'strict', '["check_in","check_out","break_start","break_end","field_visit"]', ?, 1, 1, ?)
    `);
    insertWorkplace.run(
      'wp_cairo_hq',
      'comp_nile',
      'br_cairo',
      'WP-CAI-01',
      'Cairo Maadi Technology Park HQ',
      'المقر الرئيسي - القرية التكنولوجية بالمعادي',
      'office',
      29.9697,
      31.2761,
      150,
      50,
      '["shift_cairo_day"]',
      nowIso
    );
    insertWorkplace.run(
      'wp_ramadan_factory',
      'comp_nile',
      'br_ramadan',
      'WP-RAM-01',
      '10th of Ramadan Industrial Zone A2',
      'مصنع المنطقة الصناعية A2 - العاشر من رمضان',
      'factory',
      30.2965,
      31.7418,
      250,
      60,
      '["shift_factory_morn","shift_factory_night"]',
      nowIso
    );
    insertWorkplace.run(
      'wp_alex_warehouse',
      'comp_nile',
      'br_alex',
      'WP-ALX-01',
      'Alexandria Logistics Hub Gate 4',
      'المركز اللوجستي بميناء الإسكندرية - بوابة 4',
      'warehouse',
      31.1975,
      29.8925,
      200,
      50,
      '["shift_cairo_day"]',
      nowIso
    );
    insertWorkplace.run(
      'wp_riyadh_hq',
      'comp_riyadh',
      'br_riyadh',
      'WP-RUH-01',
      'Riyadh Olaya Business Tower',
      'برج العليا للأعمال - الرياض',
      'office',
      24.7136,
      46.6753,
      150,
      50,
      '["shift_riyadh_day"]',
      nowIso
    );

    // 8. Users across all 6 roles
    const insertUser = db.prepare(`
      INSERT INTO users (
        id, company_id, email, phone, password_hash, role, branch_id, preferred_locale, is_active, token_version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)
    `);
    insertUser.run('usr_superadmin', null, 'admin@wehr.cloud', '+201000000000', defaultPassHash, 'platform_super_admin', null, 'ar', nowIso);
    insertUser.run('usr_nile_owner', 'comp_nile', 'owner@niledelta.eg', '+201001111111', defaultPassHash, 'company_owner', 'br_cairo', 'ar', nowIso);
    insertUser.run('usr_nile_hr', 'comp_nile', 'hr@niledelta.eg', '+201002222222', defaultPassHash, 'hr_admin', 'br_cairo', 'ar', nowIso);
    insertUser.run('usr_nile_bm_cairo', 'comp_nile', 'manager.cairo@niledelta.eg', '+201003333333', defaultPassHash, 'branch_manager', 'br_cairo', 'ar', nowIso);
    insertUser.run('usr_nile_sup', 'comp_nile', 'supervisor@niledelta.eg', '+201004444444', defaultPassHash, 'supervisor', 'br_cairo', 'ar', nowIso);
    insertUser.run('usr_emp_ahmed', 'comp_nile', 'ahmed.saeed@niledelta.eg', '+201005555555', defaultPassHash, 'employee', 'br_cairo', 'ar', nowIso);
    insertUser.run('usr_emp_mahmoud', 'comp_nile', 'mahmoud.fathy@niledelta.eg', '+201006666666', defaultPassHash, 'employee', 'br_ramadan', 'ar', nowIso);
    insertUser.run('usr_emp_sara', 'comp_nile', 'sara.kamal@niledelta.eg', '+201007777777', defaultPassHash, 'employee', 'br_cairo', 'ar', nowIso);
    insertUser.run('usr_emp_omar', 'comp_nile', 'omar.hassan@niledelta.eg', '+201008888888', defaultPassHash, 'employee', 'br_alex', 'ar', nowIso);

    // Owner platform admins (username logins) for the /admin control panel.
    // Password comes from SEED_ADMIN_PASSWORD when set (e.g. in Render), otherwise 123456.
    const ownerAdminPassHash = hashPassword(process.env.SEED_ADMIN_PASSWORD || '123456');
    insertUser.run('usr_platform_ezz', null, 'ezz', null, ownerAdminPassHash, 'platform_super_admin', null, 'ar', nowIso);
    insertUser.run('usr_platform_nakkady', null, 'nakkady', null, ownerAdminPassHash, 'platform_super_admin', null, 'ar', nowIso);

    // Tenant B (Saudi Arabia) users
    insertUser.run('usr_riyadh_hr', 'comp_riyadh', 'hr@alabraj.sa', '+966501112233', defaultPassHash, 'hr_admin', 'br_riyadh', 'ar', nowIso);
    insertUser.run('usr_emp_yasser', 'comp_riyadh', 'yasser@alabraj.sa', '+966504445566', defaultPassHash, 'employee', 'br_riyadh', 'ar', nowIso);

    // 9. Employees
    const insertEmp = db.prepare(`
      INSERT INTO employees (
        id, user_id, company_id, branch_id, department_id, manager_id,
        default_workplace_id, authorized_workplace_ids_json, default_shift_id,
        employee_code, full_name_en, full_name_ar, job_title_en, job_title_ar,
        national_id_masked, hire_date, attendance_eligible, require_biometric,
        allow_biometric_exception, biometric_exception_reason, allow_field_visit,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2024-01-15', 1, ?, ?, ?, ?, 1, ?, ?)
    `);
    insertEmp.run(
      'emp_nile_owner', 'usr_nile_owner', 'comp_nile', 'br_cairo', 'dept_eng', null,
      'wp_cairo_hq', '["wp_cairo_hq","wp_ramadan_factory","wp_alex_warehouse"]', 'shift_cairo_day',
      'ND-001', 'Eng. Tarek El-Masry', 'م. طارق المصري', 'Chief Executive Officer', 'المدير التنفيذي',
      '2800101****123', 1, 0, null, 1, nowIso, nowIso
    );
    insertEmp.run(
      'emp_nile_hr', 'usr_nile_hr', 'comp_nile', 'br_cairo', 'dept_hr', 'emp_nile_owner',
      'wp_cairo_hq', '["wp_cairo_hq"]', 'shift_cairo_day',
      'ND-002', 'Nourhan Mahmoud', 'نورهان محمود', 'HR Director', 'مديرة الموارد البشرية',
      '2910512****451', 1, 0, null, 0, nowIso, nowIso
    );
    insertEmp.run(
      'emp_nile_bm', 'usr_nile_bm_cairo', 'comp_nile', 'br_cairo', 'dept_eng', 'emp_nile_owner',
      'wp_cairo_hq', '["wp_cairo_hq"]', 'shift_cairo_day',
      'ND-003', 'Khaled Hassan', 'خالد حسن', 'Cairo Branch Manager', 'مدير فرع القاهرة',
      '2870319****882', 1, 0, null, 1, nowIso, nowIso
    );
    insertEmp.run(
      'emp_nile_sup', 'usr_nile_sup', 'comp_nile', 'br_cairo', 'dept_eng', 'emp_nile_bm',
      'wp_cairo_hq', '["wp_cairo_hq"]', 'shift_cairo_day',
      'ND-004', 'Mostafa Adel', 'مصطفى عادل', 'Operations Supervisor', 'مشرف العمليات',
      '2930822****319', 1, 0, null, 1, nowIso, nowIso
    );
    insertEmp.run(
      'emp_ahmed', 'usr_emp_ahmed', 'comp_nile', 'br_cairo', 'dept_eng', 'emp_nile_sup',
      'wp_cairo_hq', '["wp_cairo_hq"]', 'shift_cairo_day',
      'ND-101', 'Ahmed Saeed', 'أحمد سعيد', 'Senior Quality Engineer', 'مهندس جودة أول',
      '2961104****774', 1, 0, null, 1, nowIso, nowIso
    );
    insertEmp.run(
      'emp_mahmoud', 'usr_emp_mahmoud', 'comp_nile', 'br_ramadan', 'dept_mfg', 'emp_nile_sup',
      'wp_ramadan_factory', '["wp_ramadan_factory"]', 'shift_factory_night',
      'ND-102', 'Mahmoud Fathy', 'محمود فتحي', 'Production Line Technician', 'فني خط إنتاج',
      '2940218****612', 1, 0, null, 0, nowIso, nowIso
    );
    insertEmp.run(
      'emp_sara', 'usr_emp_sara', 'comp_nile', 'br_cairo', 'dept_hr', 'emp_nile_hr',
      'wp_cairo_hq', '["wp_cairo_hq"]', 'shift_cairo_day',
      'ND-103', 'Sara Kamal', 'سارة كمال', 'Payroll & Personnel Specialist', 'أخصائية شؤون العاملين والرواتب',
      '2980710****903', 0, 1, 'HR-approved exception: handset fingerprint sensor hardware fault verified by IT', 0, nowIso, nowIso
    );
    insertEmp.run(
      'emp_omar', 'usr_emp_omar', 'comp_nile', 'br_alex', 'dept_log', 'emp_nile_sup',
      'wp_alex_warehouse', '["wp_alex_warehouse"]', 'shift_cairo_day',
      'ND-104', 'Omar Hassan', 'عمر حسان', 'Warehouse Coordinator', 'منسق مخازن ميناء الإسكندرية',
      '2950401****540', 1, 0, null, 0, nowIso, nowIso
    );

    // Tenant B Employees
    insertEmp.run(
      'emp_riyadh_hr', 'usr_riyadh_hr', 'comp_riyadh', 'br_riyadh', 'dept_ksa_ops', null,
      'wp_riyadh_hq', '["wp_riyadh_hq"]', 'shift_riyadh_day',
      'AB-001', 'Fahad Al-Otaibi', 'فهد العتيبي', 'KSA HR Manager', 'مدير الموارد البشرية - المملكة',
      '1089****44', 1, 0, null, 0, nowIso, nowIso
    );
    insertEmp.run(
      'emp_yasser', 'usr_emp_yasser', 'comp_riyadh', 'br_riyadh', 'dept_ksa_ops', 'emp_riyadh_hr',
      'wp_riyadh_hq', '["wp_riyadh_hq"]', 'shift_riyadh_day',
      'AB-101', 'Yasser Al-Qahtani', 'ياسر القحطاني', 'Site Civil Engineer', 'مهندس مدني موقع',
      '1094****81', 1, 0, null, 1, nowIso, nowIso
    );

    // 10. Approved Devices
    const insertDevice = db.prepare(`
      INSERT INTO approved_devices (
        id, company_id, employee_id, device_identifier, platform, device_model,
        os_version, biometric_hardware_available, biometric_enrolled, status, approved_by, last_used_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertDevice.run('dev_ahmed_01', 'comp_nile', 'emp_ahmed', 'ANDROID-SM-A546E-AHMED01', 'android', 'Samsung Galaxy A54 5G', 'Android 14', 1, 1, 'approved', 'usr_nile_hr', nowIso, nowIso);
    insertDevice.run('dev_mahmoud_01', 'comp_nile', 'emp_mahmoud', 'ANDROID-REDMI-NOTE13-MAH01', 'android', 'Xiaomi Redmi Note 13', 'Android 14', 1, 1, 'approved', 'usr_nile_hr', nowIso, nowIso);
    insertDevice.run('dev_sara_01', 'comp_nile', 'emp_sara', 'IOS-IPHONE13-SARA01', 'ios', 'iPhone 13', 'iOS 17.5', 0, 0, 'approved', 'usr_nile_hr', nowIso, nowIso);
    insertDevice.run('dev_omar_pending', 'comp_nile', 'emp_omar', 'ANDROID-REALME-11-OMAR01', 'android', 'Realme 11 Pro', 'Android 14', 1, 1, 'pending', null, null, nowIso);
    insertDevice.run('dev_yasser_01', 'comp_riyadh', 'emp_yasser', 'IOS-IPHONE15PRO-YASSER01', 'ios', 'iPhone 15 Pro', 'iOS 18.0', 1, 1, 'approved', 'usr_riyadh_hr', nowIso, nowIso);

    // 11. Sample Holidays (Egypt & KSA)
    const insertHoliday = db.prepare(`
      INSERT INTO holidays (id, company_id, branch_id, name_en, name_ar, holiday_date, is_paid, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `);
    insertHoliday.run('hol_eg_oct6', 'comp_nile', null, 'Armed Forces Day (6th of October)', 'عيد القوات المسلحة (6 أكتوبر)', '2026-10-06', nowIso);
    insertHoliday.run('hol_sa_nat', 'comp_riyadh', null, 'Saudi National Day', 'اليوم الوطني للمملكة العربية السعودية', '2026-09-23', nowIso);

    // 12. Sample Leave Request
    db.prepare(`
      INSERT INTO leave_requests (
        id, company_id, branch_id, employee_id, leave_type, start_date, end_date,
        days_count, reason, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      'lv_omar_01',
      'comp_nile',
      'br_alex',
      'emp_omar',
      'annual',
      '2026-11-10',
      '2026-11-12',
      3,
      'Family commitments in Alexandria / التزامات عائلية بالإسكندرية',
      nowIso
    );

    // 13. Sample Today Attendance Records & Events for Dashboard Demonstration
    const checkInOnTime = `${todayCairo}T06:55:00.000Z`; // 08:55 Cairo time (UTC+2)
    const checkInLate = `${todayCairo}T07:32:00.000Z`;   // 09:32 Cairo time (32 mins late, grace is 15m)

    db.prepare(`
      INSERT INTO attendance_records (
        id, company_id, branch_id, employee_id, shift_id, workplace_id,
        attendance_date, first_check_in_at, last_check_out_at, current_state,
        total_work_minutes, total_break_minutes, late_minutes, early_departure_minutes,
        overtime_minutes, status, has_exception, exception_notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'checked_in', 0, 0, ?, 0, 0, ?, ?, ?, ?, ?)
    `).run(
      'attrec_sup_today',
      'comp_nile',
      'br_cairo',
      'emp_nile_sup',
      'shift_cairo_day',
      'wp_cairo_hq',
      todayCairo,
      checkInOnTime,
      0,
      'present',
      0,
      null,
      checkInOnTime,
      checkInOnTime
    );

    db.prepare(`
      INSERT INTO attendance_events (
        id, company_id, branch_id, employee_id, attendance_record_id, workplace_id, shift_id,
        event_type, idempotency_key, server_timestamp, device_timestamp,
        latitude, longitude, accuracy_meters, location_timestamp,
        calculated_distance_meters, permitted_radius_meters, geofence_passed,
        is_mock_location, auth_method, biometric_verified, device_identifier,
        device_platform, is_offline_submission, sync_status, flags_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'check_in', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'biometric_strong', 1, 'ANDROID-PIXEL8-SUP01', 'android', 0, 'accepted', '[]', ?)
    `).run(
      'attevt_sup_in',
      'comp_nile',
      'br_cairo',
      'emp_nile_sup',
      'attrec_sup_today',
      'wp_cairo_hq',
      'shift_cairo_day',
      `seed-idem-sup-${todayCairo}`,
      checkInOnTime,
      checkInOnTime,
      29.9698,
      31.2762,
      11.5,
      checkInOnTime,
      14.72,
      150,
      checkInOnTime
    );

    // Late check-in for Sara Kamal (using authorized biometric exception)
    db.prepare(`
      INSERT INTO attendance_records (
        id, company_id, branch_id, employee_id, shift_id, workplace_id,
        attendance_date, first_check_in_at, last_check_out_at, current_state,
        total_work_minutes, total_break_minutes, late_minutes, early_departure_minutes,
        overtime_minutes, status, has_exception, exception_notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'checked_in', 0, 0, ?, 0, 0, ?, ?, ?, ?, ?)
    `).run(
      'attrec_sara_today',
      'comp_nile',
      'br_cairo',
      'emp_sara',
      'shift_cairo_day',
      'wp_cairo_hq',
      todayCairo,
      checkInLate,
      32,
      'late',
      1,
      'Late arrival (32m) + Authorized Biometric Exception',
      checkInLate,
      checkInLate
    );

    db.prepare(`
      INSERT INTO attendance_events (
        id, company_id, branch_id, employee_id, attendance_record_id, workplace_id, shift_id,
        event_type, idempotency_key, server_timestamp, device_timestamp,
        latitude, longitude, accuracy_meters, location_timestamp,
        calculated_distance_meters, permitted_radius_meters, geofence_passed,
        is_mock_location, auth_method, biometric_verified, device_identifier,
        device_platform, is_offline_submission, sync_status, flags_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'check_in', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'exception_fallback', 0, 'IOS-IPHONE13-SARA01', 'ios', 0, 'accepted', '["AUTHORIZED_NON_BIOMETRIC_FALLBACK"]', ?)
    `).run(
      'attevt_sara_in',
      'comp_nile',
      'br_cairo',
      'emp_sara',
      'attrec_sara_today',
      'wp_cairo_hq',
      'shift_cairo_day',
      `seed-idem-sara-${todayCairo}`,
      checkInLate,
      checkInLate,
      29.9696,
      31.2760,
      16.0,
      checkInLate,
      14.72,
      150,
      checkInLate
    );

    // Suspicious / Rejected outside-geofence attempt for Omar Hassan (visible in HR dashboard alerts)
    db.prepare(`
      INSERT INTO attendance_events (
        id, company_id, branch_id, employee_id, attendance_record_id, workplace_id, shift_id,
        event_type, idempotency_key, server_timestamp, device_timestamp,
        latitude, longitude, accuracy_meters, location_timestamp,
        calculated_distance_meters, permitted_radius_meters, geofence_passed,
        is_mock_location, auth_method, biometric_verified, device_identifier,
        device_platform, is_offline_submission, sync_status, rejection_code, rejection_reason, flags_json, created_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, 'check_in', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'biometric_strong', 1, 'ANDROID-REALME-11-OMAR01', 'android', 0, 'rejected', 'OUTSIDE_GEOFENCE_BOUNDARY', 'Outside authorized workplace geofence (842.15m from Alexandria Logistics Hub Gate 4; permitted radius is 200m).', '["NEW_OR_UNREGISTERED_DEVICE"]', ?)
    `).run(
      'attevt_omar_rejected',
      'comp_nile',
      'br_alex',
      'emp_omar',
      'wp_alex_warehouse',
      'shift_cairo_day',
      `seed-idem-omar-rej-${todayCairo}`,
      checkInOnTime,
      checkInOnTime,
      31.2045,
      29.8960,
      18.0,
      checkInOnTime,
      845.12,
      200,
      checkInOnTime
    );

    // Initial Audit Log
    db.prepare(`
      INSERT INTO audit_logs (
        id, company_id, actor_user_id, actor_role, action, target_type, target_id, ip_address, details_json, created_at
      ) VALUES (?, 'comp_nile', 'usr_nile_owner', 'company_owner', 'TENANT_INITIALIZED', 'company', 'comp_nile', '127.0.0.1', '{"note":"Initial We HR tenant provisioned"}', ?)
    `).run('aud_init_01', nowIso);

    db.exec('COMMIT');
    return { seeded: true };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = {
  seedDatabase,
};
