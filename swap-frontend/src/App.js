import React, { useState, useEffect } from 'react';
import * as anchor from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, getAccount, createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import idl from './idl.json'; // Replace with your actual IDL file path

// Placeholder addresses (replace with your actual values from the test script)
const SWAP_POOL_PUBKEY = new anchor.web3.PublicKey('FFFjCBPbNSHgshiYbSYkQ5byVxVfsTt8GLnYrk8SMXBG');
const TOKEN_A_MINT = new anchor.web3.PublicKey('GyaP4sZ2tBKSJCBAiRjE3HCZwxYU1tcFN2gjtkhFwMTV');
const TOKEN_B_MINT = new anchor.web3.PublicKey('Dusj5ryqs5v6ZtszAR6zUrkaXuyWWsbAWmzL3ogwisvP');
const POOL_TOKEN_A_ACCOUNT = new anchor.web3.PublicKey('7zqfUfXQpeEbpgoj8JExwLRMG4KghDCcWiFHVQvPMpsb');
const POOL_TOKEN_B_ACCOUNT = new anchor.web3.PublicKey('9RniJM8QVYqgUotdfBygFfGYoFJriQ61nY6y9auShPs4');
const PROGRAM_ID = new anchor.web3.PublicKey('4mALzdJAdAAkTsB4vsvVo1GjHpxFJEbFz5Bp8vtUStzy');

// Owner keypair (replace with your test1.json secret key)
const OWNER_SECRET_KEY = Uint8Array.from([0,173,53,68,229,160,236,120,208,137,128,59,22,60,156,60,15,141,47,159,204,220,244,144,198,240,93,158,242,52,70,88,181,155,167,238,87,167,82,85,219,197,206,215,42,145,46,132,21,100,245,55,75,11,232,116,91,15,126,141,201,36,103,40]);
const owner = anchor.web3.Keypair.fromSecretKey(OWNER_SECRET_KEY);

// Custom wallet adapter for Phantom
class PhantomWalletAdapter {
  constructor() {
    this._publicKey = null;
    this._onConnect = null;
  }

  get publicKey() {
    return this._publicKey;
  }

  async connect() {
    const wallet = window.solana;
    if (!wallet || !wallet.isPhantom) {
      throw new Error('Phantom wallet not found! Please install it.');
    }
    await wallet.connect();
    this._publicKey = wallet.publicKey;
    if (this._onConnect) this._onConnect();
  }

  async disconnect() {
    const wallet = window.solana;
    if (wallet) await wallet.disconnect();
    this._publicKey = null;
  }

  async signTransaction(tx) {
    const wallet = window.solana;
    return await wallet.signTransaction(tx);
  }

  on(event, callback) {
    if (event === 'connect') this._onConnect = callback;
  }
}

