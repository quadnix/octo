# The functions this template runs: plain HTTP servers, one per file, each deployment choosing its file
# by command. The Lambda Web Adapter turns each invocation into an HTTP request to it, so the same image
# would run anywhere a container does. Both images come from ECR Public, so the build is not rate
# limited by Docker Hub. `aws4` signs the greeter's calls to AWS.
FROM public.ecr.aws/docker/library/node:22-alpine

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

WORKDIR /app
RUN npm install --no-save aws4@1.13.2
COPY greeter.mjs private.mjs streamer.mjs ./

ENV PORT=8080
CMD ["node", "greeter.mjs"]
