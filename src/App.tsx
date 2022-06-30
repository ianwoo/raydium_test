import './App.scss';

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

import useCalculateSwap, { eq } from './hooks/useCalculateSwap';
import useConnectionInit from './hooks/useConnectionInit';
import useLiquidityPoolList from './hooks/useLiquidityPoolList';
import { RAYMint } from './services/getLiquidity';
import { getWalletTokenAccounts } from './services/getWalletTokenAccounts';
import handleSwap, {
  Numberish,
  QuantumSOLVersionSOL,
} from './services/handleSwap';
import ReverseIcon from './svgs/ReverseIcon';

const RAYToken: Token = new Token(RAYMint, 6, "RAY", "Raydium");

const getTokenAccountRawInfos = async (
  connection: Connection,
  owner: PublicKey
) => {
  return getWalletTokenAccounts({ connection, owner });
};

function isMeaningfulNumber(n: Numberish | undefined): n is Numberish {
  if (n == null) return false;
  return !eq(n, 0);
}

function App() {
  //init solana connection
  const connection = useConnectionInit();
  //solana wallet
  const { publicKey: owner, signAllTransactions } = useWallet();
  //liquidity pool json data from raydium
  const liquidityPoolsList = useLiquidityPoolList();

  //controller state
  const [reversed, setReversed] = useState<boolean>(false);

  //user input
  const [userInput, setUserInput] = useState<string>("");

  //** input => calc*/
  //coinIn
  const [coinIn, setCoinIn] = useState<Token>(QuantumSOLVersionSOL);
  const [coinInAmount, setCoinInAmount] = useState<TokenAmount>();

  //coinOut
  const [coinOut, setCoinOut] = useState<Token>(RAYToken);
  const [coinOutAmount, setCoinOutAmount] = useState<TokenAmount>();

  //validation
  const coinInValidPattern = useMemo(
    () => new RegExp(`^(\\d*)(\\.\\d{0,${coinIn.decimals ?? 0}})?$`),
    [coinIn]
  );
  const coinOutValidPattern = useMemo(
    () => new RegExp(`^(\\d*)(\\.\\d{0,${coinOut.decimals ?? 0}})?$`),
    [coinOut]
  );
  useEffect(() => {
    const satisfied = coinInValidPattern.test(userInput ?? "");
    if (!satisfied) {
      const matched = userInput?.match(
        `^(\\d*)(\\.\\d{0,${coinIn?.decimals ?? 0}})?(\\d*)$`
      );
      const [, validInt = "", validDecimal = ""] = matched ?? [];
      const sliced = validInt + validDecimal;
      setUserInput(sliced);
    }
  }, [coinIn, coinInValidPattern]);
  useEffect(() => {
    const satisfied = coinInValidPattern.test(userInput ?? "");
    if (!satisfied) {
      const matched = userInput?.match(
        `^(\\d*)(\\.\\d{0,${coinIn?.decimals ?? 0}})?(\\d*)$`
      );
      const [, validInt = "", validDecimal = ""] = matched ?? [];
      const sliced = validInt + validDecimal;
      setUserInput(sliced);
    }
  }, [coinOut, coinOutValidPattern]);

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

  //** calc => output */
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
  //execute swap
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

  const hasSwapDetermined =
    isMeaningfulNumber(coinInAmount) &&
    isMeaningfulNumber(coinOutAmount) &&
    executionPrice;

  return (
    <div className="app">
      <div className="swap-wrapper">
        <div className="swap">
          <div className={"coin sol" + (reversed ? " reversed out" : " in")}>
            <div className="labels">
              <span>{reversed ? "To" : "From"}</span>
              <span>Balance: (wallet not connected)</span>
            </div>
            <div className="action">
              <div className="coin-label">
                <div className="coin-icon solana" />
                <span>SOL</span>
              </div>
              {!reversed ? (
                <input type="number"></input>
              ) : (
                <div>{coinOutAmount ? coinOutAmount.toString() : ""}</div>
              )}
            </div>
          </div>
          <div className="reverse" onClick={() => setReversed(!reversed)}>
            <ReverseIcon />
          </div>
          <div className={"coin ray" + (reversed ? " reversed in" : " out")}>
            <div className="labels">
              <span>{reversed ? "From" : "To"}</span>
              <span>Balance: (wallet not connected)</span>
            </div>
            <div className="action">
              <div className="coin-label">
                <div className="coin-icon raydium" />
                <span>RAY</span>
              </div>
              {reversed ? (
                <input type="number"></input>
              ) : (
                <div>{coinOutAmount ? coinOutAmount.toString() : ""}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
