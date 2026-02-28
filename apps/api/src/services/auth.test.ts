import { authenticator } from "otplib";
import { describe, expect, it } from "vitest";
import { generateRefreshToken, hashPassword, hashToken, verifyPassword, verifyTotp } from "./auth.js";

describe("auth service", () => {
  it("hashes and verifies passwords", async () => {
    const password = "super-secure-password";
    const hashed = await hashPassword(password);

    expect(await verifyPassword(password, hashed)).toBe(true);
    expect(await verifyPassword("wrong-password", hashed)).toBe(false);
  });

  it("generates and hashes refresh tokens", () => {
    const token = generateRefreshToken();
    const tokenHash = hashToken(token);

    expect(token).toMatch(/^[a-f0-9]+$/);
    expect(token.length).toBeGreaterThan(80);
    expect(tokenHash).toHaveLength(64);
    expect(tokenHash).toBe(hashToken(token));
  });

  it("verifies TOTP codes", () => {
    const secret = authenticator.generateSecret();
    const code = authenticator.generate(secret);

    expect(verifyTotp(code, secret)).toBe(true);
    expect(verifyTotp("000000", secret)).toBe(false);
  });
});
