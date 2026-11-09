import type { FieldErrors, FormInput } from "./forms";

/** Wat een formulier-actie teruggeeft als opslaan niet lukt. */
export type FormState = {
  errors: FieldErrors;
  /** Algemene melding boven het formulier. */
  message?: string;
  /** Ingevulde waarden, zodat niets verloren gaat bij een fout. */
  values?: FormInput;
  /** Bestaande kandidaat bij een dubbele invoer. */
  duplicateId?: string;
  /** Telt op bij elke poging, zodat het formulier de waarden opnieuw toont. */
  attempt?: number;
};

export const EMPTY_FORM_STATE: FormState = { errors: {} };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Controleert of een id uit de URL een geldig uuid is (voorkomt databasefouten). */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
