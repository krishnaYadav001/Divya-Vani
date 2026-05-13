import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { updateUserSettings } from "@/lib/supabase";

const USER_COOKIE = "god_messenger_uid";

// Phase 8 pre-launch — settings write endpoint. Currently accepts only
// `training_opt_out` in the body; future settings can be added without
// breaking callers. Service-role Supabase client (server-only); the
// service-role key NEVER reaches the browser per security invariant.
export async function POST(req: Request) {
  try {
    const jar = await cookies();
    const userId = jar.get(USER_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json(
        { error: "no_session" },
        { status: 401 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "invalid_json" },
        { status: 400 },
      );
    }

    const { training_opt_out } = (body ?? {}) as {
      training_opt_out?: unknown;
    };

    if (typeof training_opt_out !== "boolean") {
      return NextResponse.json(
        {
          error: "invalid_body",
          message:
            "Expected { training_opt_out: boolean } — got non-boolean.",
        },
        { status: 400 },
      );
    }

    await updateUserSettings(userId, { training_opt_out });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("[settings] error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
