/**
 * PancakeSwap V3 Swap Script for BridgeSwapStrategy Contract
 *
 * This script has been updated to work with BridgeSwapStrategy contract which uses:
 * - AccessControlUpgradeable with role-based permissions (REPORTING_MANAGER, ADMIN)
 * - Pausable functionality
 * - PancakeSwap Smart Router integration
 * - Custom error handling
 *
 * Key changes:
 * - Replaced owner() checks with role-based access control
 * - Added contract paused state verification
 * - Updated router address to PancakeSwap Smart Router
 * - Enhanced error handling for custom contract errors
 */

const { ethers } = require("hardhat");
require("dotenv").config();

// Role constants for BridgeSwapStrategy
const REPORTING_MANAGER = ethers.keccak256(ethers.toUtf8Bytes("REPORTING_MANAGER"));
const ADMIN = ethers.keccak256(ethers.toUtf8Bytes("ADMIN"));

// Contract configuration
const CONTRACT_ADDRESS = "0x4F3862D359D8f76498f69732740E4d53b7676639";

// Swap parameters
// whUSDT to USDT
const TOKEN_IN = "0x524bC91Dc82d6b90EF29F76A3ECAaBAffFD490Bc"; // USDTwh
const TOKEN_OUT = "0x55d398326f99059fF775485246999027B3197955"; // USDT

// USDT to whUSDT
// const TOKEN_IN = "0x55d398326f99059fF775485246999027B3197955"; // USDT
// const TOKEN_OUT = "0x524bC91Dc82d6b90EF29F76A3ECAaBAffFD490Bc"; // USDTwh


const FEE = 100; // 0.01%
const AMOUNT_IN = "1000"; // 0.5 USDTwh (6 decimals)
// const AMOUNT_IN = "499912421689649300"; // 0.4999124216896493 USDT
const AMOUNT_OUT_MINIMUM = 0;
// const SQRT_PRICE_LIMIT_X96 = 0;

const SQRT_PRICE_LIMIT_X96 = 0;

// Contract ABI with custom errors from BridgeSwapStrategy
const CONTRACT_ABI = [
  {
    inputs: [
      { internalType: "address", name: "tokenIn", type: "address" },
      { internalType: "address", name: "tokenOut", type: "address" },
      { internalType: "uint24", name: "fee", type: "uint24" },
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint256", name: "amountOutMinimum", type: "uint256" },
      { internalType: "uint160", name: "sqrtPriceLimitX96", type: "uint160" },
    ],
    name: "swapExactInputSinglePancakeV3",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Custom errors from BridgeSwapStrategy
  {
    inputs: [],
    name: "Unauthorized",
    type: "error",
  },
  {
    inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
    name: "InvalidAmount",
    type: "error",
  },
  {
    inputs: [
      { internalType: "uint256", name: "requested", type: "uint256" },
      { internalType: "uint256", name: "available", type: "uint256" },
    ],
    name: "InsufficientBalance",
    type: "error",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "required", type: "uint256" },
      { internalType: "uint256", name: "available", type: "uint256" },
    ],
    name: "InsufficientBalanceToken",
    type: "error",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "ApprovalFailed",
    type: "error",
  },
  {
    inputs: [
      { internalType: "uint256", name: "expected", type: "uint256" },
      { internalType: "uint256", name: "received", type: "uint256" },
    ],
    name: "InsufficientOutput",
    type: "error",
  },
  {
    inputs: [{ internalType: "bytes32", name: "pathHash", type: "bytes32" }],
    name: "PathNotAllowed",
    type: "error",
  },
  {
    inputs: [],
    name: "EmptyPath",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidRouterAddress",
    type: "error",
  },
];

// ERC20 ABI
const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
];

// Error decoding function
function decodeError(error, contractInterface) {
  if (error.data) {
    try {
      const decoded = contractInterface.parseError(error.data);
      return {
        name: decoded.name,
        args: decoded.args,
        decoded: true,
      };
    } catch (e) {
      // If we can't decode it, return the raw data
      return {
        name: "Unknown",
        data: error.data,
        decoded: false,
      };
    }
  }
  return null;
}

