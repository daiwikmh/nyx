import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

const RPC_URL = "https://eth-rpc-testnet.polkadot.io/";
const PRIVATE_KEY = process.env.PRIVATE_KEY!;

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("Deployer:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "DOT");

  // Load the compiled artifact
  const artifact = require("../artifacts/contracts/WardenCLOB.sol/WardenCLOB.json");

  console.log("\nDeploying WardenCLOB...");
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const clob = await factory.deploy(wallet.address);
  console.log("Tx hash:", clob.deploymentTransaction()?.hash);

  await clob.waitForDeployment();
  const address = await clob.getAddress();
  console.log("WardenCLOB deployed at:", address);
  console.log("\nNext: upload engine.polkavm, then call setEngine(<address>)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
