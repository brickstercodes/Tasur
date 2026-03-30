# ── Build stage ───────────────────────────────────────────────────────────────
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy go.mod and go.sum first for layer caching
COPY go.mod go.sum* ./
RUN go mod download

# Copy source and embedded assets
COPY . .

# Build a statically linked binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /pipeline .

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM alpine:3.20

# ca-certificates needed for HTTPS calls to Vertex AI and Supabase
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /pipeline /app/pipeline

# Railway injects PORT automatically
ENV PORT=8080

EXPOSE 8080

ENTRYPOINT ["/app/pipeline"]
