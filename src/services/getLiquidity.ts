import { PublicKeyish } from '@raydium-io/raydium-sdk';
import {
  Connection,
  PublicKey,
} from '@solana/web3.js';

import { toPubString } from './handleSwap';

export const SOLUrlMint = "sol";

export const WSOLMint = new PublicKey(
  "So11111111111111111111111111111111111111112"
);

export const RAYMint = new PublicKey(
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R"
);

function toDataMint(mintlike: PublicKeyish | undefined): string {
  return String(mintlike) === SOLUrlMint
    ? String(WSOLMint)
    : String(mintlike ?? "");
}

const findLiquidityInfoByTokenMint = async (
  coin1Mintlike: PublicKeyish | undefined,
  coin2Mintlike: PublicKeyish | undefined,
  connection: Connection,
  jsonInfos: any[] //need to pull this in through a separate hook
) => {
  const coin1Mint = toDataMint(coin1Mintlike);
  const coin2Mint = toDataMint(coin2Mintlike);

  if (!coin1Mint || !coin2Mint)
    return { availables: [], best: undefined, routeRelated: [] };
  const mint1 = String(coin1Mint);
  const mint2 = String(coin2Mint);

  /** swap's route transaction middle token  */
  const routeMiddleMints = [RAYMint, WSOLMint].map(toPubString);
  const candidateTokenMints = routeMiddleMints.concat([mint1, mint2]);
  const onlyRouteMints = routeMiddleMints.filter(
    (routeMint) => ![mint1, mint2].includes(routeMint)
  );
  const routeRelated = jsonInfos.filter((info) => {
    const isCandidate =
      candidateTokenMints.includes(info.baseMint) &&
      candidateTokenMints.includes(info.quoteMint);
    const onlyInRoute =
      onlyRouteMints.includes(info.baseMint) &&
      onlyRouteMints.includes(info.quoteMint);
    return isCandidate && !onlyInRoute;
  });

  return routeRelated;
};

export default findLiquidityInfoByTokenMint;
