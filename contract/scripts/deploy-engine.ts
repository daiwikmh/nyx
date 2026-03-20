import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

const RPC_URL = "https://services.polkadothub-rpc.com/testnet/";
const PRIVATE_KEY = process.env.PRIVATE_KEY!;

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("Deployer:", wallet.address);

  // Read the .polkavm blob
  const blobPath = path.resolve(__dirname, "../../engine/engine.polkavm");
  const blob = fs.readFileSync(blobPath);
  console.log("Engine blob:", blob.length, "bytes");

  // Deploy as a contract — the eth-rpc adapter handles PVM upload+instantiate
  // The blob IS the deployment bytecode for a PVM contract
  console.log("\nDeploying engine...");
  const tx = await wallet.sendTransaction({
    data: "0x" + blob.toString("hex"),
  });
  console.log("Tx hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("Engine deployed at:", receipt?.contractAddress);

  // Now wire it to WardenCLOB
  const CLOB_ADDRESS = "0x504B962fC472ab5ea0C9CF58885f6f6ad6268BF3";
  const clobArtifact = require("../artifacts/contracts/WardenCLOB.sol/WardenCLOB.json");
  const clob = new ethers.Contract(CLOB_ADDRESS, clobArtifact.abi, wallet);

  console.log("\nCalling setEngine(" + receipt?.contractAddress + ")...");
  const setTx = await clob.setEngine(receipt?.contractAddress);
  await setTx.wait();
  console.log("Engine wired to WardenCLOB. Done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
