'use strict';

/**
 * We HR — Role-Based Access Control (RBAC), Multi-Tenant Isolation & Subscription Guard
 */

const ROLES = Object.freeze({
  PLATFORM_SUPER_ADMIN: 'platform_super_admin',
  COMPANY_OWNER: 'company_owner',
  HR_ADMIN: 'hr_admin',
  BRANCH_MANAGER: 'branch_manager',
  SUPERVISOR: 'supervisor',
  EMPLOYEE: 'employee',
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.PLATFORM_SUPER_ADMIN]: new Set([
    'platform:tenants:read',
    'platform:tenants:write',
    'platform:subscriptions:read',
    'platform:subscriptions:verify_payment',
    'platform:audit:read',
    // Intentionally excludes employee:read, attendance:read_precise_location, etc.
  ]),
  [ROLES.COMPANY_OWNER]: new Set([
    'company:settings:read',
    'company:settings:write',
    'subscription:read',
    'subscription:submit_payment',
    'employees:read',
    'employees:write',
    'employees:import_csv',
    'workplaces:read',
    'workplaces:write',
    'shifts:read',
    'shifts:write',
    'devices:read',
    'devices:approve',
    'attendance:submit_own',
    'attendance:read_own',
    'attendance:read_company',
    'attendance:review_exception',
    'attendance:manual_correction',
    'attendance:export_csv',
    'leaves:submit_own',
    'leaves:read_company',
    'leaves:decide',
    'holidays:read',
    'holidays:write',
    'audit:read_company',
  ]),
  [ROLES.HR_ADMIN]: new Set([
    'company:settings:read',
    'subscription:read',
    'employees:read',
    'employees:write',
    'employees:import_csv',
    'workplaces:read',
    'workplaces:write',
    'shifts:read',
    'shifts:write',
    'devices:read',
    'devices:approve',
    'attendance:submit_own',
    'attendance:read_own',
    'attendance:read_company',
    'attendance:review_exception',
    'attendance:manual_correction',
    'attendance:export_csv',
    'leaves:submit_own',
    'leaves:read_company',
    'leaves:decide',
    'holidays:read',
    'holidays:write',
    'audit:read_company',
  ]),
  [ROLES.BRANCH_MANAGER]: new Set([
    'employees:read_branch',
    'workplaces:read',
    'shifts:read',
    'devices:read_branch',
    'attendance:submit_own',
    'attendance:read_own',
    'attendance:read_branch',
    'attendance:review_exception_branch',
    'attendance:manual_correction_branch',
    'attendance:export_csv_branch',
    'leaves:submit_own',
    'leaves:read_branch',
    'leaves:decide_branch',
    'holidays:read',
  ]),
  [ROLES.SUPERVISOR]: new Set([
    'employees:read_team',
    'workplaces:read',
    'shifts:read',
    'attendance:submit_own',
    'attendance:read_own',
    'attendance:read_team',
    'leaves:submit_own',
    'leaves:read_team',
    'leaves:decide_team',
    'holidays:read',
  ]),
  [ROLES.EMPLOYEE]: new Set([
    'workplaces:read_assigned',
    'shifts:read_assigned',
    'attendance:submit_own',
    'attendance:read_own',
    'leaves:submit_own',
    'leaves:read_own',
    'holidays:read',
  ]),
});

/**
 * Checks whether a role holds a specific permission or its higher-scope equivalent.
 * @param {string} role
 * @param {string} permission
 * @returns {boolean}
 */
function hasPermission(role, permission) {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  if (perms.has(permission)) return true;

  // Company-wide permissions satisfy branch/team/own equivalents
  if (permission.endsWith('_branch') || permission.endsWith('_team') || permission.endsWith('_own')) {
    const base = permission.replace(/_(branch|team|own)$/, '_company');
    if (perms.has(base)) return true;
    const genericBase = permission.replace(/_(branch|team|own)$/, '');
    if (perms.has(genericBase)) return true;
  }
  return false;
}

/**
 * Enforces strict multi-tenant boundary: verifies that actor belongs to targetCompanyId.
 * Platform super admins may only perform explicitly permitted platform-level operations,
 * NOT casual access to tenant employee/attendance records.
 *
 * @param {Object} actor - Authenticated user session object
 * @param {string} targetCompanyId - Target company ID
 * @param {Object} [options]
 * @param {boolean} [options.allowPlatformSuperAdmin=false]
 * @returns {{ allowed: boolean, reason?: string }}
 */
