# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Tầng dev: docker-compose.dev.yml trỏ build.target vào đây. Tách bằng
# target thay vì đổi `image` ở override, vì Compose không bỏ được `build`
# của service gốc — đặt `image` chồng lên sẽ build nhầm ảnh nginx rồi chạy
# npm trong đó.
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM deps AS build
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
