import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import OnboardingForm from "@/components/OnboardingForm";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (user.username) redirect("/");

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 pt-16">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Welcome to Rolodex</h1>
        <p className="mt-1 text-sm text-zinc-500">Pick a username to finish setting up your account.</p>
      </div>
      <OnboardingForm />
    </div>
  );
}
