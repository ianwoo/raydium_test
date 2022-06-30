import { useState } from 'react';

import BN from 'bn.js';

import {
  CurrencyAmount,
  jsonInfo2PoolKeys,
  Liquidity,
  LiquidityPoolJsonInfo,
  Percent,
  Price,
  PublicKeyish,
  ReplaceType,
  RouteInfo,
  RouteType,
  Token,
  Trade,
  ZERO,
} from '@raydium-io/raydium-sdk';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  Connection,
  PublicKey,
} from '@solana/web3.js';

import findLiquidityInfoByTokenMint from '../services/getLiquidity';
import {
  Numberish,
  parseNumberInfo,
  toBN,
  toFraction,
  toFractionWithDecimals,
  toPubString,
  toTokenAmount,
} from '../services/handleSwap';
import {
  deUIToken,
  deUITokenAmount,
} from '../utils/deUITokenAmount';
import useAsyncEffect from './useAsyncEffect';

export type HexAddress = string;

type SDKParsedLiquidityInfo = ReplaceType<
  LiquidityPoolJsonInfo,
  string,
  PublicKey
> & {
  jsonInfo: LiquidityPoolJsonInfo;
  status: BN; // do not know what is this
  baseDecimals: number;
  quoteDecimals: number;
  lpDecimals: number;
  baseReserve: BN;
  quoteReserve: BN;
  lpSupply: BN;
  startTime: BN;
};

function eq(a: Numberish | undefined, b: Numberish | undefined): boolean {
  if (a == null || b == null) return false;
  const fa = toFraction(a);
  const fb = toFraction(b);
  return toBN(fa.sub(fb).numerator).eq(ZERO);
}

const stringNumberRegex = /(-?)([\d,_]*)\.?(\d*)/;

function trimTailingZero(s: string) {
  // no decimal part
  if (!s.includes(".")) return s;
  const [, sign, int, dec] = s.match(stringNumberRegex) ?? [];
  let cleanedDecimalPart = dec;
  while (cleanedDecimalPart.endsWith("0")) {
    cleanedDecimalPart = cleanedDecimalPart.slice(
      0,
      cleanedDecimalPart.length - 1
    );
  }
  return cleanedDecimalPart
    ? `${sign}${int}.${cleanedDecimalPart}`
    : `${sign}${int}` || "0";
}

function isString(val: unknown): val is string {
  return typeof val === "string";
}

function toString(
  n: Numberish | null | undefined,
  options?: {
    /** @default 'auto' / 'auto [decimals]' */
    decimalLength?: number | "auto" | "auto " | `auto ${number}`;
    /** whether set zero decimal depends on how you get zero. if you get it from very samll number, */
    zeroDecimalNotAuto?: boolean;
  }
): string {
  if (n == null) return "";
  const { fr, decimals } = toFractionWithDecimals(n);
  let result = "";
  const decimalLength =
    options?.decimalLength ?? (decimals != null ? `auto ${decimals}` : "auto");
  if (decimalLength === "auto") {
    result = trimTailingZero(fr.toFixed(6)); // if it is not tokenAmount, it will have max 6 decimal
  } else if (isString(decimalLength) && decimalLength.startsWith("auto")) {
    const autoDecimalLength = Number(decimalLength.split(" ")[1]);
    result = trimTailingZero(fr.toFixed(autoDecimalLength));
  } else {
    result = fr.toFixed(decimalLength as number);
  }
  // for decimal-not-auto zero
  if (eq(result, 0) && options?.zeroDecimalNotAuto) {
    const decimalLength = Number(
      String(options.decimalLength ?? "").match(/auto (\d*)/)?.[1] ?? 6
    );
    return `0.${"0".repeat(decimalLength)}`;
  } else {
    // for rest
    return result;
  }
}

export function toPercent(
  n: Numberish,
  options?: { /* usually used for backend data */ alreadyDecimaled?: boolean }
) {
  const { numerator, denominator } = parseNumberInfo(n);
  return new Percent(
    new BN(numerator),
    new BN(denominator).mul(options?.alreadyDecimaled ? new BN(100) : new BN(1))
  );
}

function isMintEqual(
  p1: Token | PublicKeyish | undefined,
  p2: Token | PublicKeyish | undefined
) {
  if (p1 == undefined || p2 == undefined) return false;
  const publicKeyish1 = p1 instanceof Token ? p1.mint : p1;
  const publicKeyish2 = p2 instanceof Token ? p2.mint : p2;
  if (p1 instanceof PublicKey && p2 instanceof PublicKey) return p1.equals(p2);
  return String(publicKeyish1) === String(publicKeyish2);
}

export async function sdkParseJsonLiquidityInfo(
  liquidityJsonInfos: LiquidityPoolJsonInfo[],
  connection: Connection
): Promise<SDKParsedLiquidityInfo[]> {
  if (!connection) return [];
  if (!liquidityJsonInfos.length) return []; // no jsonInfo
  try {
    const info = await Liquidity.fetchMultipleInfo({
      connection,
      pools: liquidityJsonInfos.map(jsonInfo2PoolKeys),
    });
    const result = info.map((sdkParsed, idx) => ({
      jsonInfo: liquidityJsonInfos[idx],
      ...jsonInfo2PoolKeys(liquidityJsonInfos[idx]),
      ...sdkParsed,
    }));
    return result;
  } catch (err) {
    console.error(err);
    return [];
  }
}

