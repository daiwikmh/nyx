#!/usr/bin/env bash
# Nyx CLOB — build script
# Usage: ./build.sh [--sol-only | --rust-only]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CONTRACT_DIR="$ROOT/contract"
ENGINE_DIR="$ROOT/engine"

RUST_TARGET="riscv64emac-unknown-none-polkavm"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[build]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

BUILD_SOL=true
BUILD_RUST=true
case "${1:-}" in
  --sol-only)  BUILD_RUST=false ;;
  --rust-only) BUILD_SOL=false  ;;
esac

# ── 1. Run Rust unit tests (always, unless --sol-only) ────────────────────────
if $BUILD_RUST; then
  info "Running engine unit tests on host..."
  cd "$ENGINE_DIR"
  cargo test
  info "All tests passed."
fi

# ── 2. Solidity → PVM  (resolc via @parity/hardhat-polkadot) ─────────────────
if $BUILD_SOL; then
  info "Compiling Solidity contracts with resolc (PVM target)..."
  cd "$CONTRACT_DIR"
  npx hardhat compile
  info "Solidity build complete. Artifacts → $CONTRACT_DIR/artifacts/"
fi

# ── 3. Rust engine → .polkavm blob ───────────────────────────────────────────
if $BUILD_RUST; then
  info "Building Rust engine for target $RUST_TARGET..."

  cd "$ENGINE_DIR"
  RUST_TARGET_PATH="$ENGINE_DIR" cargo +nightly build --release \
    --target "$RUST_TARGET" \
    -Z build-std=core,alloc \
    -Z build-std-features=compiler-builtins-mem

  ELF="$ENGINE_DIR/target/$RUST_TARGET/release/shadow_warden_engine.elf"
  [ -f "$ELF" ] || error "ELF not found at $ELF after cargo build."

  command -v polkatool >/dev/null 2>&1 \
    || error "'polkatool' not found. Install: cargo install polkatool"

  BLOB="$ENGINE_DIR/engine.polkavm"
  polkatool link "$ELF" -o "$BLOB"

  info "Engine blob → $BLOB ($(wc -c < "$BLOB") bytes)"
  echo ""
  warn "NEXT STEPS:"
  warn "  1. Upload $BLOB to the chain."
  warn "  2. Note the instantiation address."
  warn "  3. Call: WardenCLOB.setEngine(<instantiation address>)"
fi

echo ""
info "Nyx CLOB build complete."
