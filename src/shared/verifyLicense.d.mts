export interface LicensePayload {
  product: string;
  email?: string;
  issued?: string;
}

export type LicenseVerification =
  | { valid: true; email?: string }
  | { valid: false; error: string };

/**
 * Verify an offline Ed25519 license key against a bundled public key. The key's
 * signed payload must name `product`, so keys can't be reused across products.
 */
export function verifyLicense(
  licenseKey: string,
  product: string,
  publicKeyB64: string
): LicenseVerification;
