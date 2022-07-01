import { SendTransactionOptions } from '@solana/wallet-adapter-base';
import {
  Connection,
  Transaction,
} from '@solana/web3.js';

export default async function sendSignedTransaction(
  txn: Transaction,
  connection: Connection,
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: SendTransactionOptions | undefined
  ) => Promise<string>,
  multiTxn?: boolean,
  multiTxnLength?: number,
  idx?: number
) {
  try {
    const txid = await (async () => {
      return await sendTransaction(txn, connection);
    })();
    return txid;
  } catch (err) {
    console.error(err);
    //TO DO: error modal
  } finally {
    //TO DO: other state management
  }
}
