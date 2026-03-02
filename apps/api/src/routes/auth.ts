import type { FastifyInstance, FastifyReply } from "fastify";
import { LoginSchema, MfaVerifySchema, RefreshSchema } from "@fiveaside/contracts";
import { query } from "../db/helpers.js";
import { parseBody } from "../utils/request.js";
import { verifyPassword, verifyTotp, generateRefreshToken, hashToken } from "../services/auth.js";
import { env } from "../config.js";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

function setRefreshTokenCookie(reply: FastifyReply, token: string) {
  reply.setCookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60
  });
}

function clearRefreshTokenCookie(reply: FastifyReply) {
  reply.clearCookie("refreshToken", { path: "/" });
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/login", async (request, reply) => {
    const body = parseBody(reply, LoginSchema, request.body);

    const result = await query<{
      id: string;
      email: string;
      password_hash: string;
      totp_secret_enc: string;
      role: string;
    }>(`SELECT id, email, password_hash, totp_secret_enc, role FROM admins WHERE email = $1`, [body.email]);

    if (result.rowCount === 0) {
      throw reply.unauthorized("Invalid credentials");
    }

    const admin = result.rows[0]!;
    const isValid = await verifyPassword(body.password, admin.password_hash);

    if (!isValid) {
      throw reply.unauthorized("Invalid credentials");
    }

    /*
    if (admin.totp_secret_enc) {
      // Issue a short-lived token just for MFA step
      const mfaToken = app.jwt.sign(
        { sub: admin.id, pendingMfa: true },
        { expiresIn: "5m" }
      );
      return { mfaRequired: true, mfaToken };
    }
    */

    // If no MFA configured (e.g. initial setup), proceed to issue full tokens
    const accessToken = app.jwt.sign(
      { sub: admin.id, email: admin.email, role: admin.role },
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );
    const refreshToken = generateRefreshToken();
    const tokenHash = hashToken(refreshToken);

    await query(
      `INSERT INTO admin_refresh_tokens (admin_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${REFRESH_TOKEN_EXPIRY_DAYS} days')`,
      [admin.id, tokenHash]
    );

    setRefreshTokenCookie(reply, refreshToken);
    return { mfaRequired: false, accessToken };
  });

  app.post("/api/auth/mfa/verify", async (request, reply) => {
    const body = parseBody(reply, MfaVerifySchema, request.body);

    // Verify the short-lived MFA token
    let decoded: any;
    try {
      decoded = app.jwt.verify(body.mfaToken);
    } catch {
      throw reply.unauthorized("Invalid or expired MFA token");
    }

    if (!decoded.pendingMfa || !decoded.sub) {
      throw reply.unauthorized("Invalid token type");
    }

    const result = await query<{
      id: string;
      email: string;
      totp_secret_enc: string;
      role: string;
    }>(`SELECT id, email, totp_secret_enc, role FROM admins WHERE id = $1`, [decoded.sub]);

    if (result.rowCount === 0) {
      throw reply.unauthorized("Admin not found");
    }

    const admin = result.rows[0]!;
    const isCodeValid = verifyTotp(body.code, admin.totp_secret_enc);

    if (!isCodeValid) {
      throw reply.unauthorized("Invalid MFA code");
    }

    const accessToken = app.jwt.sign(
      { sub: admin.id, email: admin.email, role: admin.role },
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );
    const refreshToken = generateRefreshToken();
    const tokenHash = hashToken(refreshToken);

    await query(
      `INSERT INTO admin_refresh_tokens (admin_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${REFRESH_TOKEN_EXPIRY_DAYS} days')`,
      [admin.id, tokenHash]
    );

    setRefreshTokenCookie(reply, refreshToken);
    return { accessToken };
  });

  app.post("/api/auth/refresh", async (request, reply) => {
    if (env.DISABLE_AUTH === "true") {
      const accessToken = app.jwt.sign(
        { sub: "dev-admin", email: "dev@localhost", role: "admin" },
        { expiresIn: ACCESS_TOKEN_EXPIRY }
      );
      return { accessToken };
    }

    const body: any = request.body || {};
    const refreshToken = request.cookies.refreshToken || body.refreshToken;

    if (!refreshToken) {
      throw reply.unauthorized("Refresh token required");
    }

    const tokenHash = hashToken(refreshToken);
    const result = await query<{
      id: string;
      admin_id: string;
      email: string;
      role: string;
    }>(
      `SELECT r.id, r.admin_id, a.email, a.role
       FROM admin_refresh_tokens r
       JOIN admins a ON a.id = r.admin_id
       WHERE r.token_hash = $1
         AND r.revoked_at IS NULL
         AND r.expires_at > NOW()`,
      [tokenHash]
    );

    if (result.rowCount === 0) {
      clearRefreshTokenCookie(reply);
      throw reply.unauthorized("Invalid or expired refresh token");
    }

    const tokenRecord = result.rows[0]!;

    // Revoke old token
    await query(`UPDATE admin_refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [tokenRecord.id]);

    // Issue new pair
    const accessToken = app.jwt.sign(
      { sub: tokenRecord.admin_id, email: tokenRecord.email, role: tokenRecord.role },
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );
    const newRefreshToken = generateRefreshToken();
    const newHash = hashToken(newRefreshToken);

    await query(
      `INSERT INTO admin_refresh_tokens (admin_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${REFRESH_TOKEN_EXPIRY_DAYS} days')`,
      [tokenRecord.admin_id, newHash]
    );

    setRefreshTokenCookie(reply, newRefreshToken);
    return { accessToken };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await query(`UPDATE admin_refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`, [tokenHash]);
    }

    clearRefreshTokenCookie(reply);
    reply.code(200);
    return { ok: true };
  });
}
