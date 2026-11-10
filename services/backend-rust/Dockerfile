FROM rust:1-slim-bookworm AS builder
WORKDIR /app
# PR 038: disable -g3 DWARF bloat in C dependencies (cuts ring temp assembly in /tmp from ~13MB to <600KB)
# and cap build parallelism so CI runners do not exhaust RAM or /tmp during full builds.
ENV CFLAGS="-g0" \
    CARGO_BUILD_JOBS="2"

# Cache compiled dependencies separately from application sources.
COPY Cargo.toml Cargo.lock* ./
RUN mkdir -p src && printf 'fn main() {}\n' > src/main.rs \
    && cargo build --release --locked \
    && rm -rf src /usr/local/cargo/registry/cache

COPY src ./src
RUN rm -rf target/release/.fingerprint/backend-rust-* target/release/backend-rust* target/release/deps/backend_rust* \
    && touch src/main.rs \
    && cargo build --release --locked \
    && strip target/release/backend-rust

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/backend-rust /app/backend-rust
EXPOSE 8091
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=12 \
    CMD curl --fail --silent http://127.0.0.1:8091/health >/dev/null || exit 1
CMD ["/app/backend-rust"]
