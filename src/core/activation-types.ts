export interface WYQDActivationHeader {
  alg: 'ES256';
  typ: 'OWNLY-ACT';
}

export interface WYQDActivationPayload {
  key: string;
  plan: string;
  iat: number;
  exp: number | null;
}

export interface WYQDActivationTokenParts {
  header: WYQDActivationHeader;
  payload: WYQDActivationPayload;
  signatureBytes: Uint8Array;
  signedBytes: Uint8Array;
}
