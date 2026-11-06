import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { authRedirectFor } from "../auth/auth-links";

import { hasSupabaseEnv, supabaseAnonKey, supabaseUrl } from "./env";

/** Pagina's die je zonder inloggen mag zien. */
const PUBLIC_PATHS = ["/login", "/auth", "/setup"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Draait vóór elke pagina (via proxy.ts):
 * 1. Geen Supabase-instellingen → naar /setup.
 * 2. Ververs de login-sessie (cookies).
 * 3. Niet ingelogd → naar /login.
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!hasSupabaseEnv()) {
    if (pathname === "/setup") return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  // Inloglink op de verkeerde pagina beland? Code doorsturen i.p.v. weggooien.
  const authRedirect = authRedirectFor(request.nextUrl);
  if (authRedirect) return NextResponse.redirect(authRedirect);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers ?? {}).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // Let op: niets tussen createServerClient en getClaims zetten.
  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims?.sub);

  if (!loggedIn && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (loggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}
