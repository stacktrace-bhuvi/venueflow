import dotenv from 'dotenv';
dotenv.config();

import { NextRequest } from 'next/server';
import { hashPassword, verifyPassword } from '../lib/auth/password';
import { signToken, verifyToken } from '../lib/auth/jwt';

// Route handlers for RBAC testing
import { GET as adminVenuesGET } from '../app/api/admin/venues/route';
import { GET as adminUsersGET } from '../app/api/admin/users/route';
import { GET as adminEventsGET } from '../app/api/admin/events/route';
import { POST as managerVenuesPOST } from '../app/api/manager/venues/route';
import { POST as managerShowsPOST } from '../app/api/manager/shows/route';
import { PATCH as managerVenueByIdPATCH } from '../app/api/manager/venues/[id]/route';
import { PATCH as managerPricingRuleByIdPATCH } from '../app/api/manager/pricing-rules/[id]/route';

export async function runAuthTests(): Promise<boolean> {
  console.log('\n--- Running Authorization & Security Tests ---');

  // 1. Password Hashing & Verification
  const plainPassword = 'CorrectHorseBatteryStaple!2026';
  const hashed = await hashPassword(plainPassword);

  if (hashed === plainPassword) {
    throw new Error('Security Violation: Password was not hashed.');
  }

  const validMatch = await verifyPassword(plainPassword, hashed);
  if (!validMatch) {
    throw new Error('Password verification failed for valid password.');
  }

  const invalidMatch = await verifyPassword('WrongPassword123!', hashed);
  if (invalidMatch) {
    throw new Error('Password verification accepted an incorrect password.');
  }
  console.log('✓ Password hashing uses salted bcrypt with correct verification.');

  // 2. JWT Role Signing & Verification
  const customerToken = signToken({
    userId: 5,
    email: 'arjun.sharma@example.com',
    role: 'customer',
    name: 'Arjun Sharma',
  });

  const managerAToken = signToken({
    userId: 2,
    email: 'manager.kanteerava@venueflow.com',
    role: 'manager',
    name: 'Vikramaditya Rao (Manager A)',
  });

  const adminToken = signToken({
    userId: 1,
    email: 'admin@venueflow.com',
    role: 'admin',
    name: 'Admin Test',
  });

  const decodedCustomer = verifyToken(customerToken);
  const decodedManagerA = verifyToken(managerAToken);
  const decodedAdmin = verifyToken(adminToken);

  if (!decodedCustomer || decodedCustomer.role !== 'customer') {
    throw new Error('Customer role token failed verification.');
  }

  if (!decodedManagerA || decodedManagerA.role !== 'manager') {
    throw new Error('Manager role token failed verification.');
  }

  if (!decodedAdmin || decodedAdmin.role !== 'admin') {
    throw new Error('Admin role token failed verification.');
  }
  console.log('✓ JWT role verification correctly discriminates customer, manager, and admin roles.');

  // 3. Token Tampering Rejection
  const tamperedToken = customerToken.substring(0, customerToken.length - 5) + 'AAAAA';
  const decodedTampered = verifyToken(tamperedToken);

  if (decodedTampered !== null) {
    throw new Error('Security Failure: Tampered JWT token was accepted.');
  }
  console.log('✓ Tampered JWT signature is rejected.');

  // 4. Customer gets 403 on /api/manager/* routes
  const customerAuthHeader = { authorization: `Bearer ${customerToken}`, 'content-type': 'application/json' };

  const customerManagerVenuesRes = await managerVenuesPOST(
    new NextRequest('http://localhost:3000/api/manager/venues', {
      method: 'POST',
      headers: customerAuthHeader,
      body: JSON.stringify({ name: 'Unauthorized Venue' }),
    })
  );
  if (customerManagerVenuesRes.status !== 403) {
    throw new Error(`Expected 403 on /api/manager/venues for customer, got ${customerManagerVenuesRes.status}`);
  }

  const customerManagerShowsRes = await managerShowsPOST(
    new NextRequest('http://localhost:3000/api/manager/shows', {
      method: 'POST',
      headers: customerAuthHeader,
      body: JSON.stringify({}),
    })
  );
  if (customerManagerShowsRes.status !== 403) {
    throw new Error(`Expected 403 on /api/manager/shows for customer, got ${customerManagerShowsRes.status}`);
  }

  const customerManagerVenueIdRes = await managerVenueByIdPATCH(
    new NextRequest('http://localhost:3000/api/manager/venues/1', {
      method: 'PATCH',
      headers: customerAuthHeader,
      body: JSON.stringify({ name: 'New Name' }),
    }),
    { params: { id: '1' } }
  );
  if (customerManagerVenueIdRes.status !== 403) {
    throw new Error(`Expected 403 on /api/manager/venues/:id for customer, got ${customerManagerVenueIdRes.status}`);
  }

  const customerManagerPricingRuleRes = await managerPricingRuleByIdPATCH(
    new NextRequest('http://localhost:3000/api/manager/pricing-rules/1', {
      method: 'PATCH',
      headers: customerAuthHeader,
      body: JSON.stringify({ minPrice: 100 }),
    }),
    { params: { id: '1' } }
  );
  if (customerManagerPricingRuleRes.status !== 403) {
    throw new Error(`Expected 403 on /api/manager/pricing-rules/:id for customer, got ${customerManagerPricingRuleRes.status}`);
  }
  console.log('✓ Customer gets 403 Forbidden on all /api/manager/* routes.');

  // 5. Customer gets 403 on /api/admin/* routes
  const customerAdminVenuesRes = await adminVenuesGET(
    new NextRequest('http://localhost:3000/api/admin/venues', {
      method: 'GET',
      headers: customerAuthHeader,
    })
  );
  if (customerAdminVenuesRes.status !== 403) {
    throw new Error(`Expected 403 on /api/admin/venues for customer, got ${customerAdminVenuesRes.status}`);
  }

  const customerAdminUsersRes = await adminUsersGET(
    new NextRequest('http://localhost:3000/api/admin/users', {
      method: 'GET',
      headers: customerAuthHeader,
    })
  );
  if (customerAdminUsersRes.status !== 403) {
    throw new Error(`Expected 403 on /api/admin/users for customer, got ${customerAdminUsersRes.status}`);
  }

  const customerAdminEventsRes = await adminEventsGET(
    new NextRequest('http://localhost:3000/api/admin/events', {
      method: 'GET',
      headers: customerAuthHeader,
    })
  );
  if (customerAdminEventsRes.status !== 403) {
    throw new Error(`Expected 403 on /api/admin/events for customer, got ${customerAdminEventsRes.status}`);
  }
  console.log('✓ Customer gets 403 Forbidden on all /api/admin/* routes.');

  // 6. Manager A gets 403 editing Manager B's venue (Manager A is User 2, Venue 2 is managed by User 3)
  const managerAAuthHeader = { authorization: `Bearer ${managerAToken}`, 'content-type': 'application/json' };

  const crossVenueRes = await managerVenueByIdPATCH(
    new NextRequest('http://localhost:3000/api/manager/venues/2', {
      method: 'PATCH',
      headers: managerAAuthHeader,
      body: JSON.stringify({ name: 'Tampered Royal Opera House' }),
    }),
    { params: { id: '2' } }
  );
  if (crossVenueRes.status !== 403) {
    throw new Error(`Expected 403 when Manager A edits Manager B's venue, got ${crossVenueRes.status}`);
  }
  const crossVenueData = await crossVenueRes.json();
  if (!crossVenueData.error?.message?.includes('You do not manage this venue')) {
    throw new Error(`Expected message "You do not manage this venue", got "${crossVenueData.error?.message}"`);
  }
  console.log('✓ Manager A gets 403 Forbidden when attempting to edit Manager B\'s venue.');

  // 7. Manager A gets 403 editing Manager B's pricing rule (Pricing Rule 3 belongs to Show 3 at Venue 2, managed by User 3)
  const crossPricingRes = await managerPricingRuleByIdPATCH(
    new NextRequest('http://localhost:3000/api/manager/pricing-rules/3', {
      method: 'PATCH',
      headers: managerAAuthHeader,
      body: JSON.stringify({ minPrice: 1500 }),
    }),
    { params: { id: '3' } }
  );
  if (crossPricingRes.status !== 403) {
    throw new Error(`Expected 403 when Manager A edits Manager B's pricing rule, got ${crossPricingRes.status}`);
  }
  const crossPricingData = await crossPricingRes.json();
  if (!crossPricingData.error?.message?.includes('You do not manage the venue for this show')) {
    throw new Error(`Expected message "You do not manage the venue for this show", got "${crossPricingData.error?.message}"`);
  }
  console.log('✓ Manager A gets 403 Forbidden when attempting to edit Manager B\'s pricing rule.');

  return true;
}

if (require.main === module) {
  runAuthTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
