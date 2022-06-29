import {
  useEffect,
  useState,
} from 'react';

import ky from 'ky';

import { Connection } from '@solana/web3.js';

const devRpcConfig: Omit<Config, "success"> = {
  rpcs: [
    // { name: 'genesysgo', url: 'https://raydium.genesysgo.net', weight: 0 }
    // { name: 'rpcpool', url: 'https://raydium.rpcpool.com', weight: 100 }
    // { url: 'https://arbirgis.rpcpool.com/', weight: 100 },
    // { url: 'https://solana-api.projectserum.com', weight: 100 }
    { name: "beta-mainnet", url: "https://api.mainnet-beta.solana.com/" },
    { name: "api.mainnet", url: "https://api.mainnet.rpcpool.com/" },
    { name: "tt", url: "https://solana-api.tt-prod.net" },
    { name: "apricot", url: "https://apricot-main-67cd.mainnet.rpcpool.com/" },
  ],
  strategy: "speed",
};

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
    ky.get("https://api.raydium.io/v2/main/rpcs")
      .json()
      .then(async (data: any) => {
        // jFetch<Config>("https://api.raydium.io/v2/main/rpcs")
        if (!data) return;

        const selectedEndpointUrl = await calculateEndpointUrlByRpcConfig(data);
        const connection = new Connection(selectedEndpointUrl, "confirmed");

        // setAvailableEndPoints(data.rpcs);
        // setAutoEndPoint(selectedEndpointUrl);
        // setCurrentEndPoint(selectedEndpointUrl);
        setConnection(connection);
      });
  }, []);

  return connection;
}
