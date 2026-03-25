import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow auth callback without auth check
  if (pathname === "/auth/callback") {
    return NextResponse.next();
  }

  const { user, response } = await updateSession(request);

  // Authenticated users on /login → redirect to /feed
  if (pathname === "/login" && user) {
    return NextResponse.redirect(new URL("/feed", request.url));
  }

  // /login is accessible without auth
  if (pathname === "/login") {
    return response;
  }

  // Unauthenticated users → redirect to /login
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Admin routes: check role
  if (pathname.startsWith("/admin")) {
    const appMetadata = user.app_metadata ?? {};
    if (appMetadata.role !== "admin") {
      return NextResponse.redirect(new URL("/feed", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
