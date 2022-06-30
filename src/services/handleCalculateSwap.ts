import { useEffect } from 'react';

import BN from 'bn.js';

import {
  jsonInfo2PoolKeys,
  Liquidity,
  LiquidityPoolJsonInfo,
  Percent,
  PublicKeyish,
  ReplaceType,
  Token,
  Trade,
  WSOL,
  ZERO,
} from '@raydium-io/raydium-sdk';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  Connection,
  PublicKey,
} from '@solana/web3.js';

import useAsyncEffect from '../hooks/useAsyncEffect';
import {
  deUIToken,
  deUITokenAmount,
} from '../utils/deUITokenAmount';
import findLiquidityInfoByTokenMint from './getLiquidity';
import {
  Numberish,
  parseNumberInfo,
  shakeNullItems,
  toBN,
  toFraction,
  toFractionWithDecimals,
  toPubString,
  toTokenAmount,
} from './handleSwap';

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

function handleCalculateSwap(
  connection: Connection,
  coinIn: Token,
  coinOut: Token,
  coinInAmount: Numberish,
  coinOutAmount: Numberish,
  slippageTolerance: Numberish,
  liquidityPoolsList: LiquidityPoolJsonInfo[] //pull this in only ONCE using ky
) {
  //   const refreshCount = useSwap((s) => s.refreshCount); figure out refresh later

  //REMOVING directionReversed for test
  //   const focusSide = directionReversed ? "coin2" : "coin1"; // temporary focus side is always up, due to swap route's `Trade.getBestAmountIn()` is not ready
  const { connected } = useWallet();

  const liquidityInfo = findLiquidityInfoByTokenMint(
    coinIn.mint,
    coinOut.mint,
    liquidityPoolsList
  );
  //plug this into the UI later

  useEffect(
    () => {
      cleanCalcCache();
    },
    [
      // refreshCount
    ]
  );

  // if don't check focusSideCoin, it will calc twice.
  // one for coin1Amount then it will change coin2Amount
  // changing coin2Amount will cause another calc
  useAsyncEffect(async () => {
    if (!coinIn || !coinOut || !connection) {
      //RESET STATE

      //   useSwap.setState({
      //     fee: undefined,
      //     minReceived: undefined,
      //     maxSpent: undefined,
      //     routes: undefined,
      //     priceImpact: undefined,
      //     executionPrice: undefined,
      //     ...{
      //       [focusSide === "coin1" ? "coin2Amount" : "coin1Amount"]: undefined,
      //     },
      //   });
      return;
    }

    const focusDirectionSide = "up"; // temporary focus side is always up, due to swap route's `Trade.getBestAmountIn()` is not ready
    // focusSide === 'coin1' ? (directionReversed ? 'down' : 'up') : directionReversed ? 'up' : 'down'

    // SOL / WSOL is special
    const inputIsSolWSOL =
      isMintEqual(coinIn, coinOut) && isMintEqual(coinIn, WSOL.mint);
    if (inputIsSolWSOL) {
      if (eq(coinInAmount, coinOutAmount)) return;

      //RESET STATE

      //   useSwap.setState({
      //     fee: undefined,
      //     minReceived: undefined,
      //     maxSpent: undefined,
      //     routes: undefined,
      //     priceImpact: undefined,
      //     executionPrice: undefined,
      //     ...{
      //       [focusSide === "coin1" ? "coin2Amount" : "coin1Amount"]:
      //         focusSide === "coin1"
      //           ? toString(userCoin1Amount)
      //           : toString(userCoin2Amount),
      //     },
      //   });
      return;
    }

    try {
      const calcResult = await calculatePairTokenAmount(
        coinIn,
        coinInAmount,
        coinOut,
        coinOutAmount,
        connection,
        slippageTolerance,
        liquidityPoolsList
      );
      // for calculatePairTokenAmount is async, result maybe droped. if that, just stop it
      const resultStillFresh = (() => {
        // const currentUpCoinAmount =
        //   (directionReversed
        //     ? useSwap.getState().coin2Amount
        //     : useSwap.getState().coin1Amount) || "0";
        // const currentDownCoinAmount =
        //   (directionReversed
        //     ? useSwap.getState().coin1Amount
        //     : useSwap.getState().coin2Amount) || "0";
        // const currentFocusSideAmount =
        //   focusDirectionSide === "up"
        //     ? currentUpCoinAmount
        //     : currentDownCoinAmount;
        // const focusSideAmount =
        //   focusDirectionSide === "up" ? upCoinAmount : downCoinAmount;
        return eq(coinInAmount, coinOutAmount);
      })();
      if (!resultStillFresh) return;

      if (focusDirectionSide === "up") {
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
        // useSwap.setState({
        //   fee,
        //   routes,
        //   priceImpact,
        //   executionPrice,
        //   currentPrice,
        //   minReceived: minAmountOut,
        //   maxSpent: undefined,
        //   routeType,
        //   ...{
        //     [focusSide === "coin1" ? "coin2Amount" : "coin1Amount"]: amountOut,
        //   },
        // });
      } else {
        const {
          routes,
          priceImpact,
          executionPrice,
          currentPrice,
          routeType,
          fee,
        } = calcResult ?? {};
        const { amountIn, maxAmountIn } = (calcResult?.info ?? {}) as {
          amountIn?: string;
          maxAmountIn?: string;
        };
        // useSwap.setState({
        //   fee,
        //   routes,
        //   priceImpact,
        //   executionPrice,
        //   currentPrice,
        //   minReceived: undefined,
        //   maxSpent: maxAmountIn,
        //   swapable,
        //   routeType,
        //   ...{
        //     [focusSide === "coin1" ? "coin2Amount" : "coin1Amount"]: amountIn,
        //   },
        // });
      }
    } catch (err) {
      console.error(err);
    }
  }, [
    coinIn,
    coinOut,
    coinInAmount,
    coinOutAmount,
    slippageTolerance,
    connection,
    // pathname,
    // refreshCount,
    connected, // init fetch data
    liquidityInfo,
  ]);
}

