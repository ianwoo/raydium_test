import BN from 'bn.js';

import {
  BigNumberish,
  Fraction,
  LiquidityPoolJsonInfo,
  Percent,
  Price,
  PublicKeyish,
  TEN,
  Token,
  TokenAccount,
  TokenAmount,
  Trade,
  ZERO,
} from '@raydium-io/raydium-sdk';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  Connection,
  PublicKey,
  Signer,
  Transaction,
} from '@solana/web3.js';

import { attachRecentBlockhash } from '../utils/attachRecentBlockhash';
import {
  deUITokenAmount,
  isQuantumSOL,
  QuantumSOLAmount,
  QuantumSOLToken,
} from '../utils/deUITokenAmount';
import sendSignedTransaction from './sendSignedTransaction';

type TradeSource = "amm" | "serum" | "stable";
type RouteType = "amm" | "serum" | "route";

type LiquidityPoolKeys = {
  [T in keyof LiquidityPoolJsonInfo]: string extends LiquidityPoolJsonInfo[T]
    ? PublicKey
    : LiquidityPoolJsonInfo[T];
};

type RouteInfo = {
  source: TradeSource;
  keys: LiquidityPoolKeys;
};

type MayPromise<T> = T | Promise<T>;

type FinalInfos = {
  allSuccess: boolean;
  txids: string[];
};

export type Numberish = number | string | bigint | Fraction | BN;

const mintCache = new WeakMap<PublicKey, string>();

const WSOLMint = new PublicKey("So11111111111111111111111111111111111111112");

export function toPubString(mint: PublicKeyish | undefined): string {
  if (!mint) return "";
  if (typeof mint === "string") return mint;
  if (mintCache.has(mint)) {
    return mintCache.get(mint)!;
  } else {
    const mintString = mint.toBase58();
    mintCache.set(mint, mintString);
    return mintString;
  }
}

function omit<T, U extends keyof T>(
  obj: T,
  ...inputKeys: (U[] | U)[]
): Omit<T, U> {
  const unvalidKeys = inputKeys.flat();
  //@ts-expect-error Object.fromEntries / Object.entries' type is not quite intelligense. So force to type it !!!
  return Object.fromEntries(
    Object.entries(obj).filter(([key]: any) => !unvalidKeys.includes(key))
  );
}

export function shakeNullItems<T>(arr: T[]): NonNullable<T>[] {
  return arr.filter((item) => item != null) as NonNullable<T>[];
}

function asyncMap<T, U>(
  arr: T[],
  mapFn: (item: T, index: number) => MayPromise<U>
): Promise<Awaited<U>[]> {
  return Promise.all(arr.map(async (item, idx) => await mapFn(item, idx)));
}

const partialSignTransacion = async (
  transaction: Transaction,
  signers?: Signer[]
): Promise<Transaction> => {
  if (signers?.length) {
    await attachRecentBlockhash(transaction);
    transaction.partialSign(...signers);
    return transaction;
  }
  return transaction;
};

const loadTransaction = async (payload: {
  transaction: Transaction;
  signers?: Signer[];
}) => {
  const { transaction, signers } = payload;
  const signedTransaction = await partialSignTransacion(transaction, signers);
  return signedTransaction;
};

const quantumSOLVersionSOLTokenJsonInfo = {
  isQuantumSOL: true,
  isLp: false,
  official: true,
  mint: toPubString(WSOLMint),
  decimals: 9,
  collapseTo: "sol",
  symbol: "SOL",
  name: "solana",
  icon: `https://img.raydium.io/icon/So11111111111111111111111111111111111111112.png`,
  extensions: {
    coingeckoId: "solana",
  },
};

const isQuantumSOLVersionSOL = (token: any) =>
  isQuantumSOL(token) && token.collapseTo === "sol";

export const QuantumSOLVersionSOL = Object.assign(
  new Token(
    quantumSOLVersionSOLTokenJsonInfo.mint,
    quantumSOLVersionSOLTokenJsonInfo.decimals,
    quantumSOLVersionSOLTokenJsonInfo.symbol,
    quantumSOLVersionSOLTokenJsonInfo.name
  ),
  omit(quantumSOLVersionSOLTokenJsonInfo, [
    "mint",
    "decimals",
    "symbol",
    "name",
  ])
) as QuantumSOLToken;

const toQuantumSolAmount = ({
  solRawAmount: solRawAmount,
}: {
  solRawAmount?: BN;
}): QuantumSOLAmount => {
  const quantumSol = QuantumSOLVersionSOL;
  const tempTokenAmount = new TokenAmount(quantumSol, solRawAmount ?? ZERO);
  // @ts-expect-error force
  return Object.assign(tempTokenAmount, {
    solBalance: solRawAmount,
  });
};

