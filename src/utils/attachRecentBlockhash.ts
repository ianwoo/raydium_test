import { useWallet } from '@solana/wallet-adapter-react';
import {
  Connection,
  Transaction,
} from '@solana/web3.js';

import useConnectionInit from './useConnectionInit';

export async function attachRecentBlockhash(...transactions: Transaction[]) {
  const connection = useConnectionInit();
  const { publicKey } = useWallet();

  for await (const transaction of transactions) {
    if (!transaction.recentBlockhash) {
      // recentBlockhash may already attached by sdk
      connection &&
        (transaction.recentBlockhash = await getRecentBlockhash(connection));
    }
    publicKey && (transaction.feePayer = publicKey);
  }
}

export async function getRecentBlockhash(connection: Connection) {
  return (await connection.getLatestBlockhash?.())?.blockhash;
}