const App = () => {
  const [wallet, setWallet] = useState(null);
  const [provider, setProvider] = useState(null);
  const [program, setProgram] = useState(null);
  const [userTokenAAccount, setUserTokenAAccount] = useState(null);
  const [userTokenBAccount, setUserTokenBAccount] = useState(null);
  const [balances, setBalances] = useState({
    userTokenA: 0,
    userTokenB: 0,
    poolTokenA: 0,
    poolTokenB: 0,
  });
  const [walletConnected, setWalletConnected] = useState(false);

  const connection = new anchor.web3.Connection('https://api.devnet.solana.com', 'confirmed');
  
  useEffect(() => {
    console.log('Wallet state:', { wallet, walletConnected, publicKey: wallet?.publicKey });
  }, [wallet, walletConnected]);
  
  // Function to create ATA with retry on blockhash failure
  const createATAWithRetry = async (walletAdapter, mint, retries = 3) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Attempt ${attempt} to create ATA for mint: ${mint.toBase58()}`);
        const ata = getAssociatedTokenAddressSync(
          mint,
          walletAdapter.publicKey,
          false,
          TOKEN_PROGRAM_ID
        );
        console.log('Calculated ATA:', ata.toBase58());
        
        const tx = new anchor.web3.Transaction();
        tx.add(
          createAssociatedTokenAccountInstruction(
            walletAdapter.publicKey, // Payer
            ata, // ATA address
            walletAdapter.publicKey, // Owner
            mint // Mint
          )
        );

        // Fetch blockhash right before signing
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        console.log('Fetched blockhash:', blockhash);
        tx.recentBlockhash = blockhash;
        tx.feePayer = walletAdapter.publicKey;

        const signedTx = await walletAdapter.signTransaction(tx);
        const txId = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          maxRetries: 5, // Retry up to 5 times on network failure
        });
        console.log('ATA creation transaction sent, txId:', txId);

        await connection.confirmTransaction({
          blockhash,
          lastValidBlockHeight,
          signature: txId,
        });
        console.log('ATA creation confirmed');
        
        const account = await getAccount(connection, ata);
        console.log('ATA manually created:', account.address.toBase58());
        return account;
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error);
        if (attempt === retries) throw error; // Throw on last attempt
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
      }
    }
  };

  // Initialize provider and program after wallet connects
  const setupProviderAndProgram = async (walletAdapter) => {
    const provider = new anchor.AnchorProvider(connection, walletAdapter, {
      preflightCommitment: 'confirmed',
    });
    setProvider(provider);

    const program = new anchor.Program(idl, PROGRAM_ID, provider);
    setProgram(program);

    try {
      console.log('Wallet Public Key:', walletAdapter.publicKey.toBase58());
      console.log('Token A Mint:', TOKEN_A_MINT.toBase58());
      console.log('Token B Mint:', TOKEN_B_MINT.toBase58());
      console.log('Wallet SOL Balance:', (await connection.getBalance(walletAdapter.publicKey)) / anchor.web3.LAMPORTS_PER_SOL);

      // Try to get or create Token A ATA
      let tokenAAccount;
      try {
        console.log('Attempting to get or create Token A ATA...');
        tokenAAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          walletAdapter,
          TOKEN_A_MINT,
          walletAdapter.publicKey,
          true
        );
        console.log('Token A ATA created/found:', tokenAAccount.address.toBase58());
      } catch (error) {
        console.error('Token A ATA creation failed:', error);
        console.log('Falling back to manual ATA creation for Token A...');
        tokenAAccount = await createATAWithRetry(walletAdapter, TOKEN_A_MINT);
      }

      // Try to get or create Token B ATA
      let tokenBAccount;
      try {
        console.log('Attempting to get or create Token B ATA...');
        tokenBAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          walletAdapter,
          TOKEN_B_MINT,
          walletAdapter.publicKey,
          true
        );
        console.log('Token B ATA created/found:', tokenBAccount.address.toBase58());
      } catch (error) {
        console.error('Token B ATA creation failed:', error);
        console.log('Falling back to manual ATA creation for Token B...');
        tokenBAccount = await createATAWithRetry(walletAdapter, TOKEN_B_MINT);
      }

      setUserTokenAAccount(tokenAAccount);
      setUserTokenBAccount(tokenBAccount);

      await updateBalances(tokenAAccount.address, tokenBAccount.address);
    } catch (error) {
      console.error('Error setting up token accounts:', error);
      if (error instanceof anchor.web3.SendTransactionError) {
        console.error('Transaction logs:', error.logs);
      }
      alert('Failed to set up token accounts: ' + error.message);
    }
  };

  // Update balances
  const updateBalances = async (userTokenAAddress, userTokenBAddress) => {
    try {
      const userTokenABalance = await getAccount(connection, userTokenAAddress);
      const userTokenBBalance = await getAccount(connection, userTokenBAddress);
      const poolTokenABalance = await getAccount(connection, POOL_TOKEN_A_ACCOUNT);
      const poolTokenBBalance = await getAccount(connection, POOL_TOKEN_B_ACCOUNT);

      setBalances({
        userTokenA: Number(userTokenABalance.amount) / 1_000_000, // Assuming 6 decimals
        userTokenB: Number(userTokenBBalance.amount) / 1_000_000,
        poolTokenA: Number(poolTokenABalance.amount) / 1_000_000,
        poolTokenB: Number(poolTokenBBalance.amount) / 1_000_000,
      });
    } catch (error) {
      console.error('Error updating balances:', error);
    }
  };

  // Connect wallet
  const connectWallet = async () => {
    try {
      const walletAdapter = new PhantomWalletAdapter();
      walletAdapter.on('connect', () => {
        console.log('Wallet connected, publicKey:', walletAdapter.publicKey?.toBase58());
        setWallet(walletAdapter);
        setWalletConnected(true);
        setupProviderAndProgram(walletAdapter);
      });
      await walletAdapter.connect();
    } catch (error) {
      console.error('Wallet connection failed:', error);
      alert('Failed to connect wallet: ' + error.message);
    }
  };

  // Faucet TokenA or TokenB (100 tokens)
  const faucet = async (tokenType) => {
    if (!program || !wallet || !wallet.publicKey) {
      alert('Please connect your wallet first!');
      return;
    }
    if (!userTokenAAccount?.address || !userTokenBAccount?.address) {
      alert('Token accounts are not initialized!');
      return;
    }

    const amount = new anchor.BN(100_000_000); // 100 tokens (6 decimals)
    const poolTokenAccount = tokenType === 'A' ? POOL_TOKEN_A_ACCOUNT : POOL_TOKEN_B_ACCOUNT;
    const userTokenAccount = tokenType === 'A' ? userTokenAAccount.address : userTokenBAccount.address;

    try {
      // await program.rpc.faucet(amount, {
      //   accounts: {
      //     swap_pool: SWAP_POOL_PUBKEY,
      //     pool_token_account: poolTokenAccount,
      //     user_token_account: userTokenAccount,
      //     owner: owner.publicKey,
      //     token_program: TOKEN_PROGRAM_ID,
      //   },
      //   signers: [owner], // Owner signs faucet transaction
      // });

      console.log('Program ID before faucet:', program.programId.toBase58());
      // Create a new transaction
    const tx = new anchor.web3.Transaction();

    // Build the faucet instruction
    const instruction = await program.methods
      .faucet(amount)
      .accounts({
        swap_pool: SWAP_POOL_PUBKEY,
        pool_token_account: poolTokenAccount,
        user_token_account: userTokenAccount,
        owner: owner.publicKey, // Use Phantom wallet as owner
        token_program: TOKEN_PROGRAM_ID,
      })
      .instruction();

    // Fix mutability and signer constraints based on IDL
    instruction.keys[0].isWritable = true;  // swap_pool must be mutable
    instruction.keys[1].isWritable = true;  // pool_token_account must be mutable
    instruction.keys[2].isWritable = true;  // user_token_account must be mutable
    instruction.keys[3].isWritable = true;  // owner: writable (per IDL)
    instruction.keys[3].isSigner = true;    // owner: signer

    // Log instruction keys for debugging
    console.log('Instruction accounts after fix:', instruction.keys.map((key, index) => ({
      index,
      pubkey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })));

    // Add instruction to transaction
    tx.add(instruction);

    // Set recent blockhash and fee payer
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    console.log('Transaction prepared:', { blockhash, lastValidBlockHeight });

    // Set expected signers (owner and Phantom)
    console.log('Setting expected signers...');
    tx.signatures = [
      { signature: null, publicKey: wallet.publicKey }, // Phantom as fee payer
      { signature: null, publicKey: owner.publicKey },  // Owner for token transfer
    ];

    // Sign with owner
    console.log('Signing with owner...');
    tx.partialSign(owner);
    console.log('Owner signature added:', { signatures: tx.signatures.filter(s => s.signature !== null).length });

    // Sign with Phantom
    console.log('Sending to Phantom for signing...');
    const signedTx = await wallet.signTransaction(tx);
    console.log('Transaction signed by Phantom:', {
      signatures: signedTx.signatures.filter(s => s.signature !== null).length,
      feePayer: signedTx.feePayer?.toBase58(),
    });

    const txId = await connection.sendRawTransaction(signedTx.serialize());
    console.log('Transaction sent:', txId);

    const confirmation = await connection.confirmTransaction({
      signature: txId,
      blockhash,
      lastValidBlockHeight,
    });
    if (confirmation.value.err) {
      throw new Error('Transaction failed: ' + confirmation.value.err.toString());
    }
      await updateBalances(userTokenAAccount.address, userTokenBAccount.address);
      alert(`Faucet ${tokenType} successful!`);
    } catch (error) {
      console.error('Faucet error:', error);
      alert('Faucet failed: ' + error.message);
    }
  };

  // Swap A-to-B or B-to-A (50 tokens)
  const swap = async (direction) => {
    if (!program || !wallet) {
      alert('Please connect your wallet first!');
      return;
    }
    console.log('Swap function started');
    const amount = new anchor.BN(50_000_000); //50 tokens (6 decimals)
    const isAToB = direction === 'A-to-B';

    console.log('Swap Pool:', SWAP_POOL_PUBKEY.toBase58());
    console.log('User:', wallet.publicKey?.toBase58() || 'undefined');
    console.log('User Token A Account:', userTokenAAccount?.address?.toBase58() || 'undefined');
    console.log('User Token B Account:', userTokenBAccount?.address?.toBase58() || 'undefined');
    console.log('Pool From Account:', (isAToB ? POOL_TOKEN_A_ACCOUNT : POOL_TOKEN_B_ACCOUNT).toBase58());
    console.log('Pool To Account:', (isAToB ? POOL_TOKEN_B_ACCOUNT : POOL_TOKEN_A_ACCOUNT).toBase58());
    console.log('Owner:', owner.publicKey.toBase58());
    console.log('Token Program:', TOKEN_PROGRAM_ID.toBase58());
    
    if (!wallet.publicKey) {
      throw new Error('Wallet public key is undefined');
    }
    if (!userTokenAAccount?.address) {
      throw new Error('User Token A account is undefined');
    }
    if (!userTokenBAccount?.address) {
      throw new Error('User Token B account is undefined');
    }

    try {
      console.log(`Starting swap ${direction}...`);
      // await program.rpc.swap(amount, {
      //   accounts: {
      //     swap_pool: SWAP_POOL_PUBKEY,
      //     user: wallet.publicKey,
      //     user_from_account: isAToB ? userTokenAAccount.address : userTokenBAccount.address,
      //     user_to_account: isAToB ? userTokenBAccount.address : userTokenAAccount.address,
      //     pool_from_account: isAToB ? POOL_TOKEN_A_ACCOUNT : POOL_TOKEN_B_ACCOUNT,
      //     pool_to_account: isAToB ? POOL_TOKEN_B_ACCOUNT : POOL_TOKEN_A_ACCOUNT,
      //     owner: owner.publicKey,
      //     token_program: TOKEN_PROGRAM_ID,
      //   },
      //   signers: [], // Wallet signs via Phantom
      // });


    //   // Create a fresh provider with Phantom wallet
    // const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    // const programWithProvider = new anchor.Program(idl, new anchor.web3.PublicKey('4mALzdJAdAAkTsB4vsvVo1GjHpxFJEbFz5Bp8vtUStzy'), provider);

    // await programWithProvider.rpc.swap(amount, {
    //   accounts: {
    //     swap_pool: SWAP_POOL_PUBKEY,
    //     user: wallet.publicKey,
    //     user_from_account: isAToB ? userTokenAAccount.address : userTokenBAccount.address,
    //     user_to_account: isAToB ? userTokenBAccount.address : userTokenAAccount.address,
    //     pool_from_account: isAToB ? POOL_TOKEN_A_ACCOUNT : POOL_TOKEN_B_ACCOUNT,
    //     pool_to_account: isAToB ? POOL_TOKEN_B_ACCOUNT : POOL_TOKEN_A_ACCOUNT,
    //     owner: owner.publicKey,
    //     token_program: TOKEN_PROGRAM_ID,
    //   },
    //   signers: [owner],
    // });


    const tx = new anchor.web3.Transaction();

    const instruction = await program.methods
      .swap(amount)
      .accounts({
        swap_pool: SWAP_POOL_PUBKEY,
        user: wallet.publicKey,
        user_from_account: isAToB ? userTokenAAccount.address : userTokenBAccount.address,
        user_to_account: isAToB ? userTokenBAccount.address : userTokenAAccount.address,
        pool_from_account: isAToB ? POOL_TOKEN_A_ACCOUNT : POOL_TOKEN_B_ACCOUNT,
        pool_to_account: isAToB ? POOL_TOKEN_B_ACCOUNT : POOL_TOKEN_A_ACCOUNT,
        owner: owner.publicKey,
        token_program: TOKEN_PROGRAM_ID,
      })
      .instruction();

    // Fix mutability for swap_pool (index 0)
    instruction.keys[0].isWritable = true;  // swap_pool must be mutable
    instruction.keys[1].isSigner = true;    // user must sign
    instruction.keys[2].isWritable = true;  // user_from_account must be mutable
    instruction.keys[3].isWritable = true;  // user_to_account must be mutable
    instruction.keys[4].isWritable = true;  // pool_from_account must be mutable
    instruction.keys[5].isWritable = true;  // pool_to_account must be mutable
    instruction.keys[6].isSigner = true;    // owner must sign

    console.log('Instruction accounts after fix:', instruction.keys.map((key, index) => ({
      index,
      pubkey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })));

    tx.add(instruction);
    console.log('Transaction prepared with instruction:', tx);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    console.log('Transaction updated with blockhash:', { blockhash, lastValidBlockHeight });

    console.log('Setting expected signers...');
    tx.signatures = [
      { signature: null, publicKey: wallet.publicKey },
      { signature: null, publicKey: owner.publicKey },
    ];
    console.log('Signatures initialized:', { signatures: tx.signatures.length });

    console.log('Signing transaction with owner...');
    tx.partialSign(owner);
    console.log('Owner signature added:', { signatures: tx.signatures.filter(s => s.signature !== null).length });

    console.log('Sending transaction to Phantom for signing...');
    const signedTx = await wallet.signTransaction(tx);
    console.log('Transaction signed by Phantom:', {
      signatures: signedTx.signatures.filter(s => s.signature !== null).length,
      feePayer: signedTx.feePayer?.toBase58(),
      recentBlockhash: signedTx.recentBlockhash,
    });

    console.log('Serializing signed transaction...');
    const serializedTx = signedTx.serialize();
    console.log('Serialized transaction length:', serializedTx.length);

    console.log('Sending serialized transaction to network...');
    const txId = await connection.sendRawTransaction(serializedTx, {
      skipPreflight: false,
      maxRetries: 5,
    });
    console.log('Transaction sent, txId:', txId);

    await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: txId });
      console.log('Swap RPC call completed');
  
      await updateBalances(userTokenAAccount.address, userTokenBAccount.address);
      console.log(`Swap ${direction} successful`);
      alert(`Swap ${direction} successful!`);
    } catch (error) {
      console.error('Swap error:', error);
      if (error instanceof anchor.web3.SendTransactionError) {
        console.error('Transaction logs:', error.logs);
      }
      alert('Swap failed: ' + (error.message || 'Unknown error'));
    }
  };

  const getWalletAddressDisplay = () => {
    if (!walletConnected || !wallet || !wallet.publicKey) {
      return 'Connect Wallet';
    }
    const address = wallet.publicKey.toBase58();
    return address ? `Connected: ${address.slice(0, 8)}...` : 'Connected: Unknown';
  };

  return (
    <div className="app-container">
      <h1>SPL Token Swap</h1>
  
      {/* Connect Wallet */}
      <button onClick={connectWallet} disabled={walletConnected}>
        {getWalletAddressDisplay()}
      </button>
  
      {/* Balances */}
      <h2>Balances</h2>
      <p>User Token A: {balances.userTokenA} tokens</p>
      <p>User Token B: {balances.userTokenB} tokens</p>
      <p>Pool Token A: {balances.poolTokenA} tokens</p>
      <p>Pool Token B: {balances.poolTokenB} tokens</p>
  
      {/* Faucet Buttons */}
      <h2>Faucet</h2>
      <button onClick={() => faucet('A')} disabled={!walletConnected}>
        Faucet Token A (100)
      </button>
      <button onClick={() => faucet('B')} disabled={!walletConnected}>
        Faucet Token B (100)
      </button>
  
      {/* Swap Buttons */}
      <h2>Swap</h2>
      <button onClick={() => swap('A-to-B')} disabled={!walletConnected}>
        Swap A to B (50)
      </button>
      <button onClick={() => swap('B-to-A')} disabled={!walletConnected}>
        Swap B to A (50)
      </button>
    </div>
  );
};

export default App;