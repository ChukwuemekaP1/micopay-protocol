#![cfg(test)]

extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token::{Client as TokenClient, StellarAssetClient},
    Bytes, Env,
};

fn setup_env() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let initiator = Address::generate(&env);
    let counterparty = Address::generate(&env);

    let token_id = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let token_admin = StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&initiator, &1_000_000_000);

    (env, initiator, counterparty, token_id)
}

fn make_secret(env: &Env) -> (Bytes, BytesN<32>) {
    let secret = Bytes::from_slice(env, b"super_secret_preimage_32bytes_xx");
    let hash: BytesN<32> = env.crypto().sha256(&secret).into();
    (secret, hash)
}

#[test]
fn test_lock_and_release() {
    let (env, initiator, counterparty, token_id) = setup_env();
    let contract_id = env.register_contract(None, AtomicSwapHTLC);
    let client = AtomicSwapHTLCClient::new(&env, &contract_id);

    let (secret, secret_hash) = make_secret(&env);
    let amount: i128 = 100_000_000;
    let timeout: u32 = MIN_TIMEOUT_LEDGERS + 100;

    let swap_id = client.lock(
        &initiator,
        &counterparty,
        &token_id,
        &amount,
        &secret_hash,
        &timeout,
    );

    let swap = client.get_swap(&swap_id);
    assert_eq!(swap.status, SwapStatus::Locked);
    assert_eq!(swap.amount, amount);

    let token_client = TokenClient::new(&env, &token_id);
    assert_eq!(token_client.balance(&contract_id), amount);

    client.release(&swap_id, &secret);

    let swap = client.get_swap(&swap_id);
    assert_eq!(swap.status, SwapStatus::Released);
    assert_eq!(token_client.balance(&counterparty), amount);
}

#[test]
#[should_panic]
fn test_timeout_too_short_rejected() {
    let (env, initiator, counterparty, token_id) = setup_env();
    let contract_id = env.register_contract(None, AtomicSwapHTLC);
    let client = AtomicSwapHTLCClient::new(&env, &contract_id);
    let (_, secret_hash) = make_secret(&env);

    client.lock(
        &initiator,
        &counterparty,
        &token_id,
        &100_000_000,
        &secret_hash,
        &10, // below MIN_TIMEOUT_LEDGERS
    );
}

#[test]
fn test_refund_after_timeout() {
    let (env, initiator, counterparty, token_id) = setup_env();
    let contract_id = env.register_contract(None, AtomicSwapHTLC);
    let client = AtomicSwapHTLCClient::new(&env, &contract_id);

    let (_, secret_hash) = make_secret(&env);
    let amount: i128 = 100_000_000;
    let timeout: u32 = MIN_TIMEOUT_LEDGERS;

    let token_client = TokenClient::new(&env, &token_id);
    let initial_balance = token_client.balance(&initiator);

    let swap_id = client.lock(
        &initiator,
        &counterparty,
        &token_id,
        &amount,
        &secret_hash,
        &timeout,
    );

    let current = env.ledger().get();
    env.ledger().set(LedgerInfo {
        timestamp: current.timestamp + 600,
        sequence_number: current.sequence_number + timeout + 1,
        ..current
    });

    client.refund(&swap_id);

    let swap = client.get_swap(&swap_id);
    assert_eq!(swap.status, SwapStatus::Refunded);
    assert_eq!(token_client.balance(&initiator), initial_balance);
}

#[test]
#[should_panic]
fn test_invalid_secret_rejected() {
    let (env, initiator, counterparty, token_id) = setup_env();
    let contract_id = env.register_contract(None, AtomicSwapHTLC);
    let client = AtomicSwapHTLCClient::new(&env, &contract_id);

    let (_, secret_hash) = make_secret(&env);
    let swap_id = client.lock(
        &initiator,
        &counterparty,
        &token_id,
        &100_000_000,
        &secret_hash,
        &MIN_TIMEOUT_LEDGERS,
    );

    let wrong_secret = Bytes::from_slice(&env, b"wrong_secret_wrong_secret_wrong!");
    client.release(&swap_id, &wrong_secret);
}
