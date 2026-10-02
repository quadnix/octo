# The function this template runs: a plain HTTP server. The Lambda Web Adapter turns each invocation
# into an HTTP request to it, so the same image would run anywhere a container does. Both images come
# from ECR Public, so the build is not rate limited by Docker Hub.
FROM public.ecr.aws/docker/library/node:22-alpine

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

WORKDIR /app
COPY server.mjs .

ENV PORT=8080
CMD ["node", "server.mjs"]
