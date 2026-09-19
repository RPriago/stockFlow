# Stage 1: Build binary
FROM golang:1.24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git ca-certificates

ENV GOPROXY=https://proxy.golang.org,direct
ENV CGO_ENABLED=0

# Cache Go modules
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build statically compiled binary
RUN GOOS=linux go build -ldflags="-w -s" -o /app/server cmd/api/main.go

# Stage 2: Minimal runtime image
FROM alpine:3.21

WORKDIR /app

RUN apk --no-cache add ca-certificates tzdata

COPY --from=builder /app/server /app/server

EXPOSE 8080

CMD ["/app/server"]

