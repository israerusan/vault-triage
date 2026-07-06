import { verifyLicense, type LicenseVerification } from "../../shared/verifyLicense.mjs";
import { LICENSE_PUBLIC_KEY } from "./publicKey";
import { PRODUCT_ID } from "../../product";

export type { LicensePayload, LicenseVerification } from "../../shared/verifyLicense.mjs";

/**
 * Thin product binding over the shared verifier. A license is only valid if its
 * signed payload names this exact product, so keys can't be reused across the
 * plugin portfolio.
 */
export class LicenseManager {
  static verify(licenseKey: string): LicenseVerification {
    return verifyLicense(licenseKey, PRODUCT_ID, LICENSE_PUBLIC_KEY);
  }
}
