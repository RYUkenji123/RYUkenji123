import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { one, run } from "./db.js";

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return expected.length === hash.length && crypto.timingSafeEqual(hash, expected);
}

export function createSession(res: Response, userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  run("INSERT INTO sessions (token, user_id) VALUES (?, ?)", token, userId);
  res.cookie("dl_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 60,
  });
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
}

export function destroySession(req: Request, res: Response) {
  const token = readCookie(req, "dl_session");
  if (token) run("DELETE FROM sessions WHERE token = ?", token);
  res.clearCookie("dl_session");
}

export interface AuthedRequest extends Request {
  user: { id: number; email: string; name: string; skill_level: string };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readCookie(req, "dl_session");
  const user = token
    ? one(
        "SELECT u.id, u.email, u.name, u.skill_level FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
        token,
      )
    : undefined;
  if (!user) return res.status(401).json({ error: "Not signed in" });
  (req as AuthedRequest).user = user as AuthedRequest["user"];
  next();
}
