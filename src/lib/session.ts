import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** For Server Components: redirects to /sign-in if there's no session, else returns the user id. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  return session.user.id;
}

/** For API routes: returns the signed-in user's id, or null if there's no session. */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
