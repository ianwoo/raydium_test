import {
  useEffect,
  useState,
} from 'react';

import { Connection } from '@solana/web3.js';

import jFetch from '../utils/jFetch';

export type Endpoint = {
  name?: string;
  url: string;
  weight?: number;
  isUserCustomized?: true;
};

export type Config = {
  strategy: "speed" | "weight";
  success: boolean;
  rpcs: Endpoint[];
};

const devRpcConfig: Omit<Config, "success"> = {
  rpcs: [
    // { name: 'genesysgo', url: 'https://raydium.genesysgo.net', weight: 0 }
    // { name: 'rpcpool', url: 'https://raydium.rpcpool.com', weight: 100 }
    // { url: 'https://arbirgis.rpcpool.com/', weight: 100 },
    // { url: 'https://solana-api.projectserum.com', weight: 100 }
    {
      name: "beta-mainnet",
      weight: 100,
      url: "https://api.mainnet-beta.solana.com/",
    },
    { name: "api.mainnet", url: "https://api.mainnet.rpcpool.com/" },
    { name: "tt", url: "https://solana-api.tt-prod.net" },
    { name: "apricot", url: "https://apricot-main-67cd.mainnet.rpcpool.com/" },
  ],
  strategy: "weight",
};

async function calculateEndpointUrlByRpcConfig({
  strategy,
  rpcs,
}: Config): Promise<string> {
  return strategy === "weight"
    ? getEndpointUrlByWeight(rpcs)
    : getEndpointUrlBySpeed(rpcs);
}
function getEndpointUrlByWeight(endpoints: Endpoint[]): string {
  let pointer = 0;
  const random = Math.random() * 100;
  let api = endpoints[0].url;

  for (const endpoint of endpoints) {
    if (random > pointer + (endpoint.weight ?? 0)) {
      pointer += pointer + (endpoint.weight ?? 0);
    } else {
      api = endpoint.url;
      break;
    }
  }
  return api;
}

async function getEndpointUrlBySpeed(endpoints: Endpoint[]): Promise<string> {
  try {
    const result = Promise.any(
      endpoints.map(({ url }) =>
        fetch(url, {
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getEpochInfo",
          }),
        }).then((res) => (res.ok ? Promise.resolve(url) : Promise.reject(res)))
      )
    );
    return await result;
  } catch (err) {
    console.error(err);
    return " ";
  }
}

type RpcCallResponse = {
  rpcs: Endpoint[];
};

export default function useConnectionInit() {
  // const [availableEndPoints, setAvailableEndPoints] = useState();
  // const [autoEndPoint, setAutoEndPoint] = useState<string>();
  // const [currentEndPoint, setCurrentEndPoint] = useState<string>();
  const [connection, setConnection] = useState<Connection>();

  useEffect(() => {
    jFetch<Config>("https://api.raydium.io/v2/main/rpcs").then(
      async (data: any) => {
        if (!data) return;

        // dev test
        if (!globalThis.location.host.includes("raydium.io")) {
          Reflect.set(data, "rpcs", devRpcConfig.rpcs);
          Reflect.set(data, "strategy", devRpcConfig.strategy);
        }

        const selectedEndpointUrl = await calculateEndpointUrlByRpcConfig(data);
        const connectionInit = new Connection(selectedEndpointUrl, "confirmed");

        // setAvailableEndPoints(data.rpcs);
        // setAutoEndPoint(selectedEndpointUrl);
        // setCurrentEndPoint(selectedEndpointUrl);
        setConnection(connectionInit);
      }
    );
  }, []);

  return connection;
}
