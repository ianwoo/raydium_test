import {
  Connection,
  Transaction,
} from '@solana/web3.js';

export default async function sendSignedTransaction(
  txn: Transaction,
  connection: Connection,
  multiTxn?: boolean,
  multiTxnLength?: number,
  idx?: number
) {
  try {
    const txid = await (async () => {
      return await connection.sendRawTransaction(txn.serialize(), {
        skipPreflight: true,
      });
    })();

    return txid;
  } catch (err) {
    console.error(err);
    //TO DO: error modal
  } finally {
    //TO DO: other state management
  }
}
