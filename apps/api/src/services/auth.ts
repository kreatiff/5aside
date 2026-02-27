import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { authenticator } from "otplib";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyTotp(code: string, secret: string): boolean {
  return authenticator.verify({ token: code, secret });
}
