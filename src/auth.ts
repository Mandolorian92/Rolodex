/**
 * Auth.js (next-auth v5) configuration — the multi-tenant foundation's actual sign-in
 * mechanism. Database sessions via the Prisma adapter (required for the email/magic-link
 * flow), and Resend as the email provider so this reuses the same RESEND_API_KEY already
 * configured for alert notifications rather than introducing a second email credential.
 *
 * Route protection lives in src/proxy.ts, which wraps the `auth` export below. Every
 * page/API route additionally scopes its own queries via src/lib/session.ts — see the
 * multi-tenant migration note on the User model in prisma/schema.prisma.
 */
import NextAuth, { type DefaultSession } from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

declare module "next-auth" {
  interface Session {
    user: {
      username: string | null;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.ALERT_EMAIL_FROM || "Rolodex <onboarding@resend.dev>",
    }),
  ],
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    session({ session, user }) {
      session.user.username = (user as { username?: string | null }).username ?? null;
      return session;
    },
  },
});
