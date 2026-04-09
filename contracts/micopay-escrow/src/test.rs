#![cfg(test)]

extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token, Address, Bytes, BytesN, Env,
};

struct TestEnv {
    env: Env,
    contract_id: Address,
    admin: Address,
    seller: Address,
    buyer: Address,
    platform_wallet: Address,
    token_id: Address,
}

impl TestEnv {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let seller = Address::generate(&env);
        let buyer = Address::generate(&env);
        let platform_wallet = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = sac.address();
        let token_admin = token::StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&seller, &100_000_000_000);

        let contract_id = env.register_contract(None, EscrowFactory);
        let escrow = EscrowFactoryClient::new(&env, &contract_id);
        escrow.initialize(&admin, &token_id, &platform_wallet);

        TestEnv { env, contract_id, admin, seller, buyer, platform_wallet, token_id }
    }

    fn make_secret(&self) -> (Bytes, BytesN<32>) {
        let secret = Bytes::from_slice(&self.env, b"test_secret_32_bytes_long_pad__!!");
        let hash: BytesN<32> = self.env.crypto().sha256(&secret).into();
        (secret, hash)
    }

    fn escrow(&self) -> EscrowFactoryClient {
        EscrowFactoryClient::new(&self.env, &self.contract_id)
    }

    fn token(&self) -> token::Client {
        token::Client::new(&self.env, &self.token_id)
    }
}

#[test]
fn test_lock_and_release() {
    let t = TestEnv::new();
    let escrow = t.escrow();
    let token = t.token();

    let (secret, secret_hash) = t.make_secret();
    let amount: i128 = 1_500_000_000;
    let platform_fee: i128 = 12_000_000;

    let seller_balance_before = token.balance(&t.seller);

    let trade_id = escrow.lock(&t.seller, &t.buyer, &amount, &platform_fee, &secret_hash, &30u32);

    assert_eq!(token.balance(&t.seller), seller_balance_before - amount - platform_fee);

    let trade = escrow.get_trade(&trade_id);
    assert_eq!(trade.status, TradeStatus::Locked);
    assert_eq!(trade.amount, amount);

    escrow.release(&trade_id, &secret);

    assert_eq!(token.balance(&t.buyer), amount);
    assert_eq!(token.balance(&t.platform_wallet), platform_fee);
    assert_eq!(escrow.get_trade(&trade_id).status, TradeStatus::Released);
}

#[test]
fn test_refund_after_timeout() {
    let t = TestEnv::new();
    let escrow = t.escrow();
    let token = t.token();

    let (_, secret_hash) = t.make_secret();
    let amount: i128 = 1_500_000_000;
    let platform_fee: i128 = 12_000_000;

    let seller_balance_before = token.balance(&t.seller);

    let trade_id = escrow.lock(&t.seller, &t.buyer, &amount, &platform_fee, &secret_hash, &1u32);

    let current = t.env.ledger().get();
    t.env.ledger().set(LedgerInfo {
        timestamp: current.timestamp + 120,
        sequence_number: current.sequence_number + 20,
        ..current
    });

    escrow.refund(&trade_id);

    assert_eq!(token.balance(&t.seller), seller_balance_before);
    assert_eq!(escrow.get_trade(&trade_id).status, TradeStatus::Refunded);
}

#[test]
#[should_panic]
fn test_release_wrong_secret() {
    let t = TestEnv::new();
    let escrow = t.escrow();
    let (_, secret_hash) = t.make_secret();

    let trade_id = escrow.lock(&t.seller, &t.buyer, &1_000_000_000i128, &0i128, &secret_hash, &30u32);

    let wrong = Bytes::from_slice(&t.env, b"wrong_secret_not_matching_hash!!");
    escrow.release(&trade_id, &wrong);
}

#[test]
#[should_panic]
fn test_refund_before_timeout() {
    let t = TestEnv::new();
    let escrow = t.escrow();
    let (_, secret_hash) = t.make_secret();

    let trade_id = escrow.lock(&t.seller, &t.buyer, &1_000_000_000i128, &0i128, &secret_hash, &30u32);
    escrow.refund(&trade_id);
}

#[test]
fn test_double_initialize_fails() {
    let t = TestEnv::new();
    let escrow = t.escrow();

    let result = escrow.try_initialize(&t.admin, &t.token_id, &t.platform_wallet);
    assert!(result.is_err());
}