export function parseNumberInfo(n: Numberish | undefined): {
  denominator: string;
  numerator: string;
  sign?: string;
  int?: string;
  dec?: string;
} {
  if (n === undefined) return { denominator: "1", numerator: "0" };
  if (n instanceof BN) {
    return { numerator: n.toString(), denominator: "1" };
  }

  if (n instanceof Fraction) {
    return {
      denominator: n.denominator.toString(),
      numerator: n.numerator.toString(),
    };
  }

  const s = String(n);
  const [, sign = "", int = "", dec = ""] =
    s.replace(",", "").match(/(-?)(\d*)\.?(\d*)/) ?? [];
  const denominator = "1" + "0".repeat(dec.length);
  const numerator = sign + (int === "0" ? "" : int) + dec || "0";
  return { denominator, numerator, sign, int, dec };
}

export function toFraction(value: Numberish): Fraction {
  //  to complete math format(may have decimal), not int
  if (value instanceof Percent)
    return new Fraction(value.numerator, value.denominator);

  if (value instanceof Price) return value.adjusted;

  // to complete math format(may have decimal), not BN
  if (value instanceof TokenAmount)
    try {
      return toFraction(value.toExact());
    } catch (e) {
      return new Fraction(ZERO);
    }

  // do not ideal with other fraction value
  if (value instanceof Fraction) return value;

  // wrap to Fraction
  const n = String(value);
  const details = parseNumberInfo(n);
  return new Fraction(details.numerator, details.denominator);
}

export function toFractionWithDecimals(value: Numberish): {
  fr: Fraction;
  decimals?: number;
} {
  //  to complete math format(may have decimal), not int
  if (value instanceof Percent)
    return { fr: new Fraction(value.numerator, value.denominator) };

  if (value instanceof Price) return { fr: value.adjusted };

  // to complete math format(may have decimal), not BN
  if (value instanceof TokenAmount)
    return { fr: toFraction(value.toExact()), decimals: value.token.decimals };

  // do not ideal with other fraction value
  if (value instanceof Fraction) return { fr: value };

  // wrap to Fraction
  const n = String(value);
  const details = parseNumberInfo(n);
  return {
    fr: new Fraction(details.numerator, details.denominator),
    decimals: details.dec?.length,
  };
}

export function toBN(n: Numberish, decimal: BigNumberish = 0): BN {
  if (n instanceof BN) return n;
  return new BN(
    toFraction(n)
      .mul(TEN.pow(new BN(String(decimal))))
      .toFixed(0)
  );
}

async function sendMultiTransaction(
  transactions: Transaction[],
  connection: Connection,
  signAllTransactions:
    | undefined
    | ((transaction: Transaction[]) => Promise<Transaction[]>)
) {
  return async () => {
    try {
      const allSignedTransactions = transactions; //should not need to signAllTransactions under limited scope of test

      const txids = allSignedTransactions.map((st, i) =>
        sendSignedTransaction(
          st,
          connection,
          true,
          allSignedTransactions.length,
          i
        )
      );

      return {
        allSuccess: true,
        txids: txids,
      };
    } catch (err) {
      console.log(err);
      return {
        allSuccess: false,
        txids: [],
      };
    }
  };
}

export function toTokenAmount(
  amount: Numberish,
  coin: Token,
  alreadyDecimaled: boolean
) {
  const numberDetails = parseNumberInfo(amount);

  const amountBigNumber = toBN(
    alreadyDecimaled
      ? new Fraction(numberDetails.numerator, numberDetails.denominator).mul(
          new BN(10).pow(new BN(coin.decimals))
        )
      : amount
      ? toFraction(amount)
      : toFraction(0)
  );

  const issol = isQuantumSOLVersionSOL(coin);

  return issol
    ? toQuantumSolAmount({ solRawAmount: amountBigNumber })
    : new TokenAmount(coin, amountBigNumber);
}

const handleSwap = async (
  connection: Connection,
  routes: RouteInfo[],
  routeType: RouteType,
  tokenAccountRawInfos: TokenAccount[],
  owner: PublicKey,
  coinInTokenAmount: TokenAmount,
  coinOut: Token,
  minReceived: Numberish,
  alreadyDecimaled: boolean
) => {
  const { signAllTransactions, publicKey } = useWallet();

  const amountOutBeforeDeUI = toTokenAmount(
    minReceived,
    coinOut,
    alreadyDecimaled
  );

  const { setupTransaction, tradeTransaction } =
    await Trade.makeTradeTransaction({
      connection,
      routes,
      routeType,
      fixedSide: "in", // TODO: currently  only fixed in
      userKeys: { tokenAccounts: tokenAccountRawInfos, owner },
      amountIn: deUITokenAmount(coinInTokenAmount), // TODO: currently  only fixed upper side
      amountOut: deUITokenAmount(amountOutBeforeDeUI),
    });

  const signedTransactions = shakeNullItems(
    await asyncMap([setupTransaction, tradeTransaction], (merged) => {
      if (!merged) return;
      const { transaction, signers } = merged;
      return loadTransaction({ transaction: transaction, signers });
    })
  );

  const finalInfos = await sendMultiTransaction(
    signedTransactions,
    connection,
    signAllTransactions
  );

  return finalInfos;
};

export default handleSwap;
