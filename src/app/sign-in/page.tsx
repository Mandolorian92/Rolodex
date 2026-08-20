import { signIn } from "@/auth";

export default function SignInPage() {
  async function handleSignIn(formData: FormData) {
    "use server";
    const email = formData.get("email") as string;
    await signIn("resend", { email, redirectTo: "/onboarding" });
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 pt-16">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Sign in to Rolodex</h1>
        <p className="mt-1 text-sm text-zinc-500">
          We&apos;ll email you a link to sign in — no password needed.
        </p>
      </div>
      <form action={handleSignIn} className="flex flex-col gap-3">
        <input
          type="email"
          name="email"
          required
          placeholder="you@example.com"
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
        <button
          type="submit"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          Send sign-in link
        </button>
      </form>
    </div>
  );
}
