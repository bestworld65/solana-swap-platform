use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("4mALzdJAdAAkTsB4vsvVo1GjHpxFJEbFz5Bp8vtUStzy"); // Replace with your program ID

#[program]
pub mod swap_contract {
    use super::*;

    // Initialize the swap pool
    pub fn initialize(
        ctx: Context<Initialize>,
    ) -> Result<()> {
        let swap_pool = &mut ctx.accounts.swap_pool;
        swap_pool.token_a_mint = ctx.accounts.token_a_mint.key();
        swap_pool.token_b_mint = ctx.accounts.token_b_mint.key();
        swap_pool.token_a_account = ctx.accounts.token_a_account.key();
        swap_pool.token_b_account = ctx.accounts.token_b_account.key();
        swap_pool.owner = ctx.accounts.owner.key();
        Ok(())
    }

    // Faucet tokens to user
    pub fn faucet(
        ctx: Context<Faucet>,
        amount: u64,
    ) -> Result<()> {
        let cpi_accounts = Transfer {
            from: ctx.accounts.pool_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;
        Ok(())
    }

    // Swap tokens
    pub fn swap(
        ctx: Context<Swap>,
        amount: u64,
    ) -> Result<()> {
        // Transfer from user to pool (send TokenA or TokenB)
        let cpi_accounts_from = Transfer {
            from: ctx.accounts.user_from_account.to_account_info(),
            to: ctx.accounts.pool_from_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx_from = CpiContext::new(cpi_program.clone(), cpi_accounts_from);
        token::transfer(cpi_ctx_from, amount)?;

        // Transfer from pool to user (send the other token)
        let cpi_accounts_to = Transfer {
            from: ctx.accounts.pool_to_account.to_account_info(),
            to: ctx.accounts.user_to_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_ctx_to = CpiContext::new(cpi_program, cpi_accounts_to);
        token::transfer(cpi_ctx_to, amount)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = owner, space = 8 + 32 * 5)]
    pub swap_pool: Account<'info, SwapPool>,

    pub token_a_mint: Account<'info, Mint>,
    pub token_b_mint: Account<'info, Mint>,

    pub token_a_account: Account<'info, TokenAccount>,
    pub token_b_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Faucet<'info> {
    #[account(mut)]
    pub swap_pool: Account<'info, SwapPool>,

    #[account(mut)]
    pub pool_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub swap_pool: Account<'info, SwapPool>,

    #[account(signer)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub user_from_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_to_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub pool_from_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub pool_to_account: Account<'info, TokenAccount>,

    #[account(signer)]
    pub owner: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[account]
pub struct SwapPool {
    pub token_a_mint: Pubkey,
    pub token_b_mint: Pubkey,
    pub token_a_account: Pubkey,
    pub token_b_account: Pubkey,
    pub owner: Pubkey,
}
