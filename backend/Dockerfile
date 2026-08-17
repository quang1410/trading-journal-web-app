FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /out/api ./cmd/api

# distroless không có shell và không có /usr/share/zoneinfo — binary tự nhúng
# tzdata qua import _ "time/tzdata" trong cmd/api/main.go.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /api
EXPOSE 8000
USER nonroot:nonroot
ENTRYPOINT ["/api"]
