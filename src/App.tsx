import './App.scss';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { BigNumber } from 'bignumber.js';

import {
  Token,
  TokenAccount,
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

  //sol balance
  const [solBalance, setSolBalance] = useState("0");
  useEffect(() => {
    if (!connection) return;
    if (!owner) return;
    (async () => {
      const _balance = await connection.getBalance(owner);
      const solBalanceBigNum = new BigNumber(_balance).dividedBy(
        new BigNumber(1000000000)
      );
      setSolBalance(solBalanceBigNum.toString());
    })();
  }, [connection, owner]);

  //ray balance
  const [rayBalance, setRayBalance] = useState("0");
  useEffect(() => {
    if (!connection) return;
    if (!owner) return;
    (async () => {
      const _balances = await connection.getTokenAccountsByOwner(owner, {
        mint: RAYMint,
      });
      console.log("wallet balances");
      console.log(_balances);
      // setRayBalance(_balance.value.amount);
    })();
  }, [connection, owner]);

  //liquidity pool json data from raydium
  const liquidityPoolsList = useLiquidityPoolList();

  //controller state
  const [reversed, setReversed] = useState<boolean>(false);

  //user input
  const [userInput, setUserInput] = useState<string>("");

  //** input => calc*/
  //coinIn
  const [coinIn, setCoinIn] = useState<Token>(QuantumSOLVersionSOL);
  const [coinInAmount, setCoinInAmount] = useState<Numberish>();

  //coinOut
  const [coinOut, setCoinOut] = useState<Token>(RAYToken);
  const [coinOutAmount, setCoinOutAmount] = useState<string>();

  //validation
  const coinInValidPattern = useMemo(
    () => new RegExp(`^(\\d*)(\\.\\d{0,${coinIn.decimals ?? 0}})?$`),
    [coinIn]
  );
  useEffect(() => {
    if (!userInput) setCoinOutAmount(undefined);
    const satisfied = coinInValidPattern.test(userInput ?? "");
    if (!satisfied) {
      const matched = userInput?.match(
        `^(\\d*)(\\.\\d{0,${coinIn.decimals ?? 0}})?(\\d*)$`
      );
      const [, validInt = "", validDecimal = ""] = matched ?? [];
      const sliced = validInt + validDecimal;
      setUserInput(sliced);
    }
  }, [userInput, coinIn, coinInValidPattern]);
  //validated update to state
  useEffect(() => {
    setCoinInAmount(userInput);
  }, [userInput]);

  const [slippageTolerance, setSlippageTolerance] = useState<Numberish>(0.01);

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

  useEffect(() => {
    if (!minReceived) return;
    setCoinOutAmount(minReceived);
  }, [minReceived]);

  //execute swap
  const swap = useCallback(() => {
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
      coinIn,
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
    coinIn,
    coinInAmount,
    coinOut,
    minReceived,
    signAllTransactions,
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
              <span>
                {!owner
                  ? "Balance: (wallet not connected)"
                  : "Balance: " + solBalance}
              </span>
            </div>
            <div className="action">
              <div className="coin-label">
                <div className="coin-icon solana" />
                <span>SOL</span>
              </div>
              {!reversed ? (
                <input
                  type="number"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                />
              ) : (
                <div className="coin-out-amt">
                  {coinOutAmount ? coinOutAmount.toString() : ""}
                </div>
              )}
            </div>
          </div>
          {executionPrice ? (
            <div className="swap-price-indicator">
              <span>{!reversed ? "1 SOL ≈ " : "1 RAY ≈ "}</span>
              <span>{executionPrice.toFixed(4)}</span>
              <span>{!reversed ? " RAY" : " SOL"}</span>
            </div>
          ) : null}
          <div
            className="reverse"
            onClick={() => {
              if (!reversed) {
                setReversed(true);
                setCoinIn(RAYToken);
                setCoinOut(QuantumSOLVersionSOL);
              } else {
                setReversed(false);
                setCoinIn(QuantumSOLVersionSOL);
                setCoinOut(RAYToken);
              }
            }}
          >
            <ReverseIcon />
          </div>
          <div className={"coin ray" + (reversed ? " reversed in" : " out")}>
            <div className="labels">
              <span>{reversed ? "From" : "To"}</span>
              <span>
                {!owner
                  ? "Balance: (wallet not connected)"
                  : "Balance: " + rayBalance}
              </span>
            </div>
            <div className="action">
              <div className="coin-label">
                <div className="coin-icon raydium" />
                <span>RAY</span>
              </div>
              {reversed ? (
                <input
                  type="number"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                />
              ) : (
                <div className="coin-out-amt">
                  {coinOutAmount ? coinOutAmount.toString() : ""}
                </div>
              )}
            </div>
          </div>
        </div>
        {}
      </div>
      {!owner ? (
        <span className="plz-connect">Please connect wallet</span>
      ) : !isMeaningfulNumber(coinInAmount) ? (
        <span className="plz-enter">Please enter an amount</span>
      ) : new BigNumber(coinInAmount.toString()).comparedTo(
          new BigNumber(reversed ? rayBalance : solBalance)
        ) === 1 ? (
        <span className="plz-lower">
          Insufficient {reversed ? "RAY" : "SOL"} balance
        </span>
      ) : (
        <button className="execute-swap" onClick={swap}>
          Swap
        </button>
      )}
    </div>
  );
}

export default App;