// Format readable error message
function formatErrorMessage(error, contractInterface) {
  const decoded = decodeError(error, contractInterface);

  if (!decoded || !decoded.decoded) {
    return error.message;
  }

  switch (decoded.name) {
    case "Unauthorized":
      return "Unauthorized: Caller does not have the required role (REPORTING_MANAGER)";
    case "InvalidAmount":
      return `Invalid amount: ${decoded.args[0]}`;
    case "InsufficientBalance":
      return `Insufficient balance. Requested: ${decoded.args[0]}, Available: ${decoded.args[1]}`;
    case "InsufficientBalanceToken":
      return `Insufficient balance in token ${decoded.args[0]}. Required: ${decoded.args[1]}, Available: ${decoded.args[2]}`;
    case "ApprovalFailed":
      return `Approval failed for token ${decoded.args[0]} to spender ${decoded.args[1]} with amount ${decoded.args[2]}`;
    case "InsufficientOutput":
      return `Insufficient output. Expected: ${decoded.args[0]}, Received: ${decoded.args[1]}`;
    case "PathNotAllowed":
      return `Path not allowed. Path hash: ${decoded.args[0]}`;
    case "EmptyPath":
      return "Empty path provided for swap";
    case "InvalidRouterAddress":
      return "Invalid router address provided";
    default:
      return `Custom error ${decoded.name}: ${JSON.stringify(decoded.args)}`;
  }
}

