import argon2 from 'argon2';

export async function hashToken(token) {
  return argon2.hash(token);
}

export async function verifyTokenHash(token, hash) {
  return argon2.verify(hash, token);
}
