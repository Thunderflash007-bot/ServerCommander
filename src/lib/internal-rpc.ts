export const INTERNAL_RPC_HEADER = "x-internal-rpc-secret";

export function getInternalRpcSecret(): string | null {
  const value = (process.env.INTERNAL_RPC_SECRET ?? "").trim();
  if (!value) return null;
  if (value.length < 32) return null;
  return value;
}

export function isInternalRpcAuthorized(providedSecret: string | null): boolean {
  const expected = getInternalRpcSecret();
  if (!expected || !providedSecret) return false;

  const expectedLength = expected.length;
  const providedLength = providedSecret.length;
  const maxLength = Math.max(expectedLength, providedLength);
  let diff = expectedLength ^ providedLength;

  for (let i = 0; i < maxLength; i += 1) {
    const expectedChar = i < expectedLength ? expected.charCodeAt(i) : 0;
    const providedChar = i < providedLength ? providedSecret.charCodeAt(i) : 0;
    diff |= expectedChar ^ providedChar;
  }

  return diff === 0;
}