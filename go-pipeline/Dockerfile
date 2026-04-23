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

# ca-certificates: HTTPS calls to Vertex AI and Supabase
# libreoffice: PPTX → PDF conversion via `soffice --convert-to pdf`
# ttf-*: fallback fonts so converted slides don't render with boxes when the
#        author's fonts aren't embedded in the pptx
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    libreoffice \
    ttf-dejavu \
    ttf-liberation \
    font-noto

WORKDIR /app

COPY --from=builder /pipeline /app/pipeline

# Railway injects PORT automatically
ENV PORT=8080

EXPOSE 8080

ENTRYPOINT ["/app/pipeline"]
