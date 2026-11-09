"use client";

import { Save } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { ChipCheckboxGroup } from "@/components/ui/chip-checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/domain/form-state";
import type { FormInput, Requirements } from "@/lib/domain/forms";
import { COUNTRIES, MATERIALS, VACANCY_STATUS, WELDING_PROCESSES } from "@/lib/domain/labels";

export type VacancyInitial = {
  title: string;
  description: string;
  location: string;
  country: string;
  status: string;
  requirements: Requirements;
};

const join = (items: string[]) => items.join(", ");

/** Zet opgeslagen waarden om naar formulierwaarden. */
function initialToInput(v: VacancyInitial): FormInput {
  const r = v.requirements;
  return {
    title: v.title,
    description: v.description,
    location: v.location,
    country: v.country,
    status: v.status,
    lasprocessen: r.lasprocessen,
    materialen: r.materialen,
    verplichte_skills: join(r.verplichte_skills),
    gewenste_skills: join(r.gewenste_skills),
    certificaten: join(r.certificaten),
    min_jaren_ervaring: r.min_jaren_ervaring?.toString() ?? "",
    opleiding: r.opleiding,
    talen: join(r.talen),
    max_reisafstand_km: r.max_reisafstand_km?.toString() ?? "",
    salaris: r.salaris,
  };
}

export function VacancyForm({
  action,
  initial,
  cancelHref,
  submitLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial: VacancyInitial;
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const v = state.values ?? initialToInput(initial);
  const s = (key: string) => {
    const x = v[key];
    return Array.isArray(x) ? x.join(", ") : (x ?? "");
  };
  const arr = (key: string) => {
    const x = v[key];
    return Array.isArray(x) ? x : x ? [x] : [];
  };
  const err = state.errors;

  return (
    // key: na een mislukte poging de ingevulde waarden opnieuw tonen.
    <form key={state.attempt ?? 0} action={formAction} className="flex flex-col gap-5" noValidate>
      {state.message && (
        <p role="alert" className="rounded-tile bg-danger-tint px-4 py-3 text-[13px] text-danger-text">
          {state.message}
        </p>
      )}

      <Panel title="Vacature">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Functietitel" htmlFor="title" error={err.title} className="md:col-span-2">
            <Input id="title" name="title" defaultValue={s("title")} required placeholder="Bijv. TIG-lasser RVS" aria-invalid={!!err.title} />
          </Field>
          <Field label="Locatie" htmlFor="location" hint="Plaats of regio, bijv. Venlo of Gauteng.">
            <Input id="location" name="location" defaultValue={s("location")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Land" htmlFor="country" error={err.country}>
              <Select id="country" name="country" defaultValue={s("country") || "NL"}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="status" error={err.status}>
              <Select id="status" name="status" defaultValue={s("status") || "open"}>
                {Object.entries(VACANCY_STATUS).map(([value, { label }]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Omschrijving" htmlFor="description" className="md:col-span-2" hint="Wat ga je doen, waar, met welk team. Wordt later gebruikt voor de AI-matching.">
            <Textarea id="description" name="description" rows={5} defaultValue={s("description")} />
          </Field>
        </div>
      </Panel>

      <Panel title="Eisen" subtitle="Lijsten scheid je met een komma.">
        <div className="flex flex-col gap-5">
          <ChipCheckboxGroup name="lasprocessen" label="Lasprocessen" options={WELDING_PROCESSES} defaultValue={arr("lasprocessen")} />
          <ChipCheckboxGroup name="materialen" label="Materialen" options={MATERIALS} defaultValue={arr("materialen")} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Verplichte vaardigheden" htmlFor="verplichte_skills" hint="Bijv. tekening lezen, pijpwerk, positie 6G">
              <Input id="verplichte_skills" name="verplichte_skills" defaultValue={s("verplichte_skills")} />
            </Field>
            <Field label="Gewenste vaardigheden" htmlFor="gewenste_skills">
              <Input id="gewenste_skills" name="gewenste_skills" defaultValue={s("gewenste_skills")} />
            </Field>
            <Field label="Certificaten" htmlFor="certificaten" hint="Bijv. NEN-EN-ISO 9606-1, VCA">
              <Input id="certificaten" name="certificaten" defaultValue={s("certificaten")} />
            </Field>
            <Field label="Talen" htmlFor="talen" hint="Bijv. Nederlands, Engels">
              <Input id="talen" name="talen" defaultValue={s("talen")} />
            </Field>
            <Field label="Opleiding" htmlFor="opleiding">
              <Input id="opleiding" name="opleiding" defaultValue={s("opleiding")} placeholder="Bijv. MBO 2 lassen" />
            </Field>
            <Field label="Salarisindicatie" htmlFor="salaris">
              <Input id="salaris" name="salaris" defaultValue={s("salaris")} placeholder="Bijv. € 3.200 – € 3.800 per maand" />
            </Field>
            <Field label="Min. jaren ervaring" htmlFor="min_jaren_ervaring" error={err.min_jaren_ervaring}>
              <Input id="min_jaren_ervaring" name="min_jaren_ervaring" inputMode="numeric" className="text-right" defaultValue={s("min_jaren_ervaring")} aria-invalid={!!err.min_jaren_ervaring} />
            </Field>
            <Field label="Max. reisafstand (km)" htmlFor="max_reisafstand_km" error={err.max_reisafstand_km}>
              <Input id="max_reisafstand_km" name="max_reisafstand_km" inputMode="numeric" className="text-right" defaultValue={s("max_reisafstand_km")} aria-invalid={!!err.max_reisafstand_km} />
            </Field>
          </div>
        </div>
      </Panel>

      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="bordered">
          <Link href={cancelHref}>Annuleer</Link>
        </Button>
        <Button type="submit" variant="default" disabled={pending}>
          <Save />
          {pending ? "Bewaren…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
