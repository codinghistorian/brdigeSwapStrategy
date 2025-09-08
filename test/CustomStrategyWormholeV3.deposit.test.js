const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const {
  deployContractFixture,
  deployPausedContractFixture,
} = require("./fixtures");

describe("CustomStrategyWormholeV3 - Deposit Function", function () {
  describe("Successful Deposits", function () {
    it("Should allow user to deposit underlying tokens", async function () {
      const { strategy, underlyingToken, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const depositAmount = amounts.medium;

      // Approve tokens
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, depositAmount);

      // Get initial balances and state
      const initialUserBalance = await underlyingToken.balanceOf(user1.address);
      const initialContractBalance = await underlyingToken.balanceOf(
        addresses.strategy
      );
      const initialTotalDeposited = await strategy.totalDeposited();

      // Execute deposit
      const tx = await strategy.connect(user1).deposit(depositAmount);

      // Verify balances changed correctly
      expect(await underlyingToken.balanceOf(user1.address)).to.equal(
        initialUserBalance - depositAmount
      );
      expect(await underlyingToken.balanceOf(addresses.strategy)).to.equal(
        initialContractBalance + depositAmount
      );
      expect(await strategy.totalDeposited()).to.equal(
        initialTotalDeposited + depositAmount
      );

      // Verify event emission
      await expect(tx)
        .to.emit(strategy, "Deposited")
        .withArgs(user1.address, depositAmount);
    });

    it("Should handle small deposit amounts correctly", async function () {
      const { strategy, underlyingToken, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const depositAmount = amounts.small;

      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, depositAmount);

      const initialTotalDeposited = await strategy.totalDeposited();

      await strategy.connect(user1).deposit(depositAmount);

      expect(await strategy.totalDeposited()).to.equal(
        initialTotalDeposited + depositAmount
      );
    });

    it("Should handle large deposit amounts correctly", async function () {
      const { strategy, underlyingToken, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const depositAmount = amounts.large;

      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, depositAmount);

      const initialTotalDeposited = await strategy.totalDeposited();

      await strategy.connect(user1).deposit(depositAmount);

      expect(await strategy.totalDeposited()).to.equal(
        initialTotalDeposited + depositAmount
      );
    });

    it("Should allow multiple deposits from same user", async function () {
      const { strategy, underlyingToken, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const depositAmount1 = amounts.small;
      const depositAmount2 = amounts.medium;
      const totalDeposit = depositAmount1 + depositAmount2;

      // Approve total amount
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, totalDeposit);

      const initialTotalDeposited = await strategy.totalDeposited();

      // First deposit
      await strategy.connect(user1).deposit(depositAmount1);
      expect(await strategy.totalDeposited()).to.equal(
        initialTotalDeposited + depositAmount1
      );

      // Second deposit
      await strategy.connect(user1).deposit(depositAmount2);
      expect(await strategy.totalDeposited()).to.equal(
        initialTotalDeposited + totalDeposit
      );
    });

    it("Should allow deposits from multiple users", async function () {
      const {
        strategy,
        underlyingToken,
        user1,
        user2,
        user3,
        amounts,
        addresses,
      } = await loadFixture(deployContractFixture);

      const depositAmount = amounts.medium;

      // Setup approvals
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, depositAmount);
      await underlyingToken
        .connect(user2)
        .approve(addresses.strategy, depositAmount);
      await underlyingToken
        .connect(user3)
        .approve(addresses.strategy, depositAmount);

      const initialTotalDeposited = await strategy.totalDeposited();

      // User1 deposit
      const tx1 = await strategy.connect(user1).deposit(depositAmount);
      await expect(tx1)
        .to.emit(strategy, "Deposited")
        .withArgs(user1.address, depositAmount);

      // User2 deposit
      const tx2 = await strategy.connect(user2).deposit(depositAmount);
      await expect(tx2)
        .to.emit(strategy, "Deposited")
        .withArgs(user2.address, depositAmount);

      // User3 deposit
      const tx3 = await strategy.connect(user3).deposit(depositAmount);
      await expect(tx3)
        .to.emit(strategy, "Deposited")
        .withArgs(user3.address, depositAmount);

      expect(await strategy.totalDeposited()).to.equal(
        initialTotalDeposited + depositAmount * 3n
      );
    });

    it("Should allow admin to deposit", async function () {
      const { strategy, underlyingToken, admin, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const depositAmount = amounts.medium;

      await underlyingToken
        .connect(admin)
        .approve(addresses.strategy, depositAmount);

      const tx = await strategy.connect(admin).deposit(depositAmount);

      await expect(tx)
        .to.emit(strategy, "Deposited")
        .withArgs(admin.address, depositAmount);
    });

    it("Should allow reporting manager to deposit", async function () {
      const {
        strategy,
        underlyingToken,
        reportingManager,
        amounts,
        addresses,
      } = await loadFixture(deployContractFixture);

      const depositAmount = amounts.medium;

      await underlyingToken
        .connect(reportingManager)
        .approve(addresses.strategy, depositAmount);

      const tx = await strategy
        .connect(reportingManager)
        .deposit(depositAmount);

      await expect(tx)
        .to.emit(strategy, "Deposited")
        .withArgs(reportingManager.address, depositAmount);
    });

    it("Should handle exact balance deposit", async function () {
      const { strategy, underlyingToken, user1, addresses } = await loadFixture(
        deployContractFixture
      );

      const userBalance = await underlyingToken.balanceOf(user1.address);

      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, userBalance);

      await strategy.connect(user1).deposit(userBalance);

      expect(await underlyingToken.balanceOf(user1.address)).to.equal(0);
      expect(await strategy.totalDeposited()).to.equal(userBalance);
    });
  });

  describe("Deposit State Changes", function () {
    it("Should correctly update totalDeposited after multiple operations", async function () {
      const { strategy, underlyingToken, user1, user2, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const deposit1 = amounts.small;
      const deposit2 = amounts.medium;
      const deposit3 = amounts.large;

      // Setup approvals
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, deposit1 + deposit2);
      await underlyingToken
        .connect(user2)
        .approve(addresses.strategy, deposit3);

      // Track totalDeposited changes
      let expectedTotal = 0n;
      expect(await strategy.totalDeposited()).to.equal(expectedTotal);

      // First deposit
      await strategy.connect(user1).deposit(deposit1);
      expectedTotal += deposit1;
      expect(await strategy.totalDeposited()).to.equal(expectedTotal);

      // Second deposit (same user)
      await strategy.connect(user1).deposit(deposit2);
      expectedTotal += deposit2;
      expect(await strategy.totalDeposited()).to.equal(expectedTotal);

      // Third deposit (different user)
      await strategy.connect(user2).deposit(deposit3);
      expectedTotal += deposit3;
      expect(await strategy.totalDeposited()).to.equal(expectedTotal);
    });

    it("Should maintain accurate contract token balance", async function () {
      const { strategy, underlyingToken, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const depositAmount = amounts.medium;

      const initialContractBalance = await underlyingToken.balanceOf(
        addresses.strategy
      );

      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, depositAmount);
      await strategy.connect(user1).deposit(depositAmount);

      const finalContractBalance = await underlyingToken.balanceOf(
        addresses.strategy
      );
      expect(finalContractBalance).to.equal(
        initialContractBalance + depositAmount
      );
    });
  });

  describe("Deposit Events", function () {
    it("Should emit Deposited event with correct parameters", async function () {
      const { strategy, underlyingToken, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const depositAmount = amounts.medium;

      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, depositAmount);

      await expect(strategy.connect(user1).deposit(depositAmount))
        .to.emit(strategy, "Deposited")
        .withArgs(user1.address, depositAmount);
    });

    it("Should emit correct events for multiple deposits", async function () {
      const { strategy, underlyingToken, user1, user2, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const deposit1 = amounts.small;
      const deposit2 = amounts.medium;

      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, deposit1);
      await underlyingToken
        .connect(user2)
        .approve(addresses.strategy, deposit2);

      // First deposit
      await expect(strategy.connect(user1).deposit(deposit1))
        .to.emit(strategy, "Deposited")
        .withArgs(user1.address, deposit1);

      // Second deposit
      await expect(strategy.connect(user2).deposit(deposit2))
        .to.emit(strategy, "Deposited")
        .withArgs(user2.address, deposit2);
    });
  });

  describe("Deposit Failures", function () {
    it("Should revert when contract is paused", async function () {
      const { strategy, underlyingToken, user1, amounts, addresses } =
        await loadFixture(deployPausedContractFixture);

      const depositAmount = amounts.medium;
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, depositAmount);

      await expect(strategy.connect(user1).deposit(depositAmount)).to.be
        .reverted;
    });

    it("Should revert when insufficient allowance", async function () {
      const { strategy, user1, amounts } = await loadFixture(
        deployContractFixture
      );

      const depositAmount = amounts.medium;

      await expect(strategy.connect(user1).deposit(depositAmount)).to.be
        .reverted;
    });

    it("Should revert when insufficient balance", async function () {
      const { strategy, underlyingToken, user1, addresses } = await loadFixture(
        deployContractFixture
      );

      const userBalance = await underlyingToken.balanceOf(user1.address);
      const depositAmount = userBalance + ethers.parseUnits("1", 6);

      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, depositAmount);

      await expect(strategy.connect(user1).deposit(depositAmount)).to.be
        .reverted;
    });

    it("Should revert when depositing zero amount", async function () {
      const { strategy, user1 } = await loadFixture(deployContractFixture);

      // Zero deposit should succeed but transfer 0 tokens
      const tx = await strategy.connect(user1).deposit(0);
      await expect(tx)
        .to.emit(strategy, "Deposited")
        .withArgs(user1.address, 0);
    });

    it("Should revert with partial allowance", async function () {
      const { strategy, underlyingToken, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const depositAmount = amounts.medium;
      const partialAllowance = amounts.small;

      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, partialAllowance);

      await expect(strategy.connect(user1).deposit(depositAmount)).to.be
        .reverted;
    });
  });

  describe("Edge Cases", function () {
    it("Should handle deposit of 1 wei", async function () {
      const { strategy, underlyingToken, user1, addresses } = await loadFixture(
        deployContractFixture
      );

      const depositAmount = 1n;

      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, depositAmount);

      const initialTotal = await strategy.totalDeposited();

      await strategy.connect(user1).deposit(depositAmount);

      expect(await strategy.totalDeposited()).to.equal(
        initialTotal + depositAmount
      );
    });

    it("Should handle very large deposit amounts", async function () {
      const { strategy, underlyingToken, user1, addresses } = await loadFixture(
        deployContractFixture
      );

      // Mint a very large amount to user1
      const largeAmount = ethers.parseUnits("1000000", 6); // 1 million tokens
      await underlyingToken.mint(user1.address, largeAmount);

      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, largeAmount);

      await strategy.connect(user1).deposit(largeAmount);

      expect(await strategy.totalDeposited()).to.equal(largeAmount);
    });

    it("Should handle sequential deposits and approvals", async function () {
      const { strategy, underlyingToken, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const depositAmount = amounts.small;

      // Deposit with exact approval multiple times
      for (let i = 0; i < 5; i++) {
        await underlyingToken
          .connect(user1)
          .approve(addresses.strategy, depositAmount);
        await strategy.connect(user1).deposit(depositAmount);
      }

      expect(await strategy.totalDeposited()).to.equal(depositAmount * 5n);
    });

    it("Should maintain state consistency after failed deposit", async function () {
      const { strategy, underlyingToken, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const depositAmount = amounts.medium;
      const largeAmount = amounts.huge;

      // Successful deposit first
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, depositAmount);
      await strategy.connect(user1).deposit(depositAmount);

      const balanceAfterSuccess = await strategy.totalDeposited();

      // Attempt failed deposit (insufficient balance)
      const userBalance = await underlyingToken.balanceOf(user1.address);
      const failAmount = userBalance + ethers.parseUnits("1", 6);

      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, failAmount);

      await expect(strategy.connect(user1).deposit(failAmount)).to.be.reverted;

      // State should be unchanged after failed transaction
      expect(await strategy.totalDeposited()).to.equal(balanceAfterSuccess);
    });
  });

  describe("Gas Usage", function () {
    it("Should use reasonable gas for deposit", async function () {
      const { strategy, underlyingToken, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const depositAmount = amounts.medium;

      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, depositAmount);

      const tx = await strategy.connect(user1).deposit(depositAmount);
      const receipt = await tx.wait();

      // Gas usage should be reasonable (adjust threshold as needed)
      expect(receipt.gasUsed).to.be.below(150000);
    });
  });

  describe("Integration with Other Functions", function () {
    it("Should work correctly after pause/unpause cycle", async function () {
      const { strategy, underlyingToken, user1, admin, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const depositAmount = amounts.medium;

      // Pause
      await strategy.connect(admin).pause();

      // Unpause
      await strategy.connect(admin).unpause();

      // Should work normally after unpause
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, depositAmount);
      await strategy.connect(user1).deposit(depositAmount);

      expect(await strategy.totalDeposited()).to.equal(depositAmount);
    });

    it("Should not affect other contract state variables", async function () {
      const { strategy, underlyingToken, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const depositAmount = amounts.medium;

      // Check initial state
      const initialBridgedIn = await strategy.totalBridgedIn();
      const initialBridgedOut = await strategy.totalBridgedOut();

      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, depositAmount);
      await strategy.connect(user1).deposit(depositAmount);

      // Other state variables should be unchanged
      expect(await strategy.totalBridgedIn()).to.equal(initialBridgedIn);
      expect(await strategy.totalBridgedOut()).to.equal(initialBridgedOut);
    });
  });
});
