import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json();
  const supabase = getServiceClient();

  const { data, error } = await supabase.from("Cliente").update(body).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ cliente: data });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServiceClient();
  const { error } = await supabase.from("Cliente").delete().eq("id", params.id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
