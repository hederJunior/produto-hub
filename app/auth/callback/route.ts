import { NextRequest, NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const destino = request.nextUrl.clone();
  destino.pathname = "/";
  destino.search = "";

  if (code) {
    const supabase = getRouteClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(destino);
}
