FROM denoland/deno:alpine

RUN apk add --no-cache dcron tzdata

WORKDIR /app

COPY deno.json deno.lock ./
COPY gfwlist2pac.ts .

RUN deno cache gfwlist2pac.ts

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
