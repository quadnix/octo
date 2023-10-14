FROM docker:stable-dind

# Installing:
# ===========
# GNU Make 4.3
# node: 12.22.6
# npm: 8.1.3
# yarn: 1.22.17
# python3: 3.8.10
# pip3: 21.1.1
# docker: 19.03.14
# docker-compose: 1.25.4
# aws-cli: 1.22.5

# Dependencies:
# =============
# node-gyp NodeJS package => g++

RUN apk update && \
    apk add make --no-cache && \
    apk add nodejs --no-cache && \
    apk add npm --no-cache && \
    npm install -g npm && \
    npm install -g yarn && \
    apk add docker-compose g++ --no-cache && \
    python3 -m ensurepip --upgrade && \
    pip3 install awscli --upgrade --user && \
    rm -rf /var/cache/apk/*

ENV AWS /root/.local/bin/aws
