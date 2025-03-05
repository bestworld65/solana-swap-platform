import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider } from '@project-serum/anchor';

export const connection = new Connection('https://api.devnet.solana.com');
export const programID = new PublicKey('2TGJnvg1fSS85j1Hoz3rjAjZvjSTHwjTBNJvmv8q5QRP');
export const tokenAMint = new PublicKey('HQ9JCtYL8NTfDrG87qs7UKbt1PyDBXE5aQahLmoj64gB');
export const tokenBMint = new PublicKey('ERPacwY61AKqykiLsrZmmEG4JW9JEJYReBx8xkVk3qkS');

export const getProvider = (wallet) =>
  new AnchorProvider(connection, wallet, { preflightCommitment: 'processed' });