function verifyTenantAccess(actor, targetCompanyId, options = {}) {
  if (!actor || !actor.id || !actor.role) {
    return { allowed: false, reason: 'UNAUTHENTICATED' };
  }
  if (!targetCompanyId) {
    return { allowed: false, reason: 'MISSING_TARGET_TENANT' };
  }
  if (actor.role === ROLES.PLATFORM_SUPER_ADMIN) {
    if (options.allowPlatformSuperAdmin) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: 'PLATFORM_ADMIN_EMPLOYEE_DATA_RESTRICTED',
    };
  }
  if (actor.company_id !== targetCompanyId) {
    return {
      allowed: false,
      reason: 'CROSS_TENANT_ACCESS_DENIED',
    };
  }
  return { allowed: true };
}

/**
 * Verifies whether an actor is authorized to view or manage a specific target employee record.
 * Enforces tenant isolation, branch scoping for Branch Managers, and direct-report scoping for Supervisors.
 *
 * @param {Object} actor - Authenticated user (with role, company_id, branch_id, employee_id)
 * @param {Object} targetEmployee - Employee record
 * @returns {{ allowed: boolean, reason?: string }}
 */
function canAccessEmployee(actor, targetEmployee) {
  if (!actor || !targetEmployee) {
    return { allowed: false, reason: 'INVALID_ACTOR_OR_TARGET' };
  }

  const tenantCheck = verifyTenantAccess(actor, targetEmployee.company_id, {
    allowPlatformSuperAdmin: false,
  });
  if (!tenantCheck.allowed) {
    return tenantCheck;
  }

  switch (actor.role) {
    case ROLES.COMPANY_OWNER:
    case ROLES.HR_ADMIN:
      return { allowed: true };

    case ROLES.BRANCH_MANAGER:
      if (actor.branch_id && targetEmployee.branch_id === actor.branch_id) {
        return { allowed: true };
      }
      if (actor.employee_id && targetEmployee.id === actor.employee_id) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'BRANCH_SCOPE_VIOLATION' };

    case ROLES.SUPERVISOR:
      if (
        (actor.employee_id && targetEmployee.id === actor.employee_id) ||
        (actor.employee_id && targetEmployee.manager_id === actor.employee_id)
      ) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'SUPERVISOR_TEAM_SCOPE_VIOLATION' };

    case ROLES.EMPLOYEE:
      if (actor.employee_id && targetEmployee.id === actor.employee_id) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'EMPLOYEE_SELF_SCOPE_VIOLATION' };

    default:
      return { allowed: false, reason: 'UNAUTHORIZED_ROLE' };
  }
}

/**
 * Evaluates a company's subscription status, grace period, and plan feature limits on the server.
 *
 * @param {Object} subscription - Company subscription record joined with plan details
 * @param {Date|string|number} [nowTimestamp=Date.now()]
 * @returns {{ allowed: boolean, effectiveStatus: string, daysRemaining: number, inGracePeriod: boolean, reason?: string }}
 */
function evaluateSubscriptionStatus(subscription, nowTimestamp = Date.now()) {
  if (!subscription) {
    return {
      allowed: false,
      effectiveStatus: 'missing',
      daysRemaining: 0,
      inGracePeriod: false,
      reason: 'NO_ACTIVE_SUBSCRIPTION',
    };
  }

  if (subscription.status === 'suspended') {
    return {
      allowed: false,
      effectiveStatus: 'suspended',
      daysRemaining: 0,
      inGracePeriod: false,
      reason: 'SUBSCRIPTION_SUSPENDED',
    };
  }

  const nowMs = new Date(nowTimestamp).getTime();
  const expiryMs = new Date(subscription.expiry_date).getTime();
  const graceDays = Number(subscription.grace_period_days ?? 7);
  const graceEndMs = expiryMs + graceDays * 86400000;

  const daysRemaining = Math.ceil((expiryMs - nowMs) / 86400000);

  if (nowMs <= expiryMs) {
    return {
      allowed: true,
      effectiveStatus: subscription.status === 'trial' ? 'trial' : 'active',
      daysRemaining,
      inGracePeriod: false,
    };
  }

  if (nowMs <= graceEndMs) {
    const graceDaysLeft = Math.ceil((graceEndMs - nowMs) / 86400000);
    return {
      allowed: true,
      effectiveStatus: 'grace_period',
      daysRemaining: graceDaysLeft,
      inGracePeriod: true,
    };
  }

  return {
    allowed: false,
    effectiveStatus: 'expired',
    daysRemaining,
    inGracePeriod: false,
    reason: 'SUBSCRIPTION_EXPIRED_PAST_GRACE_PERIOD',
  };
}

module.exports = {
  ROLES,
  ROLE_PERMISSIONS,
  hasPermission,
  verifyTenantAccess,
  canAccessEmployee,
  evaluateSubscriptionStatus,
};
