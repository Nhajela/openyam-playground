import { NextResponse } from "next/server";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return NextResponse.json({ ok: false, error, ...extra }, { status, headers });
}
