import {
  Connection,
  PublicKey,
  Transaction,
} from '@solana/web3.js';

export async function attachRecentBlockhash(
  transactions: Transaction[],
  publicKey: PublicKey,
  connection: Connection
) {
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
