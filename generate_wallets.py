#!/usr/bin/env python3
"""Generate local mainnet receiving wallets; stdout contains ONLY public addresses.

Setup: python3 -m venv .venv
       .venv/bin/pip install embit==0.8.0 eth-account==0.13.7 solders==0.26.0
Run:   .venv/bin/python generate_wallets.py

Secrets are stored outside the website/repository in
~/.local/share/sincoin/wallets/activation.wallet-private.json (unencrypted,
owner-only permissions). Back this file up securely before accepting payments.
Existing wallets are reused and validated, never silently replaced.
Copy public addresses into index.html manually; this is not a payment verifier.
"""

import json
import os
from pathlib import Path
import secrets

from embit import ec, networks, script
from eth_account import Account
from solders.keypair import Keypair

WALLET_DIR = Path.home() / '.local/share/sincoin/wallets'
WALLET_FILE = WALLET_DIR / 'activation.wallet-private.json'


def public_addresses(wallet):
    """Reconstruct addresses from importable secrets without displaying secrets."""
    bitcoin = ec.PrivateKey.from_wif(wallet['bitcoin_wif'])
    ethereum = Account.from_key(wallet['ethereum_private_key'])
    solana = Keypair.from_bytes(bytes(wallet['solana_keypair']))
    return {
        'bitcoin': script.p2wpkh(bitcoin.get_public_key()).address(networks.NETWORKS['main']),
        'ethereum': ethereum.address,
        'solana': str(solana.pubkey()),
    }


def main():
    os.umask(0o077)
    WALLET_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    if WALLET_DIR.is_symlink() or WALLET_FILE.is_symlink():
        raise SystemExit('Refusing a symlink wallet directory or file.')
    WALLET_DIR.chmod(0o700)
    # Reuse existing keys so published receiving addresses remain valid.
    if not WALLET_FILE.exists():
        bitcoin = ec.PrivateKey(secrets.token_bytes(32))
        ethereum = Account.create()
        solana = Keypair()
        wallet = {
            'version': 1,
            'bitcoin_wif': bitcoin.wif(networks.NETWORKS['main']),
            'ethereum_private_key': '0x' + bytes(ethereum.key).hex(),
            'solana_keypair': list(bytes(solana)),
        }
        wallet['addresses'] = public_addresses(wallet)
        # Exclusive creation prevents overwriting keys, including concurrent runs.
        with WALLET_FILE.open('x', encoding='utf-8') as output:
            json.dump(wallet, output, indent=2)
            output.write('\n')
            output.flush()
            os.fsync(output.fileno())
    WALLET_FILE.chmod(0o600)
    wallet = json.loads(WALLET_FILE.read_text(encoding='utf-8'))
    addresses = public_addresses(wallet)
    if wallet.get('version') != 1 or wallet.get('addresses') != addresses:
        raise SystemExit('Wallet validation failed; existing file preserved.')
    print(json.dumps(addresses, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Library errors can contain key material: do not print exception details.
        raise SystemExit('Wallet operation failed; inspect local setup without sharing secrets.') from None