type SwapCalculatorInfo = {
  executionPrice: ReturnType<
    typeof Trade["getBestAmountOut"]
  >["executionPrice"];
  currentPrice: ReturnType<typeof Trade["getBestAmountOut"]>["currentPrice"];
  priceImpact: ReturnType<typeof Trade["getBestAmountOut"]>["priceImpact"];
  routes: ReturnType<typeof Trade["getBestAmountOut"]>["routes"];
  routeType: ReturnType<typeof Trade["getBestAmountOut"]>["routeType"];
  fee: ReturnType<typeof Trade["getBestAmountOut"]>["fee"];
  info:
    | { amountOut: string; minAmountOut: string }
    | { amountIn: string; maxAmountIn: string };
};

async function calculatePairTokenAmount(
  coinIn: Token,
  coinInAmount: Numberish, //handle undefined in the component, not the logic
  coinOut: Token,
  connection: Connection,
  slippageTolerance: Numberish,
  liquidityPoolsList: LiquidityPoolJsonInfo[]
): Promise<SwapCalculatorInfo | undefined> {
  const coinInTokenAmount = toTokenAmount(coinInAmount, coinIn, true);

  const routeRelated = await findLiquidityInfoByTokenMint(
    coinIn.mint,
    coinOut.mint,
    liquidityPoolsList
  );

  if (routeRelated.length) {
    const sdkParsedInfos = await (async () =>
      await sdkParseJsonLiquidityInfo(routeRelated, connection))();

    const pools = routeRelated.map(
      (jsonInfo: LiquidityPoolJsonInfo, idx: number) => ({
        poolKeys: jsonInfo2PoolKeys(jsonInfo),
        poolInfo: sdkParsedInfos[idx],
      })
    );

    const {
      amountOut,
      minAmountOut,
      executionPrice,
      currentPrice,
      priceImpact,
      routes,
      routeType,
      fee,
    } = Trade.getBestAmountOut({
      pools,
      currencyOut: deUIToken(coinOut),
      amountIn: deUITokenAmount(coinInTokenAmount),
      slippage: toPercent(slippageTolerance),
    });
    console.log(
      "{ amountOut, minAmountOut, executionPrice, currentPrice, priceImpact, routes, routeType, fee }: ",
      {
        amountOut,
        minAmountOut,
        executionPrice,
        currentPrice,
        priceImpact,
        routes,
        routeType,
        fee,
      }
    );

    const sdkParsedInfoMap = new Map(
      sdkParsedInfos.map((info: any) => [toPubString(info.id), info])
    );

    //we know that SOL is swappable with RAY.

    // const swapable = choosedSdkParsedInfos.every(
    //   (info) => Liquidity.getEnabledFeatures(info).swap
    // );

    return {
      executionPrice,
      currentPrice,
      priceImpact,
      routes,
      routeType,
      fee,
      info: {
        amountOut: amountOut.toExact(), //'toUITokenAmount' - handle in component
        minAmountOut: minAmountOut.toExact(), //'toUITokenAmount' - handle in component
      },
    };
  }
}

export type CalcSwapReturn = {
  fee: CurrencyAmount[] | undefined;
  routes: RouteInfo[] | undefined;
  minReceived: string | undefined;
  priceImpact: Percent | undefined;
  executionPrice: Price | null | undefined;
  currentPrice?: Price | null;
  routeType?: RouteType;
};

function useCalculateSwap(
  connection: Connection | undefined,
  coinIn: Token | undefined,
  coinOut: Token,
  coinInAmount: Numberish | undefined,
  slippageTolerance: Numberish | undefined,
  liquidityPoolsList: LiquidityPoolJsonInfo[] //pull this in only ONCE using ky
): CalcSwapReturn {
  const { connected } = useWallet();

  const [calcSwapReturn, setCalcSwapReturn] = useState<CalcSwapReturn>({
    fee: undefined,
    minReceived: undefined,
    routes: undefined,
    priceImpact: undefined,
    executionPrice: undefined,
  });

  // if don't check focusSideCoin, it will calc twice.
  // one for coin1Amount then it will change coin2Amount
  // changing coin2Amount will cause another calc
  useAsyncEffect(async () => {
    if (
      !connection ||
      !coinIn ||
      !coinInAmount ||
      !coinOut ||
      !slippageTolerance
    ) {
      //RESET STATE

      setCalcSwapReturn({
        fee: undefined,
        minReceived: undefined,
        routes: undefined,
        priceImpact: undefined,
        executionPrice: undefined,
      });
      return;
    }

    const liquidityInfo = findLiquidityInfoByTokenMint(
      coinIn.mint,
      coinOut.mint,
      liquidityPoolsList
    );

    // only one direction, due to swap route's `Trade.getBestAmountIn()` is not ready\
    //therefore no need for 'maxSpent'

    try {
      const calcResult = await calculatePairTokenAmount(
        coinIn,
        coinInAmount,
        coinOut,
        connection,
        slippageTolerance,
        liquidityPoolsList
      );

      const {
        routes,
        priceImpact,
        executionPrice,
        currentPrice,
        routeType,
        fee,
      } = calcResult ?? {};
      const { amountOut, minAmountOut } = (calcResult?.info ?? {}) as {
        amountOut?: string;
        minAmountOut?: string;
      };
      setCalcSwapReturn({
        fee: fee,
        routes: routes,
        priceImpact: priceImpact,
        executionPrice: executionPrice,
        currentPrice: currentPrice,
        minReceived: minAmountOut,
        routeType: routeType,
      });
    } catch (err) {
      console.error(err);
    }
  }, [
    coinIn,
    coinOut,
    coinInAmount,
    slippageTolerance,
    connection,
    // pathname,
    // refreshCount,
    connected, // init fetch data
  ]);

  return calcSwapReturn;
}

export default useCalculateSwap;
