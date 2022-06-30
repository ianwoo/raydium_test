import BN from 'bn.js';

import {
  Currency,
  CurrencyAmount,
  Token,
  TokenAmount,
  ZERO,
} from '@raydium-io/raydium-sdk';
import { PublicKey } from '@solana/web3.js';

export const WSOLMint = new PublicKey(
  "So11111111111111111111111111111111111111112"
);
export const SOLDecimals = 9;
export const WSOL = new Token(WSOLMint, SOLDecimals, "WSOL", "wrapped solana");
export const SOL = new Currency(SOLDecimals, "SOL", "solana");

export interface QuantumSOLAmount extends TokenAmount {
  token: QuantumSOLToken;
  solBalance: BN;
}

export type SrcAddress = string;

interface TokenJson {
  symbol: string;
  name: string;
  mint: PublicKey;
  decimals: number;
  extensions: {
    coingeckoId?: string;
  };
  icon: string;
}

export interface QuantumSOLToken extends Token {
  isQuantumSOL: true;
  collapseTo?: "sol" | "wsol";
}

// @ts-expect-error no need to worry about type guard's type here
export const isQuantumSOL: (token: any) => token is QuantumSOLToken = (
  token
) => {
  try {
    return "isQuantumSOL" in (token as QuantumSOLToken);
  } catch {
    return false;
  }
};

// @ts-expect-error no need to worry about type guard's type here
export const isQuantumSOLAmount: (
  tokenAmount: TokenAmount
) => tokenAmount is QuantumSOLAmount = (tokenAmount) =>
  isQuantumSOL(tokenAmount.token);

/** transaction for SDK: unWrap may QuantumSOL to Token or Currency */
export function deUIToken(token: Token): Token | Currency {
  if (isQuantumSOL(token)) {
    return token.collapseTo === "wsol" ? WSOL : SOL;
  }
  return token;
}

/** transaction for SDK: unWrap  may QuantumSOL to TokenAmount or CurrencyAmount */
export function deUITokenAmount(
  tokenAmount: TokenAmount
): TokenAmount | CurrencyAmount {
  if (isQuantumSOLAmount(tokenAmount)) {
    return new CurrencyAmount(SOL, tokenAmount.solBalance ?? ZERO); // which means error appears
  }
  return tokenAmount;
}
