import bcrypt from "bcryptjs";

/** bcryptjs cost: 8 is ~3× faster than 10 and still fine for this app. */
const ROUNDS = Number(process.env.BCRYPT_ROUNDS || 8);

export async function hashPassword(password: string) {
  return bcrypt.hash(password, Number.isFinite(ROUNDS) && ROUNDS >= 6 ? ROUNDS : 8);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
