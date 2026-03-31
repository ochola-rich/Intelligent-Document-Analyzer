FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod ./
COPY main.go ./

RUN go build -o api-gateway .

FROM alpine:3.22

WORKDIR /app

COPY --from=builder /app/api-gateway /usr/local/bin/api-gateway

EXPOSE 8080

CMD ["api-gateway"]
