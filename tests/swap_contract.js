const anchor = require("@coral-xyz/anchor");
const { SystemProgram, PublicKey, Keypair } = anchor.web3;
const {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const fs = require("fs");

function loadKeypair(path) {
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(path)));
  return Keypair.fromSecretKey(secretKey);
}

describe("swap_contract", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SwapContract;

  const swapPool = Keypair.generate();

  // Load existing wallets
  const owner = loadKeypair("./test1.json");
  const user = loadKeypair("./test2.json");

  let tokenAMint, tokenBMint;
  let poolTokenAAccount, poolTokenBAccount;
  let userTokenAAccount, userTokenBAccount;

  const initialPoolLiquidity = 1_000_000_000; // 1000 tokens
  const initialUserTokens = 500_000_000; // 500 tokens

  it("Initializes the swap pool", async () => {
    // Create TokenA and TokenB mints
    tokenAMint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      6
    );

    tokenBMint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      6
    );

    // Create pool token accounts
    poolTokenAAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      owner,
      tokenAMint,
      owner.publicKey
    );

    poolTokenBAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      owner,
      tokenBMint,
      owner.publicKey
    );

    // Fund the pool with initial liquidity
    await mintTo(
      provider.connection,
      owner,
      tokenAMint,
      poolTokenAAccount.address,
      owner.publicKey,
      initialPoolLiquidity
    );

    await mintTo(
      provider.connection,
      owner,
      tokenBMint,
      poolTokenBAccount.address,
      owner.publicKey,
      initialPoolLiquidity
    );

    await program.rpc.initialize({
      accounts: {
        swapPool: swapPool.publicKey,
        tokenAMint: tokenAMint,
        tokenBMint: tokenBMint,
        tokenAAccount: poolTokenAAccount.address,
        tokenBAccount: poolTokenBAccount.address,
        owner: owner.publicKey,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [swapPool, owner],
    });

    console.log("✅ Swap pool initialized");
  });

  it("Swaps TokenA for TokenB", async () => {
    userTokenAAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user,
      tokenAMint,
      user.publicKey
    );

    userTokenBAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      user,
      tokenBMint,
      user.publicKey
    );

    const faucetAmount = new anchor.BN(initialUserTokens); // Amount to mint to the user
    await program.rpc.faucet(faucetAmount, {
      accounts: {
        swapPool: swapPool.publicKey,               // The swap pool
        poolTokenAccount: poolTokenAAccount.address, // The pool's TokenA account
        userTokenAccount: userTokenAAccount.address, // The user's TokenA account
        owner: owner.publicKey,                      // The faucet owner (signer)
        tokenProgram: TOKEN_PROGRAM_ID,              // SPL Token Program ID
      },
      signers: [owner], // The owner signs the transaction (faucet function)
    });

    const swapAmount = new anchor.BN(100_000_000); // Swap 100 tokens

    await program.rpc.swap(swapAmount, {
      accounts: {
        swapPool: swapPool.publicKey,
        user: user.publicKey,
        userFromAccount: userTokenAAccount.address,
        userToAccount: userTokenBAccount.address,
        poolFromAccount: poolTokenAAccount.address,
        poolToAccount: poolTokenBAccount.address,
        owner: owner.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [user, owner],
    });

    const poolTokenABalance = await getAccount(provider.connection, poolTokenAAccount.address);
    const poolTokenBBalance = await getAccount(provider.connection, poolTokenBAccount.address);
    const userTokenABalance = await getAccount(provider.connection, userTokenAAccount.address);
    const userTokenBBalance = await getAccount(provider.connection, userTokenBAccount.address);

    console.log("✅ Swap executed");
    console.log(`User TokenA balance: ${Number(userTokenABalance.amount)} ${userTokenAAccount.address.toBase58()}`);
    console.log(`User TokenB balance: ${Number(userTokenBBalance.amount)} ${userTokenBAccount.address.toBase58()}`);
    console.log(`Pool TokenA balance: ${Number(poolTokenABalance.amount)} ${poolTokenAAccount.address.toBase58()}`);
    console.log(`Pool TokenB balance: ${Number(poolTokenBBalance.amount)} ${poolTokenBAccount.address.toBase58()}`);
  });
});
