// Ownly Pro — sponsorship model, no license verification needed.
// Everyone gets Pro features. Users can support via Gumroad.

export const GUMROAD_STORE_URL = 'https://liuh886.gumroad.com/l/ownly';

export type ActivationSource = 'gumroad' | 'special' | '';

export interface ActivationResult {
  success: boolean;
  source: ActivationSource;
  error?: string;
}
