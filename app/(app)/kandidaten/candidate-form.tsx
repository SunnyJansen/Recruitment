"use client";

import { Save } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/domain/form-state";
import type { FormInput } from "@/lib/domain/forms";
import { COUNTRIES } from "@/lib/domain/labels";

export function CandidateForm({
  action,
  initial,
  cancelHref,
  submitLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  initial: FormInput;
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const v = state.values ?? initial;
  const s = (key: string) => {
    const x = v[key];
    return Array.isArray(x) ? x.join(", ") : (x ?? "");
  };
  const err = state.errors;

  return (
    <form key={state.attempt ?? 0} action={formAction} className="flex flex-col gap-5" noValidate>
      {state.message && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-tile bg-danger-tint px-4 py-3 text-[13px] text-danger-text">
          <span>{state.message}</span>
          {state.duplicateId && (
            <Link href={`/kandidaten/${state.duplicateId}`} className="font-semibold underline">
              Open bestaande kandidaat
            </Link>
          )}
        </div>
      )}

      <Panel title="Kandidaat">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Naam" htmlFor="full_name" error={err.full_name}>
            <Input id="full_name" name="full_name" defaultValue={s("full_name")} autoComplete="off" aria-invalid={!!err.full_name} />
          </Field>
          <Field label="LinkedIn-profiel" htmlFor="linkedin_url" error={err.linkedin_url} hint="Bijv. https://www.linkedin.com/in/naam">
            <Input id="linkedin_url" name="linkedin_url" type="url" defaultValue={s("linkedin_url")} aria-invalid={!!err.linkedin_url} />
          </Field>
          <Field label="Functie / kopregel" htmlFor="headline" hint="Bijv. TIG-lasser RVS bij Bedrijf X">
            <Input id="headline" name="headline" defaultValue={s("headline")} />
          </Field>
          <Field label="Huidige werkgever" htmlFor="current_company">
            <Input id="current_company" name="current_company" defaultValue={s("current_company")} />
          </Field>
          <Field label="Woonplaats" htmlFor="location">
            <Input id="location" name="location" defaultValue={s("location")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Land" htmlFor="country" error={err.country}>
              <Select id="country" name="country" defaultValue={s("country")}>
                <option value="">Onbekend</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Taal berichten" htmlFor="language" hint="Leeg = volgens land">
              <Select id="language" name="language" defaultValue={s("language")}>
                <option value="">Volgens land</option>
                <option value="nl">Nederlands</option>
                <option value="en">Engels</option>
              </Select>
            </Field>
          </div>
          <Field label="E-mailadres" htmlFor="email" error={err.email}>
            <Input id="email" name="email" type="email" defaultValue={s("email")} aria-invalid={!!err.email} />
          </Field>
          <Field label="Telefoon" htmlFor="phone" error={err.phone}>
            <Input id="phone" name="phone" type="tel" defaultValue={s("phone")} aria-invalid={!!err.phone} />
          </Field>
          <Field label="Vaardigheden" htmlFor="skills" className="md:col-span-2" hint="Scheid met een komma, bijv. TIG, RVS, tekening lezen, 6G">
            <Input id="skills" name="skills" defaultValue={s("skills")} />
          </Field>
          <Field label="Werkervaring" htmlFor="experience" className="md:col-span-2" hint="Eén baan per regel, bijv. Lasser – Bedrijf X – 2019-2024">
            <Textarea id="experience" name="experience" rows={4} defaultValue={s("experience")} />
          </Field>
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
