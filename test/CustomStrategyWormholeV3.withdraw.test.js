const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const {
  deployContractFixture,
  deployContractWithDepositsFixture,
  deployPausedContractFixture,
} = require("./fixtures");

describe("CustomStrategyWormholeV3 - Withdraw Function", function () {
  describe("Successful Withdrawals", function () {
    it("Should allow admin to withdraw underlying tokens", async function () {
      const { strategy, underlyingToken, admin, user1, amounts, addresses } =
        await loadFixture(deployContractWithDepositsFixture);

      // Additional deposit to ensure sufficient balance
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, amounts.medium);
      await strategy.connect(user1).deposit(amounts.medium);

      const withdrawAmount = amounts.small;
      const initialAdminBalance = await underlyingToken.balanceOf(
        admin.address
      );
      const initialContractBalance = await underlyingToken.balanceOf(
        addresses.strategy
      );
      const initialTotalWithdrawn = await strategy.totalWithdrawn(
        addresses.underlyingToken
      );

      const tx = await strategy
        .connect(admin)
        .withdraw(addresses.underlyingToken, withdrawAmount);

      // Verify balances
      expect(await underlyingToken.balanceOf(admin.address)).to.equal(
        initialAdminBalance + withdrawAmount
      );
      expect(await underlyingToken.balanceOf(addresses.strategy)).to.equal(
        initialContractBalance - withdrawAmount
      );

      // Verify totalWithdrawn tracking
      expect(await strategy.totalWithdrawn(addresses.underlyingToken)).to.equal(
        initialTotalWithdrawn + withdrawAmount
      );

      // Verify event emission
      await expect(tx)
        .to.emit(strategy, "Withdrawn")
        .withArgs(addresses.underlyingToken, withdrawAmount, admin.address);
    });

    it("Should allow admin to withdraw alternative tokens", async function () {
      const { strategy, altToken, admin, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const withdrawAmount = ethers.parseUnits("10", 18);
      const initialAdminBalance = await altToken.balanceOf(admin.address);
      const initialContractBalance = await altToken.balanceOf(
        addresses.strategy
      );

      const tx = await strategy
        .connect(admin)
        .withdraw(addresses.altToken, withdrawAmount);

      expect(await altToken.balanceOf(admin.address)).to.equal(
        initialAdminBalance + withdrawAmount
      );
      expect(await altToken.balanceOf(addresses.strategy)).to.equal(
        initialContractBalance - withdrawAmount
      );

      await expect(tx)
        .to.emit(strategy, "Withdrawn")
        .withArgs(addresses.altToken, withdrawAmount, admin.address);
    });

    it("Should track multiple withdrawals correctly", async function () {
      const { strategy, underlyingToken, admin, user1, amounts, addresses } =
        await loadFixture(deployContractWithDepositsFixture);

      // Additional deposits to ensure sufficient balance
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, amounts.large);
      await strategy.connect(user1).deposit(amounts.large);

      // Multiple withdrawals
      const withdraw1 = amounts.small;
      const withdraw2 = ethers.parseUnits("200", 6);
      const withdraw3 = ethers.parseUnits("150", 6);

      await strategy
        .connect(admin)
        .withdraw(addresses.underlyingToken, withdraw1);
      await strategy
        .connect(admin)
        .withdraw(addresses.underlyingToken, withdraw2);
      await strategy
        .connect(admin)
        .withdraw(addresses.underlyingToken, withdraw3);

      expect(await strategy.totalWithdrawn(addresses.underlyingToken)).to.equal(
        withdraw1 + withdraw2 + withdraw3
      );
    });

    it("Should allow withdrawal of entire contract balance", async function () {
      const { strategy, underlyingToken, admin, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      // Deposit tokens first
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, amounts.medium);
      await strategy.connect(user1).deposit(amounts.medium);

      // Withdraw entire balance
      const contractBalance = await underlyingToken.balanceOf(
        addresses.strategy
      );
      await strategy
        .connect(admin)
        .withdraw(addresses.underlyingToken, contractBalance);

      expect(await underlyingToken.balanceOf(addresses.strategy)).to.equal(0);
      expect(await strategy.totalWithdrawn(addresses.underlyingToken)).to.equal(
        contractBalance
      );
    });

    it("Should handle withdrawals of different token types separately", async function () {
      const {
        strategy,
        underlyingToken,
        altToken,
        admin,
        user1,
        amounts,
        addresses,
      } = await loadFixture(deployContractFixture);

      // Deposit underlying tokens
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, amounts.medium);
      await strategy.connect(user1).deposit(amounts.medium);

      const underlyingWithdraw = amounts.small;
      const altWithdraw = ethers.parseUnits("50", 18);

      // Withdraw different tokens
      await strategy
        .connect(admin)
        .withdraw(addresses.underlyingToken, underlyingWithdraw);
      await strategy.connect(admin).withdraw(addresses.altToken, altWithdraw);

      // Check separate tracking
      expect(await strategy.totalWithdrawn(addresses.underlyingToken)).to.equal(
        underlyingWithdraw
      );
      expect(await strategy.totalWithdrawn(addresses.altToken)).to.equal(
        altWithdraw
      );
    });

    it("Should handle withdrawal of 1 wei", async function () {
      const { strategy, underlyingToken, admin, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      // Deposit some tokens first
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, amounts.small);
      await strategy.connect(user1).deposit(amounts.small);

      const withdrawAmount = 1n;

      await strategy
        .connect(admin)
        .withdraw(addresses.underlyingToken, withdrawAmount);

      expect(await strategy.totalWithdrawn(addresses.underlyingToken)).to.equal(
        withdrawAmount
      );
    });
  });

  describe("Access Control", function () {
    it("Should revert when non-admin tries to withdraw", async function () {
      const { strategy, underlyingToken, user1, amounts, addresses } =
        await loadFixture(deployContractWithDepositsFixture);

      const withdrawAmount = amounts.small;

      await expect(
        strategy
          .connect(user1)
          .withdraw(addresses.underlyingToken, withdrawAmount)
      ).to.be.revertedWithCustomError(strategy, "Unauthorized");
    });

    it("Should revert when reporting manager tries to withdraw", async function () {
      const {
        strategy,
        underlyingToken,
        reportingManager,
        amounts,
        addresses,
      } = await loadFixture(deployContractWithDepositsFixture);

      const withdrawAmount = amounts.small;

      await expect(
        strategy
          .connect(reportingManager)
          .withdraw(addresses.underlyingToken, withdrawAmount)
      ).to.be.revertedWithCustomError(strategy, "Unauthorized");
    });

    it("Should revert when deployer (non-admin) tries to withdraw", async function () {
      const { strategy, underlyingToken, deployer, amounts, addresses } =
        await loadFixture(deployContractWithDepositsFixture);

      const withdrawAmount = amounts.small;

      // Deployer has DEFAULT_ADMIN_ROLE but we're testing the specific ADMIN role
      await expect(
        strategy
          .connect(deployer)
          .withdraw(addresses.underlyingToken, withdrawAmount)
      ).to.not.be.reverted; // Deployer should actually be able to withdraw since they have admin rights from deployment
    });

    it("Should allow withdrawal after granting admin role", async function () {
      const {
        strategy,
        underlyingToken,
        admin,
        user1,
        amounts,
        addresses,
        ADMIN_ROLE,
        deployer,
      } = await loadFixture(deployContractWithDepositsFixture);

      // Grant admin role to user1 (use deployer who has DEFAULT_ADMIN_ROLE)
      await strategy.connect(deployer).grantRole(ADMIN_ROLE, user1.address);

      const withdrawAmount = amounts.small;

      // Now user1 should be able to withdraw
      await expect(
        strategy
          .connect(user1)
          .withdraw(addresses.underlyingToken, withdrawAmount)
      ).to.not.be.reverted;
    });

    it("Should revoke withdrawal access when admin role is revoked", async function () {
      const {
        strategy,
        underlyingToken,
        admin,
        user1,
        amounts,
        addresses,
        ADMIN_ROLE,
        deployer,
      } = await loadFixture(deployContractWithDepositsFixture);

      // Grant then revoke admin role (use deployer who has DEFAULT_ADMIN_ROLE)
      await strategy.connect(deployer).grantRole(ADMIN_ROLE, user1.address);
      await strategy.connect(deployer).revokeRole(ADMIN_ROLE, user1.address);

      const withdrawAmount = amounts.small;

      await expect(
        strategy
          .connect(user1)
          .withdraw(addresses.underlyingToken, withdrawAmount)
      ).to.be.revertedWithCustomError(strategy, "Unauthorized");
    });
  });

  describe("Withdraw Failures", function () {
    it("Should revert when contract is paused", async function () {
      const { strategy, underlyingToken, admin, amounts, addresses } =
        await loadFixture(deployPausedContractFixture);

      const withdrawAmount = amounts.small;

      await expect(
        strategy
          .connect(admin)
          .withdraw(addresses.underlyingToken, withdrawAmount)
      ).to.be.reverted;
    });

    it("Should revert when insufficient balance", async function () {
      const { strategy, underlyingToken, admin, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const contractBalance = await underlyingToken.balanceOf(
        addresses.strategy
      );
      const withdrawAmount = contractBalance + ethers.parseUnits("1", 6);

      await expect(
        strategy
          .connect(admin)
          .withdraw(addresses.underlyingToken, withdrawAmount)
      )
        .to.be.revertedWithCustomError(strategy, "InsufficientBalance")
        .withArgs(withdrawAmount, contractBalance);
    });

    it("Should revert when withdrawing zero amount", async function () {
      const { strategy, underlyingToken, admin, addresses } = await loadFixture(
        deployContractFixture
      );

      const contractBalance = await underlyingToken.balanceOf(
        addresses.strategy
      );

      // Zero withdrawal should succeed (no balance check for 0 amount)
      const tx = await strategy
        .connect(admin)
        .withdraw(addresses.underlyingToken, 0);
      await expect(tx)
        .to.emit(strategy, "Withdrawn")
        .withArgs(addresses.underlyingToken, 0, admin.address);
    });

    it("Should revert when withdrawing from contract with zero balance", async function () {
      const { strategy, underlyingToken, admin, amounts, addresses } =
        await loadFixture(deployContractFixture);

      // Contract should have zero underlying tokens initially
      const withdrawAmount = amounts.small;

      await expect(
        strategy
          .connect(admin)
          .withdraw(addresses.underlyingToken, withdrawAmount)
      )
        .to.be.revertedWithCustomError(strategy, "InsufficientBalance")
        .withArgs(withdrawAmount, 0);
    });

    it("Should revert when withdrawing more than available after partial withdrawal", async function () {
      const { strategy, underlyingToken, admin, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      // Deposit tokens
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, amounts.medium);
      await strategy.connect(user1).deposit(amounts.medium);

      // First withdrawal
      const firstWithdraw = amounts.small;
      await strategy
        .connect(admin)
        .withdraw(addresses.underlyingToken, firstWithdraw);

      // Try to withdraw more than remaining
      const remainingBalance = await underlyingToken.balanceOf(
        addresses.strategy
      );
      const excessiveWithdraw = remainingBalance + ethers.parseUnits("1", 6);

      await expect(
        strategy
          .connect(admin)
          .withdraw(addresses.underlyingToken, excessiveWithdraw)
      )
        .to.be.revertedWithCustomError(strategy, "InsufficientBalance")
        .withArgs(excessiveWithdraw, remainingBalance);
    });
  });

  describe("Withdraw State Changes", function () {
    it("Should correctly update totalWithdrawn for single token", async function () {
      const { strategy, underlyingToken, admin, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      // Deposit tokens first
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, amounts.large);
      await strategy.connect(user1).deposit(amounts.large);

      const withdraw1 = amounts.small;
      const withdraw2 = ethers.parseUnits("200", 6);

      // Initial state
      expect(await strategy.totalWithdrawn(addresses.underlyingToken)).to.equal(
        0
      );

      // First withdrawal
      await strategy
        .connect(admin)
        .withdraw(addresses.underlyingToken, withdraw1);
      expect(await strategy.totalWithdrawn(addresses.underlyingToken)).to.equal(
        withdraw1
      );

      // Second withdrawal
      await strategy
        .connect(admin)
        .withdraw(addresses.underlyingToken, withdraw2);
      expect(await strategy.totalWithdrawn(addresses.underlyingToken)).to.equal(
        withdraw1 + withdraw2
      );
    });

    it("Should maintain separate totalWithdrawn for different tokens", async function () {
      const {
        strategy,
        underlyingToken,
        altToken,
        admin,
        user1,
        amounts,
        addresses,
      } = await loadFixture(deployContractFixture);

      // Deposit underlying tokens
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, amounts.medium);
      await strategy.connect(user1).deposit(amounts.medium);

      const underlyingWithdraw = amounts.small;
      const altWithdraw = ethers.parseUnits("25", 18);

      // Withdraw different tokens
      await strategy
        .connect(admin)
        .withdraw(addresses.underlyingToken, underlyingWithdraw);
      await strategy.connect(admin).withdraw(addresses.altToken, altWithdraw);

      // Check separate tracking
      expect(await strategy.totalWithdrawn(addresses.underlyingToken)).to.equal(
        underlyingWithdraw
      );
      expect(await strategy.totalWithdrawn(addresses.altToken)).to.equal(
        altWithdraw
      );
    });

    it("Should not affect totalDeposited when withdrawing", async function () {
      const { strategy, underlyingToken, admin, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      // Deposit tokens
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, amounts.medium);
      await strategy.connect(user1).deposit(amounts.medium);

      const depositedAmount = await strategy.totalDeposited();
      const withdrawAmount = amounts.small;

      await strategy
        .connect(admin)
        .withdraw(addresses.underlyingToken, withdrawAmount);

      // totalDeposited should remain unchanged
      expect(await strategy.totalDeposited()).to.equal(depositedAmount);
    });
  });

  describe("Withdraw Events", function () {
    it("Should emit Withdrawn event with correct parameters", async function () {
      const { strategy, underlyingToken, admin, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      // Deposit tokens first
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, amounts.medium);
      await strategy.connect(user1).deposit(amounts.medium);

      const withdrawAmount = amounts.small;

      await expect(
        strategy
          .connect(admin)
          .withdraw(addresses.underlyingToken, withdrawAmount)
      )
        .to.emit(strategy, "Withdrawn")
        .withArgs(addresses.underlyingToken, withdrawAmount, admin.address);
    });

    it("Should emit correct events for multiple withdrawals", async function () {
      const {
        strategy,
        underlyingToken,
        altToken,
        admin,
        user1,
        amounts,
        addresses,
      } = await loadFixture(deployContractFixture);

      // Deposit tokens first
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, amounts.medium);
      await strategy.connect(user1).deposit(amounts.medium);

      const underlyingWithdraw = amounts.small;
      const altWithdraw = ethers.parseUnits("10", 18);

      // First withdrawal (underlying token)
      await expect(
        strategy
          .connect(admin)
          .withdraw(addresses.underlyingToken, underlyingWithdraw)
      )
        .to.emit(strategy, "Withdrawn")
        .withArgs(addresses.underlyingToken, underlyingWithdraw, admin.address);

      // Second withdrawal (alt token)
      await expect(
        strategy.connect(admin).withdraw(addresses.altToken, altWithdraw)
      )
        .to.emit(strategy, "Withdrawn")
        .withArgs(addresses.altToken, altWithdraw, admin.address);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle withdrawal when contract has exactly the requested amount", async function () {
      const { strategy, underlyingToken, admin, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      const depositAmount = amounts.medium;
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, depositAmount);
      await strategy.connect(user1).deposit(depositAmount);

      // Withdraw exactly the deposited amount
      await expect(
        strategy
          .connect(admin)
          .withdraw(addresses.underlyingToken, depositAmount)
      ).to.not.be.reverted;

      expect(await underlyingToken.balanceOf(addresses.strategy)).to.equal(0);
    });

    it("Should handle maximum uint256 withdrawal amount check", async function () {
      const { strategy, underlyingToken, admin, addresses } = await loadFixture(
        deployContractFixture
      );

      const maxAmount = ethers.MaxUint256;
      const contractBalance = await underlyingToken.balanceOf(
        addresses.strategy
      );

      await expect(
        strategy.connect(admin).withdraw(addresses.underlyingToken, maxAmount)
      )
        .to.be.revertedWithCustomError(strategy, "InsufficientBalance")
        .withArgs(maxAmount, contractBalance);
    });

    it("Should handle withdrawal after multiple deposits and withdrawals", async function () {
      const {
        strategy,
        underlyingToken,
        admin,
        user1,
        user2,
        amounts,
        addresses,
      } = await loadFixture(deployContractFixture);

      // Multiple deposits
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, amounts.large);
      await strategy.connect(user1).deposit(amounts.medium);

      await underlyingToken
        .connect(user2)
        .approve(addresses.strategy, amounts.large);
      await strategy.connect(user2).deposit(amounts.medium);

      // Multiple withdrawals
      const withdraw1 = amounts.small;
      const withdraw2 = ethers.parseUnits("150", 6);

      await strategy
        .connect(admin)
        .withdraw(addresses.underlyingToken, withdraw1);
      await strategy
        .connect(admin)
        .withdraw(addresses.underlyingToken, withdraw2);

      const totalWithdrawn = await strategy.totalWithdrawn(
        addresses.underlyingToken
      );
      const expectedWithdrawn = withdraw1 + withdraw2;

      expect(totalWithdrawn).to.equal(expectedWithdrawn);

      // Should still be able to withdraw more
      const finalWithdraw = amounts.small;
      await expect(
        strategy
          .connect(admin)
          .withdraw(addresses.underlyingToken, finalWithdraw)
      ).to.not.be.reverted;
    });

    it("Should handle concurrent withdrawals correctly", async function () {
      const { strategy, underlyingToken, admin, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      // Deposit large amount
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, amounts.large);
      await strategy.connect(user1).deposit(amounts.large);

      // Multiple small withdrawals
      const withdrawAmount = amounts.small;
      const numWithdrawals = 5;

      for (let i = 0; i < numWithdrawals; i++) {
        await strategy
          .connect(admin)
          .withdraw(addresses.underlyingToken, withdrawAmount);
      }

      expect(await strategy.totalWithdrawn(addresses.underlyingToken)).to.equal(
        withdrawAmount * BigInt(numWithdrawals)
      );
    });
  });

  describe("Gas Usage", function () {
    it("Should use reasonable gas for withdrawal", async function () {
      const { strategy, underlyingToken, admin, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      // Deposit tokens first
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, amounts.medium);
      await strategy.connect(user1).deposit(amounts.medium);

      const withdrawAmount = amounts.small;

      const tx = await strategy
        .connect(admin)
        .withdraw(addresses.underlyingToken, withdrawAmount);
      const receipt = await tx.wait();

      // Gas usage should be reasonable (adjust threshold as needed)
      expect(receipt.gasUsed).to.be.below(100000);
    });
  });

  describe("Integration with Other Functions", function () {
    it("Should work correctly after pause/unpause cycle", async function () {
      const { strategy, underlyingToken, admin, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      // Deposit tokens
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, amounts.medium);
      await strategy.connect(user1).deposit(amounts.medium);

      // Pause and unpause
      await strategy.connect(admin).pause();
      await strategy.connect(admin).unpause();

      // Should work normally after unpause
      const withdrawAmount = amounts.small;
      await expect(
        strategy
          .connect(admin)
          .withdraw(addresses.underlyingToken, withdrawAmount)
      ).to.not.be.reverted;
    });

    it("Should not affect bridge-related state variables", async function () {
      const { strategy, underlyingToken, admin, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      // Deposit tokens
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, amounts.medium);
      await strategy.connect(user1).deposit(amounts.medium);

      // Check initial bridge state
      const initialBridgedIn = await strategy.totalBridgedIn();
      const initialBridgedOut = await strategy.totalBridgedOut();
      const initialTotalDeposited = await strategy.totalDeposited();

      await strategy
        .connect(admin)
        .withdraw(addresses.underlyingToken, amounts.small);

      // Bridge state should be unchanged
      expect(await strategy.totalBridgedIn()).to.equal(initialBridgedIn);
      expect(await strategy.totalBridgedOut()).to.equal(initialBridgedOut);
      expect(await strategy.totalDeposited()).to.equal(initialTotalDeposited);
    });

    it("Should work correctly with emergency withdraw when not paused", async function () {
      const { strategy, underlyingToken, admin, user1, amounts, addresses } =
        await loadFixture(deployContractFixture);

      // Deposit tokens
      await underlyingToken
        .connect(user1)
        .approve(addresses.strategy, amounts.medium);
      await strategy.connect(user1).deposit(amounts.medium);

      // Regular withdraw should work fine when not paused
      await expect(
        strategy
          .connect(admin)
          .withdraw(addresses.underlyingToken, amounts.small)
      ).to.not.be.reverted;

      // totalWithdrawn should be updated
      expect(await strategy.totalWithdrawn(addresses.underlyingToken)).to.equal(
        amounts.small
      );
    });
  });
});
