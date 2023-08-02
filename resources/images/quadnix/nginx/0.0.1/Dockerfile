FROM quadnix/ppimg:latest

# Installing:
# ===========
# node: 18.12.0
# npm: 8.19.2
# yarn: 1.22.19
# nginx: 1.22.1
# consul-template: 0.30.0

ARG IMAGE_NAME
ENV IMAGE_NAME=$IMAGE_NAME

RUN apk update && \
    apk add nginx --no-cache && \
    apk add consul-template --repository=http://dl-cdn.alpinelinux.org/alpine/edge/community --allow-untrusted --no-cache && \
    mkdir -p /run/nginx /consul-templates && \
    rm -rf /var/cache/apk/*

COPY run.template /consul-templates

WORKDIR /server
EXPOSE 61234
ENTRYPOINT ["npm", "run", "start:prod"]
