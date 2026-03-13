import { buildModule } from "@nomicfoundation/hardhat-ignition/modules"

const DEPLOYER = "0x445bf5fe58f2Fe5009eD79cFB1005703D68cbF85"

const WardenCLOBModule = buildModule("WardenCLOBModule", (m) => {
    const admin = m.getParameter("admin", DEPLOYER)
    const clob = m.contract("WardenCLOB", [admin])
    return { clob }
})

export default WardenCLOBModule
