/** A friendly name for the signed-in user: their full name, else the part of the email before the @. */
export function displayName(fullName: string | undefined | null, email: string | undefined | null): string {
  if (fullName?.trim()) return fullName.trim();
  const local = (email ?? "").split("@")[0].replace(/[._-]+/g, " ").trim();
  return local ? local.replace(/\b\w/g, (char) => char.toUpperCase()) : "";
}

export const firstName = (name: string): string => name.split(/\s+/)[0] ?? "";
