const { ethers, upgrades } = require("hardhat");

async function deployContractFixture() {
  // Get signers
  const [deployer, admin, reportingManager, user1, user2, user3] =
    await ethers.getSigners();

  // Deploy mock ERC20 tokens for testing
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const underlyingToken = await MockERC20.deploy("Test USDC", "TUSDC", 6);
  await underlyingToken.waitForDeployment();

  const altToken = await MockERC20.deploy("Test WETH", "TWETH", 18);
  await altToken.waitForDeployment();

  // Deploy mock Wormhole contracts (required for initialization)
  const MockWormhole = await ethers.getContractFactory("MockWormhole");
  const wormhole = await MockWormhole.deploy();
  await wormhole.waitForDeployment();

  const MockTokenBridge = await ethers.getContractFactory("MockTokenBridge");
  const tokenBridge = await MockTokenBridge.deploy();
  await tokenBridge.waitForDeployment();

  // Deploy mock Uniswap V3 Router (required for initialization)
  const MockUniswapV3 = await ethers.getContractFactory("MockUniswapV3");
  const swapRouter = await MockUniswapV3.deploy();
  await swapRouter.waitForDeployment();

  // Deploy the main contract using upgrades proxy
  const CustomStrategyWormholeV3 = await ethers.getContractFactory(
    "CustomStrategyWormholeV3"
  );
  const strategy = await upgrades.deployProxy(
    CustomStrategyWormholeV3,
    [
      await wormhole.getAddress(),
      await tokenBridge.getAddress(),
      await underlyingToken.getAddress(),
      ethers.encodeBytes32String("solana_aggregator"),
      await swapRouter.getAddress(),
    ],
    {
      initializer: "initialize",
      kind: "transparent",
    }
  );
  await strategy.waitForDeployment();

  // Get role constants
  const DEFAULT_ADMIN_ROLE = await strategy.DEFAULT_ADMIN_ROLE();
  const ADMIN_ROLE = await strategy.ADMIN();
  const REPORTING_MANAGER_ROLE = await strategy.REPORTING_MANAGER();

  // Setup additional roles (deployer already has all roles from initialize)
  await strategy.connect(deployer).grantRole(ADMIN_ROLE, admin.address);
  await strategy
    .connect(deployer)
    .grantRole(REPORTING_MANAGER_ROLE, reportingManager.address);

  // Mint tokens to users for testing
  const userMintAmount = ethers.parseUnits("100000", 6); // 100,000 TUSDC
  await underlyingToken.mint(user1.address, userMintAmount);
  await underlyingToken.mint(user2.address, userMintAmount);
  await underlyingToken.mint(user3.address, userMintAmount);
  await underlyingToken.mint(admin.address, userMintAmount);
  await underlyingToken.mint(reportingManager.address, userMintAmount);

  // Mint alternative tokens directly to contract for withdraw testing
  const altTokenAmount = ethers.parseUnits("1000", 18); // 1,000 TWETH
  await altToken.mint(await strategy.getAddress(), altTokenAmount);

  // Test amounts for convenience
  const amounts = {
    small: ethers.parseUnits("100", 6), // 100 TUSDC
    medium: ethers.parseUnits("1000", 6), // 1,000 TUSDC
    large: ethers.parseUnits("10000", 6), // 10,000 TUSDC
  };

  return {
    // Contracts
    strategy,
    underlyingToken,
    altToken,
    wormhole,
    tokenBridge,
    swapRouter,

    // Signers
    deployer,
    admin,
    reportingManager,
    user1,
    user2,
    user3,

    // Roles
    DEFAULT_ADMIN_ROLE,
    ADMIN_ROLE,
    REPORTING_MANAGER_ROLE,

    // Addresses for convenience
    addresses: {
      strategy: await strategy.getAddress(),
      underlyingToken: await underlyingToken.getAddress(),
      altToken: await altToken.getAddress(),
    },

    // Test amounts
    amounts,
  };
}

// Fixture with pre-deposited funds for withdraw testing
async function deployContractWithDepositsFixture() {
  const fixture = await deployContractFixture();
  const { strategy, underlyingToken, user1, user2, amounts } = fixture;

  // Make initial deposits
  await underlyingToken
    .connect(user1)
    .approve(fixture.addresses.strategy, amounts.large);
  await strategy.connect(user1).deposit(amounts.medium);

  await underlyingToken
    .connect(user2)
    .approve(fixture.addresses.strategy, amounts.large);
  await strategy.connect(user2).deposit(amounts.medium);

  return {
    ...fixture,
    initialDeposits: {
      user1: amounts.medium,
      user2: amounts.medium,
      total: amounts.medium * 2n,
    },
  };
}

// Fixture for testing pause functionality
async function deployPausedContractFixture() {
  const fixture = await deployContractFixture();
  const { strategy, admin } = fixture;

  // Pause the contract
  await strategy.connect(admin).pause();

  return fixture;
}

module.exports = {
  deployContractFixture,
  deployContractWithDepositsFixture,
  deployPausedContractFixture,
};