const sdkParsedInfoCache = new Map<HexAddress, SDKParsedLiquidityInfo[]>();

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

function cleanCalcCache() {
  sdkParsedInfoCache.clear();
}

async function calculatePairTokenAmount(
  coinIn: Token,
  coinInAmount: Numberish, //handle undefined in the component, not the logic
  coinOut: Token,
  coinOutAmount: Numberish, //handle undefined in the component, not the logic
  connection: Connection,
  slippageTolerance: Numberish,
  liquidityPoolsList: LiquidityPoolJsonInfo[]
): Promise<SwapCalculatorInfo | undefined> {
  const coinInTokenAmount = toTokenAmount(coinInAmount, coinIn, true);
  const coinOutTokenAmount = toTokenAmount(coinOutAmount, coinOut, true);

  const routeRelated = await findLiquidityInfoByTokenMint(
    coinIn.mint,
    coinOut.mint,
    liquidityPoolsList
  );

  if (routeRelated.length) {
    const key = routeRelated
      .map((jsonInfo: LiquidityPoolJsonInfo) => jsonInfo.id)
      .join("-");
    const sdkParsedInfos = sdkParsedInfoCache.has(key)
      ? sdkParsedInfoCache.get(key)!
      : await (async () => {
          const sdkParsed = await sdkParseJsonLiquidityInfo(
            routeRelated,
            connection
          );
          sdkParsedInfoCache.set(key, sdkParsed);
          return sdkParsed;
        })();

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
    // console.log('{ amountOut, minAmountOut, executionPrice, currentPrice, priceImpact, routes, routeType, fee }: ', {
    //   amountOut,
    //   minAmountOut,
    //   executionPrice,
    //   currentPrice,
    //   priceImpact,
    //   routes,
    //   routeType,
    //   fee
    // })

    const sdkParsedInfoMap = new Map(
      sdkParsedInfos.map((info: any) => [toPubString(info.id), info])
    );
    const choosedSdkParsedInfos = shakeNullItems(
      routes.map((route) => sdkParsedInfoMap.get(toPubString(route.keys.id)))
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
        amountOut: amountOut.toExact(), //'toUITokenAmount' - handle another way
        minAmountOut: minAmountOut.toExact(), //'toUITokenAmount' - handle another way
      },
    };
  }
}

export default handleCalculateSwap;
