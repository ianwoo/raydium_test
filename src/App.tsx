import './App.css';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Token,
  TokenAccount,
  TokenAmount,
} from '@raydium-io/raydium-sdk';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  Connection,
  PublicKey,
} from '@solana/web3.js';

import useCalculateSwap from './hooks/useCalculateSwap';
import useConnectionInit from './hooks/useConnectionInit';
import useLiquidityPoolList from './hooks/useLiquidityPoolList';
import logo from './logo.svg';
import { RAYMint } from './services/getLiquidity';
import { getWalletTokenAccounts } from './services/getWalletTokenAccounts';
import handleSwap, {
  Numberish,
  QuantumSOLVersionSOL,
} from './services/handleSwap';

const RAYToken: Token = new Token(RAYMint, 6, "RAY", "Raydium");

const getTokenAccountRawInfos = async (
  connection: Connection,
  owner: PublicKey
) => {
  return getWalletTokenAccounts({ connection, owner });
};

function App() {
  const connection = useConnectionInit();

  const { publicKey: owner, signAllTransactions } = useWallet();

  const liquidityPoolsList = useLiquidityPoolList();

  //input => calc
  const [coinIn, setCoinIn] = useState<Token>(QuantumSOLVersionSOL);
  const [coinInAmount, setCoinInAmount] = useState<TokenAmount>();

  const [coinOut, setCoinOut] = useState<Token>(RAYToken);

  const [slippageTolerance, setSlippageTolerance] = useState<Numberish>();

  const [tokenAccountRawInfos, setTokenAccountRawInfos] =
    useState<TokenAccount[]>();

  useEffect(() => {
    if (!connection) return;
    if (!owner) return;
    getTokenAccountRawInfos(connection, owner).then((res) => {
      const { accounts, rawInfos } = res;
      setTokenAccountRawInfos(rawInfos);
    });
  }, [connection, owner]);

  const {
    fee,
    routes,
    minReceived,
    priceImpact,
    executionPrice,
    currentPrice,
    routeType,
  } = useCalculateSwap(
    connection,
    coinIn,
    coinOut,
    coinInAmount,
    slippageTolerance,
    liquidityPoolsList
  );

  const swap = useMemo(() => {
    if (!connection) return; //handle error case? but this should never happen, should block swap if no connection
    if (!owner) return; //''
    if (!tokenAccountRawInfos) return; //''
    if (!coinInAmount) return; //''
    if (!minReceived) return; //''
    if (!routes) return; //''
    handleSwap(
      connection,
      routes,
      "amm",
      tokenAccountRawInfos,
      owner,
      coinInAmount,
      coinOut,
      minReceived,
      true,
      signAllTransactions
    );
  }, [
    connection,
    routes,
    tokenAccountRawInfos,
    owner,
    coinInAmount,
    coinOut,
    minReceived,
  ]);

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>

        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
