import {
  useEffect,
  useState,
} from 'react';

import ky from 'ky';

import { LiquidityPoolJsonInfo } from '@raydium-io/raydium-sdk';

export default function useLiquidityPoolList() {
  const [liquidityPoolsList, setLiquidityPoolsList] = useState<
    LiquidityPoolJsonInfo[]
  >([]);

  useEffect(() => {
    ky.get("https://api.raydium.io/v2/sdk/liquidity/mainnet.json")
      .json()
      .then(async (data: any) => {
        if (!data) return;
        setLiquidityPoolsList(data);
      });
  }, []);

  return liquidityPoolsList;
}
