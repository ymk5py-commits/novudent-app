import type { Campaign, Patient } from "./types";

/** Un texto libre de audiencia no autoriza enviar correo a toda la base. */
export const MAX_CAMPAIGN_EMAILS = 30;

export function campaignEmailRecipients(campaign: Pick<Campaign, "recipientIds">, patients: Patient[]): string[] {
  const selected = new Set(campaign.recipientIds ?? []);
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const patient of patients) {
    if (!selected.has(patient.id)) continue;
    const email = patient.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

export function campaignMailto(campaign: Pick<Campaign, "name" | "message">, recipients: string[]): string | null {
  if (recipients.length === 0 || recipients.length > MAX_CAMPAIGN_EMAILS) return null;
  const params = new URLSearchParams({ bcc: recipients.join(","), subject: campaign.name, body: campaign.message });
  return `mailto:?${params.toString()}`;
}