async function main() {
  console.log("=== PancakeSwap V3 Swap ===\n");

  // Setup signer
  const [signer] = await ethers.getSigners();
  console.log(`Signer: ${signer.address}`);
  console.log(`Network: ${(await ethers.provider.getNetwork()).name}\n`);

  // Pre-flight checks
  console.log("--- Pre-flight Checks ---");

  // Check if contract exists
  const contractCode = await ethers.provider.getCode(CONTRACT_ADDRESS);
  if (contractCode === "0x") {
    throw new Error(`Contract not found at address ${CONTRACT_ADDRESS}`);
  }
  console.log(`✅ Contract exists at ${CONTRACT_ADDRESS}`);
  console.log(`Contract bytecode length: ${contractCode.length}`);

  // Create contract instances
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  const tokenIn = new ethers.Contract(TOKEN_IN, ERC20_ABI, ethers.provider);
  const tokenOut = new ethers.Contract(TOKEN_OUT, ERC20_ABI, ethers.provider);

  // Check role-based access control
  console.log("--- Access Control Verification ---");

  try {
    const accessControlABI = [
      {
        inputs: [
          { internalType: "bytes32", name: "role", type: "bytes32" },
          { internalType: "address", name: "account", type: "address" }
        ],
        name: "hasRole",
        outputs: [{ internalType: "bool", name: "", type: "bool" }],
        stateMutability: "view",
        type: "function",
      },
      {
        inputs: [],
        name: "paused",
        outputs: [{ internalType: "bool", name: "", type: "bool" }],
        stateMutability: "view",
        type: "function",
      }
    ];

    const contractWithAccessControl = new ethers.Contract(
      CONTRACT_ADDRESS,
      accessControlABI,
      ethers.provider
    );

    // Check REPORTING_MANAGER role
    const hasReportingManagerRole = await contractWithAccessControl.hasRole(REPORTING_MANAGER, signer.address);
    console.log(`Signer has REPORTING_MANAGER role: ${hasReportingManagerRole}`);

    // Check ADMIN role
    const hasAdminRole = await contractWithAccessControl.hasRole(ADMIN, signer.address);
    console.log(`Signer has ADMIN role: ${hasAdminRole}`);

    // Check if contract is paused
    const isPaused = await contractWithAccessControl.paused();
    console.log(`Contract is paused: ${isPaused}`);

    if (!hasReportingManagerRole) {
      console.log("⚠️ Warning: Signer does not have REPORTING_MANAGER role. Swap function will fail.");
      console.log("💡 Hint: Ask an admin to grant you the REPORTING_MANAGER role");
    }

    if (isPaused) {
      console.log("⚠️ Warning: Contract is paused. Function calls will fail.");
      console.log("💡 Hint: Ask an admin to unpause the contract");
    }

  } catch (error) {
    console.log("❌ Could not verify access control:", error.message);
  }

  // Verify token contracts exist
  const tokenInCode = await ethers.provider.getCode(TOKEN_IN);
  const tokenOutCode = await ethers.provider.getCode(TOKEN_OUT);

  if (tokenInCode === "0x") {
    throw new Error(`TokenIn contract not found at ${TOKEN_IN}`);
  }
  if (tokenOutCode === "0x") {
    throw new Error(`TokenOut contract not found at ${TOKEN_OUT}`);
  }
  console.log(`✅ TokenIn contract exists`);
  console.log(`✅ TokenOut contract exists`);

  // Check PancakeSwap router
  // const PANCAKE_ROUTER = "0x1b81D678ffb9C0263b24A97847620C99d213eB14"; // PancakeSwap V3 router on BSC
  const PANCAKE_ROUTER = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4"; // PancakeSwap Smart Router
  const routerCode = await ethers.provider.getCode(PANCAKE_ROUTER);
  if (routerCode === "0x") {
    console.log(
      "⚠️ Warning: PancakeSwap V3 router not found at expected address"
    );
  } else {
    console.log(`✅ PancakeSwap V3 router exists`);
  }

  const PANCAKE_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865"; // PancakeSwap V3 factory
  const poolFactoryABI = [
    {
      inputs: [
        { internalType: "address", name: "tokenA", type: "address" },
        { internalType: "address", name: "tokenB", type: "address" },
        { internalType: "uint24", name: "fee", type: "uint24" },
      ],
      name: "getPool",
      outputs: [{ internalType: "address", name: "pool", type: "address" }],
      stateMutability: "view",
      type: "function",
    },
  ];
  const factory = new ethers.Contract(
    PANCAKE_FACTORY,
    poolFactoryABI,
    ethers.provider
  );

  console.log("\n--- Token Information ---");

  // Get decimals for formatting
  let tokenInDecimals, tokenOutDecimals;
  try {
    tokenInDecimals = await tokenIn.decimals();
    console.log(`✅ TokenIn decimals: ${tokenInDecimals}`);
  } catch (error) {
    console.log(`❌ Could not get TokenIn decimals: ${error.message}`);
    tokenInDecimals = 6; // fallback
  }

  try {
    tokenOutDecimals = await tokenOut.decimals();
    console.log(`✅ TokenOut decimals: ${tokenOutDecimals}`);
  } catch (error) {
    console.log(`❌ Could not get TokenOut decimals: ${error.message}`);
    tokenOutDecimals = 18; // fallback
  }

  // Check balances before swap
  let tokenInBalanceBefore, tokenOutBalanceBefore;
  try {
    tokenInBalanceBefore = await tokenIn.balanceOf(CONTRACT_ADDRESS);
    tokenOutBalanceBefore = await tokenOut.balanceOf(CONTRACT_ADDRESS);

    console.log("\n--- Contract Balances ---");
    console.log(
      `TokenIn (USDTwh): ${ethers.formatUnits(
        tokenInBalanceBefore,
        tokenInDecimals
      )}`
    );
    console.log(
      `TokenOut (USDT): ${ethers.formatUnits(
        tokenOutBalanceBefore,
        tokenOutDecimals
      )}`
    );
  } catch (error) {
    console.log(`❌ Could not get token balances: ${error.message}`);
    throw error;
  }

  // Verify sufficient balance
  if (tokenInBalanceBefore < BigInt(AMOUNT_IN)) {
    throw new Error(
      `Insufficient balance. Has: ${ethers.formatUnits(
        tokenInBalanceBefore,
        tokenInDecimals
      )}, Needs: ${ethers.formatUnits(AMOUNT_IN, tokenInDecimals)}`
    );
  }

  console.log(
    `\n✅ Ready to swap ${ethers.formatUnits(
      AMOUNT_IN,
      tokenInDecimals
    )} USDTwh → USDT`
  );

  // Test contract connectivity with a simple view function
  console.log("\n--- Contract Connectivity Test ---");
  try {
    // Try to call a simple function to test if contract is responsive
    const testSelector = "0x70a08231"; // balanceOf signature
    await ethers.provider.call({
      to: TOKEN_IN,
      data:
        testSelector + "000000000000000000000000" + CONTRACT_ADDRESS.slice(2),
    });
    console.log("✅ Contract calls working");
  } catch (error) {
    console.log("❌ Contract call test failed:", error.message);
  }

  try {
    // Debug function parameters
    console.log("\n--- Function Parameters Debug ---");
    console.log(`TokenIn: ${TOKEN_IN}`);
    console.log(`TokenOut: ${TOKEN_OUT}`);
    console.log(`Fee: ${FEE}`);
    console.log(`AmountIn: ${AMOUNT_IN}`);
    console.log(`AmountOutMinimum: ${AMOUNT_OUT_MINIMUM}`);
    console.log(`SqrtPriceLimitX96: ${SQRT_PRICE_LIMIT_X96}`);

    // Manual function call data encoding for debugging
    console.log("\n--- Function Call Data Debug ---");
    try {
      const contractInterface = new ethers.Interface(CONTRACT_ABI);
      const callData = contractInterface.encodeFunctionData(
        "swapExactInputSinglePancakeV3",
        [
          TOKEN_IN,
          TOKEN_OUT,
          FEE,
          AMOUNT_IN,
          AMOUNT_OUT_MINIMUM,
          SQRT_PRICE_LIMIT_X96,
        ]
      );
      console.log(`Function selector: ${callData.slice(0, 10)}`);
      console.log(`Full call data length: ${callData.length}`);
    } catch (error) {
      console.log(`❌ Function encoding failed: ${error.message}`);
      throw error;
    }

    // PancakeSwap specific debugging
    console.log("\n--- PancakeSwap Integration Debug ---");

    // Check if the pool exists for this token pair
    const poolAddress = await factory.getPool(TOKEN_IN, TOKEN_OUT, FEE);
    console.log(
      `Pool address for ${TOKEN_IN}/${TOKEN_OUT} with fee ${FEE}: ${poolAddress}`
    );

    if (poolAddress === "0x0000000000000000000000000000000000000000") {
      console.log("❌ Pool does not exist for this token pair and fee tier!");
      console.log(
        "💡 Try different fee tiers: 500 (0.05%), 3000 (0.3%), 10000 (1%)"
      );
    } else {
      console.log("✅ Pool exists");

      // Check pool liquidity
      const poolCode = await ethers.provider.getCode(poolAddress);
      if (poolCode !== "0x") {
        console.log("✅ Pool contract is deployed");

        // Try to get basic pool info
        const poolABI = [
          {
            inputs: [],
            name: "liquidity",
            outputs: [{ internalType: "uint128", name: "", type: "uint128" }],
            stateMutability: "view",
            type: "function",
          },
        ];

        try {
          const pool = new ethers.Contract(
            poolAddress,
            poolABI,
            ethers.provider
          );
          const liquidity = await pool.liquidity();
          console.log(`Pool liquidity: ${liquidity.toString()}`);

          if (liquidity.toString() === "0") {
            console.log("❌ Pool has no liquidity!");
          } else {
            console.log("✅ Pool has liquidity");
          }
        } catch (liquidityError) {
          console.log(
            "⚠️ Could not check pool liquidity:",
            liquidityError.message
          );
        }
      }
    }

    // Add checks for common PancakeSwap V3 fee tiers
    const commonFeeTiers = [500, 2500, 10000];
    console.log("\n--- Checking Common PancakeSwap V3 Fee Tiers ---");

    for (const feeTier of commonFeeTiers) {
      try {
        const poolAddressTier = await factory.getPool(TOKEN_IN, TOKEN_OUT, feeTier);
        console.log(`Pool address for ${TOKEN_IN}/${TOKEN_OUT} with fee ${feeTier} (${feeTier / 100}%): ${poolAddressTier}`);

        if (poolAddressTier === "0x0000000000000000000000000000000000000000") {
          console.log(`  ❌ Pool does not exist for fee tier ${feeTier}`);
        } else {
          console.log(`  ✅ Pool exists for fee tier ${feeTier}`);
          const poolCodeTier = await ethers.provider.getCode(poolAddressTier);
          if (poolCodeTier !== "0x") {
            console.log(`  ✅ Pool contract deployed for fee tier ${feeTier}`);
            const poolABI = [
              {
                inputs: [],
                name: "liquidity",
                outputs: [{ internalType: "uint128", name: "", type: "uint128" }],
                stateMutability: "view",
                type: "function",
              },
            ];
            try {
              const pool = new ethers.Contract(
                poolAddressTier,
                poolABI,
                ethers.provider
              );
              const liquidity = await pool.liquidity();
              console.log(`  Pool liquidity for fee tier ${feeTier}: ${liquidity.toString()}`);
              if (liquidity.toString() === "0") {
                console.log(`  ❌ Pool for fee tier ${feeTier} has no liquidity!`);
              } else {
                console.log(`  ✅ Pool for fee tier ${feeTier} has liquidity`);
              }
            } catch (liquidityError) {
              console.log(
                `  ⚠️ Could not check liquidity for fee tier ${feeTier}:`,
                liquidityError.message
              );
            }
          }
        }
      } catch (tierError) {
        console.log(`❌ Error checking fee tier ${feeTier}:`, tierError.message);
      }
    }

    // Check contract's PancakeSwap router configuration
  console.log("\n--- PancakeSwap Router Configuration Check ---");
  const routerCheckABI = [
    {
      inputs: [],
      name: "pancakeSmartRouter",
      outputs: [{ internalType: "address", name: "", type: "address" }],
      stateMutability: "view",
      type: "function",
    },
  ];

  try {
    const contractWithRouter = new ethers.Contract(
      CONTRACT_ADDRESS,
      routerCheckABI,
      ethers.provider
    );
    const configuredRouter = await contractWithRouter.pancakeSmartRouter();
    console.log(`Contract's configured PancakeSwap router: ${configuredRouter}`);

    const expectedRouter = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4"; // PancakeSwap Smart Router on BSC
    if (configuredRouter === "0x0000000000000000000000000000000000000000") {
      console.log("❌ PancakeSwap router not configured in contract");
    } else if (configuredRouter.toLowerCase() !== expectedRouter.toLowerCase()) {
      console.log(
        `⚠️ Warning: Router mismatch. Expected: ${expectedRouter}, Got: ${configuredRouter}`
      );
    } else {
      console.log("✅ PancakeSwap router configuration matches");
    }
  } catch (routerError) {
    console.log(
      "❌ Could not check PancakeSwap router configuration:",
      routerError.message
    );
  }

    // Check if the specific token pair has been traded before
    console.log("\n--- Token Pair Validation ---");
    console.log(`Attempting to swap from ${TOKEN_IN} to ${TOKEN_OUT}`);
    console.log(
      "Token addresses should not be the same:",
      TOKEN_IN !== TOKEN_OUT ? "✅" : "❌"
    );

    // Validate addresses are proper format
    const isValidAddress = (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr);
    console.log(
      `TokenIn address valid: ${isValidAddress(TOKEN_IN) ? "✅" : "❌"}`
    );
    console.log(
      `TokenOut address valid: ${isValidAddress(TOKEN_OUT) ? "✅" : "❌"}`
    );

    // Test approval process debugging
    console.log("\n--- Approval Process Debug ---");

    try {
      // Check current allowance
      const allowanceABI = [
        {
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
          ],
          name: "allowance",
          outputs: [{ name: "", type: "uint256" }],
          type: "function",
        },
      ];

      const tokenInWithAllowance = new ethers.Contract(
        TOKEN_IN,
        allowanceABI,
        ethers.provider
      );
      const routerAddress = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4"; // PancakeSwap Smart Router

      const currentAllowance = await tokenInWithAllowance.allowance(
        CONTRACT_ADDRESS,
        routerAddress
      );
      console.log(
        `Current allowance for router: ${currentAllowance.toString()}`
      );

      // Test the approval calls that the contract would make
      console.log("Testing approval process...");

      // Test if we can simulate the approval calls
      const approveSelector = "0x095ea7b3"; // approve(address,uint256)

      // Test reset approval to 0
      try {
        const approveZeroData =
          approveSelector +
          "000000000000000000000000" +
          routerAddress.slice(2) +
          "0000000000000000000000000000000000000000000000000000000000000000";

        await ethers.provider.call({
          to: TOKEN_IN,
          data: approveZeroData,
          from: CONTRACT_ADDRESS,
        });
        console.log("✅ Simulated approval reset to 0 succeeded");
      } catch (approveError) {
        console.log(
          "❌ Approval reset simulation failed:",
          approveError.message
        );
      }

      // Test approval for amount
      try {
        const amountHex = BigInt(AMOUNT_IN).toString(16).padStart(64, "0");
        const approveAmountData =
          approveSelector +
          "000000000000000000000000" +
          routerAddress.slice(2) +
          amountHex;

        await ethers.provider.call({
          to: TOKEN_IN,
          data: approveAmountData,
          from: CONTRACT_ADDRESS,
        });
        console.log("✅ Simulated approval for amount succeeded");
      } catch (approveError) {
        console.log(
          "❌ Approval amount simulation failed:",
          approveError.message
        );
      }
    } catch (error) {
      console.log("❌ Approval debugging failed:", error.message);
    }

    // Test router call debugging
    console.log("\n--- Router Call Debug ---");

    try {
      // Test if we can call the router directly with our parameters
      const routerABI = [
        {
          inputs: [
            {
              components: [
                { internalType: "address", name: "tokenIn", type: "address" },
                { internalType: "address", name: "tokenOut", type: "address" },
                { internalType: "uint24", name: "fee", type: "uint24" },
                { internalType: "address", name: "recipient", type: "address" },
                { internalType: "uint256", name: "amountIn", type: "uint256" },
                {
                  internalType: "uint256",
                  name: "amountOutMinimum",
                  type: "uint256",
                },
                {
                  internalType: "uint160",
                  name: "sqrtPriceLimitX96",
                  type: "uint160",
                },
              ],
              internalType: "struct IV3SwapRouter.ExactInputSingleParams",
              name: "params",
              type: "tuple",
            },
          ],
          name: "exactInputSingle",
          outputs: [
            { internalType: "uint256", name: "amountOut", type: "uint256" },
          ],
          stateMutability: "payable",
          type: "function",
        },
      ];

      const routerContract = new ethers.Contract(
        "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4", // PancakeSwap Smart Router
        routerABI,
        ethers.provider
      );

      // Try to simulate the router call
      const params = {
        tokenIn: TOKEN_IN,
        tokenOut: TOKEN_OUT,
        fee: FEE,
        recipient: CONTRACT_ADDRESS,
        amountIn: AMOUNT_IN,
        amountOutMinimum: AMOUNT_OUT_MINIMUM,
        sqrtPriceLimitX96: SQRT_PRICE_LIMIT_X96,
      };

      console.log("Testing router call with params:", params);

      try {
        await routerContract.exactInputSingle.staticCall(params, {
          from: CONTRACT_ADDRESS,
        });
        console.log("✅ Router call simulation succeeded");
      } catch (routerError) {
        console.log("❌ Router call simulation failed:", routerError.message);
        if (routerError.data) {
          console.log("Router error data:", routerError.data);
        }
      }
    } catch (error) {
      console.log("❌ Router call debugging failed:", error.message);
    }

    // Gas estimation before executing swap
    console.log("\n--- Gas Estimation ---");
    try {
      const gasEstimate = await contract.swapExactInputSinglePancakeV3.estimateGas(
        TOKEN_IN,
        TOKEN_OUT,
        FEE,
        AMOUNT_IN,
        AMOUNT_OUT_MINIMUM,
        SQRT_PRICE_LIMIT_X96
      );
      console.log(`Estimated gas: ${gasEstimate.toString()}`);
    } catch (error) {
      console.log("❌ Gas estimation failed:");
      const contractInterface = new ethers.Interface(CONTRACT_ABI);
      const readableError = formatErrorMessage(error, contractInterface);
      console.log(`Error: ${readableError}`);

      if (error.data) {
        console.log("Raw error data:", error.data);

        // Try to decode the error data manually
        if (error.data.length > 2) {
          console.log(`Error selector: ${error.data.slice(0, 10)}`);
        }
      }

      // Additional low-level debugging
      console.log("\n--- Low-level Call Test ---");
      try {
        const result = await ethers.provider.call({
          to: CONTRACT_ADDRESS,
          data: contractInterface.encodeFunctionData("swapExactInputSinglePancakeV3", [
            TOKEN_IN,
            TOKEN_OUT,
            FEE,
            AMOUNT_IN,
            AMOUNT_OUT_MINIMUM,
            SQRT_PRICE_LIMIT_X96,
          ]),
          from: signer.address,
        });
        console.log("Low-level call result:", result);
      } catch (lowLevelError) {
        console.log("Low-level call failed:", lowLevelError.message);
        if (lowLevelError.data) {
          console.log("Low-level error data:", lowLevelError.data);
        }
      }

      throw error; // Don't proceed if gas estimation fails
    }

    // Execute swap
    console.log("\n--- Executing Swap ---");
    const tx = await contract.swapExactInputSinglePancakeV3(
      TOKEN_IN,
      TOKEN_OUT,
      FEE,
      AMOUNT_IN,
      AMOUNT_OUT_MINIMUM,
      SQRT_PRICE_LIMIT_X96,
      { gasLimit: 500000 }
    );

    console.log(`Transaction: ${tx.hash}`);

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log(`✅ Swap completed (Block: ${receipt.blockNumber})`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}\n`);

    // Check balances after swap
    const tokenInBalanceAfter = await tokenIn.balanceOf(CONTRACT_ADDRESS);
    const tokenOutBalanceAfter = await tokenOut.balanceOf(CONTRACT_ADDRESS);

    console.log("Balances After Swap:");
    console.log(
      `TokenIn (USDTwh): ${ethers.formatUnits(
        tokenInBalanceAfter,
        tokenInDecimals
      )}`
    );
    console.log(
      `TokenOut (USDT): ${ethers.formatUnits(
        tokenOutBalanceAfter,
        tokenOutDecimals
      )}\n`
    );

    // Calculate changes
    const tokenInChange = tokenInBalanceBefore - tokenInBalanceAfter;
    const tokenOutChange = tokenOutBalanceAfter - tokenOutBalanceBefore;

    console.log("Changes:");
    console.log(
      `TokenIn spent: ${ethers.formatUnits(
        tokenInChange,
        tokenInDecimals
      )} USDTwh`
    );
    console.log(
      `TokenOut received: ${ethers.formatUnits(
        tokenOutChange,
        tokenOutDecimals
      )} USDT`
    );
  } catch (error) {
    console.error("❌ Swap failed:");

    const contractInterface = new ethers.Interface(CONTRACT_ABI);
    const readableError = formatErrorMessage(error, contractInterface);
    console.error(`Error: ${readableError}`);

    if (error.data) {
      console.error(`Raw error data: ${error.data}`);
    }

    // Additional error context
    if (error.code) {
      console.error(`Error code: ${error.code}`);
    }

    // Try to get transaction revert reason if it's a transaction error
    if (error.receipt && error.receipt.status === 0) {
      console.error("Transaction was reverted");
      try {
        // Try static call to get revert reason
        await contract.swapExactInputSinglePancakeV3.staticCall(
          TOKEN_IN,
          TOKEN_OUT,
          FEE,
          AMOUNT_IN,
          AMOUNT_OUT_MINIMUM,
          SQRT_PRICE_LIMIT_X96
        );
      } catch (staticError) {
        console.error(
          "Revert reason:",
          formatErrorMessage(staticError, contractInterface)
        );
      }
    }

    // Common error interpretations for BridgeSwapStrategy
    if (error.message.includes("insufficient funds")) {
      console.error("💡 Hint: Check your ETH/BNB balance for gas fees");
    } else if (error.message.includes("execution reverted")) {
      console.error("💡 Hint: Transaction reverted - check contract conditions (role access, paused state, token balances)");
    } else if (error.message.includes("nonce too high")) {
      console.error("💡 Hint: Nonce issue - try restarting your wallet/client");
    } else if (error.message.includes("Unauthorized")) {
      console.error("💡 Hint: You don't have REPORTING_MANAGER role. Ask an admin to grant you this role");
    } else if (error.message.includes("Pausable: paused")) {
      console.error("💡 Hint: Contract is paused. Ask an admin to unpause the contract");
    } else if (error.message.includes("InsufficientBalance")) {
      console.error("💡 Hint: Contract doesn't have enough tokens for the swap");
    } else if (error.message.includes("ApprovalFailed")) {
      console.error("💡 Hint: Token approval failed - check token contract implementation");
    }

    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
