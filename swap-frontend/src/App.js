import React, { useState, useEffect } from "react";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider, web3, BN } from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import Wallet from "./components/Wallet";
import Faucet from "./components/Faucet";
import Swap from "./components/Swap";
import "./styles/styles.css";
import {
  connection,
  getProvider,
  programID,
  tokenAMint,
  tokenBMint,
} from "./utils";

import ownerKey from "./owner.json";

const secretKey = Uint8Array.from(ownerKey);
const owner = Keypair.fromSecretKey(secretKey);

const swapPoolAddress = new PublicKey(
  "J77SiWMRX12DGnrgAZgYDwppkC7jufZrSe3JPreRf5Gp"
);
const poolTokenAAccount = new PublicKey(
  "AJRAbvxdKk2cT84NyVpGj2Un2GCjAmXncKWbq2fWKZbG"
);
const poolTokenBAccount = new PublicKey(
  "FSxHdS1cK4pKpL7twG886ZRLiL2wykxsJdRHwVxqFY8Y"
);

const App = () => {
  const [wallet, setWallet] = useState(null);
  const [program, setProgram] = useState(null);
  const [swapPool, setSwapPool] = useState(swapPoolAddress);

  useEffect(() => {
    const setup = async () => {
      if (wallet) {
        const provider = getProvider(window.solana);
        const idl = require("./idl.json");
        const programInstance = new Program(idl, programID, provider);
        setProgram(programInstance);
      }
    };
    setup();
  }, [wallet]);

  const initializePool = async () => {
    if (!wallet || !program) {
      alert("Wallet not connected or program not initialized");
      return;
    }

    try {     
    // Create or fetch the SwapPool account (ensure it exists before calling initialize)
    const swapPoolAccount = await program.account.swapPool.fetch(swapPool); // Fetch existing SwapPool if it exists
    if (!swapPoolAccount) {
      // Create the SwapPool account if it doesn't exist
      await program.rpc.initialize({
        accounts: {
          swapPool: swapPool,
          owner: wallet.publicKey,
          tokenAMint: tokenAMint,
          tokenBMint: tokenBMint,
          tokenAAccount: poolTokenAAccount,
          tokenBAccount: poolTokenBAccount,
          systemProgram: SystemProgram.programId,
        },
        signers: [wallet], // Make sure the wallet signs
      });

      alert(`✅ Swap pool initialized!`);
    } else {
      alert(`❌ Swap pool already exists! ${swapPoolAccount.address}`);
    }
    } catch (error) {
      console.error("Initialize error:", error);
      alert(`❌ Initialization failed! ${owner.publicKey}`);
    }
  };

  const faucetToken = async (token) => {
    if (!wallet || !wallet.publicKey || !program) {
      alert("Wallet not connected");
      return;
    }

    try {
      const mint = token === "A" ? tokenAMint : tokenBMint;
      const poolTokenAccount =
        token === "A" ? poolTokenAAccount : poolTokenBAccount;

      const userTokenAccount = await getAssociatedTokenAddress(
        mint,
        wallet.publicKey
      );
      console.log(mint.toBase58(), poolTokenAAccount.toBase58(), userTokenAccount.toBase58());
      
      await program.methods
        .faucet(new BN(1000))
        .accounts({
          swap_pool: swapPool,
          pool_token_account: poolTokenAccount,
          user_token_account: userTokenAccount,
          owner: owner.publicKey,
          token_program: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      alert(`${token} faucet successful!`);
    } catch (error) {
      console.error("Faucet error:", error);
      alert("Faucet failed!");
    }
  };

  const swapTokens = async (fromToken, amount) => {
    if (!wallet || !program) return;

    try {
      const fromMint = fromToken === "A" ? tokenAMint : tokenBMint;
      const toMint = fromToken === "A" ? tokenBMint : tokenAMint;

      const userFromAccount = await getAssociatedTokenAddress(
        fromMint,
        wallet.publicKey
      );
      const userToAccount = await getAssociatedTokenAddress(
        toMint,
        wallet.publicKey
      );

      const poolFromAccount =
        fromToken === "A" ? poolTokenAAccount : poolTokenBAccount;
      const poolToAccount =
        fromToken === "A" ? poolTokenBAccount : poolTokenAAccount;

      await program.methods
        .swap(new BN(amount))
        .accounts({
          swapPool: swapPool,
          user: wallet.publicKey,
          userFromAccount: userFromAccount,
          userToAccount: userToAccount,
          poolFromAccount: poolFromAccount,
          poolToAccount: poolToAccount,
          owner: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      alert(`Swapped ${amount} Token${fromToken}!`);
      console.log(
        "aa",
        swapPool.toBase58(),
        "bb",
        wallet.publicKey.toBase58(),
        userFromAccount,
        userToAccount,
        poolFromAccount,
        poolToAccount,
        TOKEN_PROGRAM_ID
      );
    } catch (error) {
      console.error("Swap error:", error);
      alert("Swap failed!");
      console.log(
        "a",
        swapPool.toBase58(),
        "b",
        wallet.publicKey.toBase58(),
        "d",
        TOKEN_PROGRAM_ID.toBase58()
      );
    }
  };

  return (
    <div className="container">
      <h1>Solana Swap Platform</h1>
      <Wallet setWallet={setWallet} />
      {wallet && (
        <>
          <button onClick={initializePool}>Initialize Swap Pool</button>
          <Faucet faucetToken={faucetToken} />
          <Swap swapTokens={swapTokens} />
        </>
      )}
    </div>
  );
};

export default App;
