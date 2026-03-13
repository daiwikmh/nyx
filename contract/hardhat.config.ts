import type { HardhatUserConfig } from "hardhat/config";
import "@parity/hardhat-polkadot";
import "@parity/hardhat-polkadot-resolc";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.28",
      },
    ],
  },

  resolc: {
    version: "0.3.0",
    compilerSource: "npm",
  },

  networks: {
    hardhat: {
      polkadot: {
        target: "pvm",
      },
      nodeConfig: {
        nodeBinaryPath: "./bin/dev-node",
        rpcPort: 8000,
        dev: true,
      },
      adapterConfig: {
        adapterBinaryPath: "./bin/eth-rpc",
        dev: true,
      },
    },

    localNode: {
      polkadot: {
        target: "pvm",
      },
      url: "http://127.0.0.1:8545",
    },

    polkadotHubTestnet: {
      polkadot: {
        target: "pvm",
      },
      url: "https://eth-rpc-testnet.polkadot.io/",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};

export default config;