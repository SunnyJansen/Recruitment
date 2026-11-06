/**
 * Vertaalt een Supabase-fout bij het aanvragen van een inloglink naar
 * begrijpelijk Nederlands, en zegt hoe lang de knop uit moet staan.
 */
export type LoginErrorInfo = {
  message: string;
  /** Aantal seconden dat opnieuw aanvragen geen zin heeft (0 = meteen weer mogen). */
  waitSeconds: number;
};

export function describeLoginError(error: {
  message: string;
  status?: number;
  code?: string;
}): LoginErrorInfo {
  const { message, status, code } = error;

  // Per e-mailadres maximaal één link per minuut. Supabase noemt de resterende seconden.
  const seconds = message.match(/after (\d+) seconds?/i);
  if (seconds) {
    const n = Number(seconds[1]);
    return {
      message: `Je hebt net al een inloglink aangevraagd. Gebruik de link uit die mail, of wacht nog ${n} seconden.`,
      waitSeconds: n,
    };
  }

  // Maximum aantal mails per uur voor het hele project bereikt.
  if (code === "over_email_send_rate_limit" || /email rate limit/i.test(message)) {
    return {
      message:
        "Het maximum aantal inlogmails per uur is bereikt. Gebruik de link uit een eerdere mail, of probeer het over een uur opnieuw. Beheerder: stel eigen e-mail in via Resend (zie docs/INLOGMAIL.md).",
      waitSeconds: 60,
    };
  }

  if (code === "over_request_rate_limit" || status === 429) {
    return {
      message: "Te veel pogingen vanaf dit apparaat. Wacht een paar minuten en probeer het opnieuw.",
      waitSeconds: 60,
    };
  }

  if (
    code === "signup_disabled" ||
    code === "user_not_found" ||
    code === "otp_disabled" ||
    /signups not allowed|not found/i.test(message)
  ) {
    return {
      message: "Dit e-mailadres heeft geen toegang. Vraag een beheerder om je toe te voegen.",
      waitSeconds: 0,
    };
  }

  if (code === "email_address_invalid") {
    return { message: "Dit e-mailadres klopt niet. Controleer de spelling.", waitSeconds: 0 };
  }

  return { message: `Versturen is mislukt: ${message}`, waitSeconds: 0 };
}
