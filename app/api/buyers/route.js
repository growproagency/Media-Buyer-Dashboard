import { NextResponse } from "next/server";
import { updateBuyer, createBuyer, deleteBuyer } from "../../../lib/db";

export const dynamic = "force-dynamic";

// Editing gate: if EDIT_PASSWORD is set, every write must carry a matching
// x-edit-password header. If it's blank, anyone with the link may edit.
function authorized(req) {
  const required = process.env.EDIT_PASSWORD;
  if (!required) return true;
  return req.headers.get("x-edit-password") === required;
}

function guard(req) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "No DATABASE_URL configured — edits can't be saved yet." },
      { status: 503 }
    );
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Wrong edit password." }, { status: 401 });
  }
  return null;
}

export async function PATCH(req) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = await req.json();
  const { id, ...patch } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const row = await updateBuyer(id, patch);
  if (!row) return NextResponse.json({ error: "Not found / nothing to update" }, { status: 404 });
  return NextResponse.json({ buyer: row });
}

export async function POST(req) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  const row = await createBuyer({ name: body.name });
  return NextResponse.json({ buyer: row });
}

export async function DELETE(req) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await deleteBuyer(id);
  return NextResponse.json({ ok: true });
}
