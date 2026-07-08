"use client";

import { useActionState, useTransition, useState } from "react";
import { addFamilyMemberAction, removeFamilyMemberAction, type FormState } from "../actions";

type Fam = {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  dateOfBirth: string | null;
  foodPref: string;
  dietaryNotes: string;
};

export default function FamilyManager({ family }: { family: Fam[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addFamilyMemberAction, undefined);
  const [, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(family.length === 0);

  return (
    <div className="grid gap-4">
      {family.map((f) => (
        <div key={f.id} className="festive-card p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-semibold">
              {f.relationship === "child" ? "🧒" : "🧑"} {f.firstName} {f.lastName}
            </p>
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              {f.relationship.replaceAll("_", " ")}
              {f.dateOfBirth && ` · born ${f.dateOfBirth}`} · food: {f.foodPref.replace("_", "-")}
              {f.dietaryNotes && ` · ${f.dietaryNotes}`}
            </p>
          </div>
          <button
            className="btn-secondary !py-1.5 !px-4 text-xs"
            onClick={() => startTransition(() => removeFamilyMemberAction(f.id))}
          >
            Remove
          </button>
        </div>
      ))}

      {!showForm ? (
        <button className="btn-secondary w-fit" onClick={() => setShowForm(true)}>
          + Add a family member
        </button>
      ) : (
        <form action={action} className="festive-card p-6 grid gap-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <input name="firstName" required placeholder="First name" className="input" />
            <input name="lastName" placeholder="Last name" className="input" />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <select name="relationship" className="input">
              <option value="spouse">Spouse</option>
              <option value="child">Child</option>
              <option value="dependent_adult">Dependent adult</option>
            </select>
            <label className="text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
              Date of birth (for kid pricing)
              <input name="dateOfBirth" type="date" className="input mt-1 font-normal text-sm" />
            </label>
            <select name="foodPref" className="input">
              <option value="non_veg">Non-veg</option>
              <option value="veg">Veg</option>
              <option value="kid">Kid&apos;s meal</option>
            </select>
          </div>
          <input name="dietaryNotes" placeholder="Allergies / dietary notes (optional)" className="input" />
          {state?.error && (
            <p className="text-sm font-medium rounded-xl px-4 py-3" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
              {state.error}
            </p>
          )}
          <div className="flex gap-3">
            <button className="btn-primary !py-2.5" disabled={pending}>
              {pending ? "Adding…" : "Add to family"}
            </button>
            <button type="button" className="btn-secondary !py-2.5" onClick={() => setShowForm(false)}>
              Done
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
