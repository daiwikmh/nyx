// Deploy MockUSDC + WardenCLOB + Engine in one shot
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

const RPC_URL = "https://eth-rpc-testnet.polkadot.io/";
const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const USDC_SUPPLY = 1_000_000n * 1_000_000n; // 1M USDC (6 decimals)

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("Deployer:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", (Number(balance) / 1e8).toFixed(4), "PAS\n");

  // 1. Deploy MockUSDC
  console.log("1) Deploying MockUSDC...");
  const usdcArtifact = require("../artifacts/contracts/MockUSDC.sol/MockUSDC.json");
  const usdcFactory = new ethers.ContractFactory(usdcArtifact.abi, usdcArtifact.bytecode, wallet);
  const usdc = await usdcFactory.deploy(USDC_SUPPLY);
  await usdc.waitForDeployment();
  const usdcAddr = await usdc.getAddress();
  console.log("   MockUSDC:", usdcAddr);

  // 2. Deploy WardenCLOB
  console.log("2) Deploying WardenCLOB...");
  const clobArtifact = require("../artifacts/contracts/WardenCLOB.sol/WardenCLOB.json");
  const clobFactory = new ethers.ContractFactory(clobArtifact.abi, clobArtifact.bytecode, wallet);
  const clob = await clobFactory.deploy(wallet.address, usdcAddr);
  await clob.waitForDeployment();
  const clobAddr = await clob.getAddress();
  console.log("   WardenCLOB:", clobAddr);

  // 3. Deploy engine blob
  console.log("3) Deploying engine...");
  const blobPath = path.resolve(__dirname, "../../engine/engine.polkavm");
  const blob = fs.readFileSync(blobPath);
  console.log("   Blob:", blob.length, "bytes");
  const engineTx = await wallet.sendTransaction({
    data: "0x" + blob.toString("hex"),
  });
  const engineReceipt = await engineTx.wait();
  const engineAddr = engineReceipt?.contractAddress!;
  console.log("   Engine:", engineAddr);

  // 4. Wire engine to CLOB
  console.log("4) Calling setEngine...");
  const clobContract = new ethers.Contract(clobAddr, clobArtifact.abi, wallet);
  const setTx = await clobContract.setEngine(engineAddr);
  await setTx.wait();
  console.log("   Engine wired!\n");

  // Summary
  console.log("=== DEPLOYED ===");
  console.log("MockUSDC:    ", usdcAddr);
  console.log("WardenCLOB:  ", clobAddr);
  console.log("Engine:      ", engineAddr);
  console.log("\nUpdate seed-orders.ts with these addresses.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
