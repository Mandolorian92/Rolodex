import AddCardForm from "@/components/AddCardForm";

export const dynamic = "force-dynamic";

export default function AddCardPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-100">Add a card</h1>
      <AddCardForm />
    </div>
  );
}
