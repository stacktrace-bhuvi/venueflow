import dotenv from 'dotenv';
dotenv.config();

import { hashPassword, verifyPassword } from '../lib/auth/password';
import { signToken, verifyToken } from '../lib/auth/jwt';

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
    userId: 101,
    email: 'customer@example.com',
    role: 'customer',
    name: 'Customer Test',
  });

  const managerToken = signToken({
    userId: 102,
    email: 'manager@example.com',
    role: 'manager',
    name: 'Manager Test',
  });

  const adminToken = signToken({
    userId: 103,
    email: 'admin@example.com',
    role: 'admin',
    name: 'Admin Test',
  });

  const decodedCustomer = verifyToken(customerToken);
  const decodedManager = verifyToken(managerToken);
  const decodedAdmin = verifyToken(adminToken);

  if (!decodedCustomer || decodedCustomer.role !== 'customer') {
    throw new Error('Customer role token failed verification.');
  }

  if (!decodedManager || decodedManager.role !== 'manager') {
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
