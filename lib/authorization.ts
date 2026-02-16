import { type UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { type AuthUser } from "./auth";

const ROUTE_PERMISSIONS: Record<string, readonly UserRole[]> = {
  // List/read — all authenticated users
  "GET /api/jobs":                          ["admin", "shipper", "carrier"],
  "GET /api/jobs/[id]":                     ["admin", "shipper", "carrier"],

  // Create job
  "POST /api/jobs":                         ["admin", "shipper"],

  // Shipper actions
  "POST /api/jobs/[id]/assign":             ["admin", "shipper"],

  // Carrier actions
  "POST /api/jobs/[id]/accept":             ["admin", "carrier"],
  "POST /api/jobs/[id]/pickup-confirm":     ["admin", "carrier"],
  "POST /api/jobs/[id]/delivery-submit":    ["admin", "carrier"],
  "POST /api/jobs/[id]/evidence":           ["admin", "carrier"],
  "POST /api/jobs/[id]/evidence/simulate":  ["admin"],
  "POST /api/jobs/[id]/issue":              ["admin"],

  // Shipper/admin actions
  "POST /api/jobs/[id]/evaluate":           ["admin", "shipper"],
  "POST /api/jobs/[id]/approve":            ["admin", "shipper"],
  "POST /api/jobs/[id]/dispute":            ["admin", "shipper"],
  "POST /api/jobs/[id]/cancel":             ["admin", "shipper"],

  // Admin-only
  "POST /api/jobs/[id]/release":            ["admin"],
  "POST /api/jobs/[id]/evidence/[id]/redact": ["admin"],

  // Review
  "GET /api/jobs/[id]/review":              ["admin", "shipper", "carrier"],

  // Upload
  "POST /api/upload":                       ["admin", "shipper", "carrier"],

  // File serving (secure)
  "GET /api/files":                         ["admin", "shipper"],

  // Notifications
  "GET /api/notifications/delivery":        ["admin", "shipper"],

  // Admin endpoints
  "POST /api/admin/users":                  ["admin"],
  "GET /api/admin/users":                   ["admin"],
  "POST /api/admin/users/[id]/keys":        ["admin"],
  "POST /api/admin/outbox/drain":           ["admin"],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeRoutePath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const normalized = parts.map((p) => (UUID_RE.test(p) ? "[id]" : p));
  return "/" + normalized.join("/");
}

export function checkAuthorization(
  method: string,
  pathname: string,
  user: AuthUser,
): { allowed: boolean; requiredRoles?: readonly UserRole[] } {
  const key = `${method.toUpperCase()} ${normalizeRoutePath(pathname)}`;
  const allowedRoles = ROUTE_PERMISSIONS[key];

  if (!allowedRoles) {
    return { allowed: false, requiredRoles: [] };
  }

  if ((allowedRoles as readonly string[]).includes(user.role)) {
    return { allowed: true };
  }

  return { allowed: false, requiredRoles: allowedRoles };
}

export function forbidden(requiredRoles?: readonly UserRole[]) {
  return NextResponse.json(
    {
      ok: false,
      error: "Forbidden",
      detail: requiredRoles?.length
        ? `Required role: ${requiredRoles.join(" or ")}`
        : "Insufficient permissions",
    },
    { status: 403 },
  );
}
