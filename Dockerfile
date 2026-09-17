# SEO Cursor — production image.
#
# Built on Playwright's own image rather than a plain node base. The crawler
# switches to a headless browser whenever a site renders client-side
# (src/lib/crawler/render.ts), and Chromium needs about thirty system libraries
# that no slim Node image ships. This image has them, and has the browsers
# preinstalled at /ms-playwright.
#
# The tag must track the `playwright` version in package.json exactly. Playwright
# refuses to drive a browser build it was not compiled against, and the failure
# surfaces as "Executable doesn't exist" at crawl time rather than at deploy
# time — so bump both together or not at all.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app

# Install against the lockfile first, so a source change does not re-run npm.
#
# .npmrc matters here: the MCP SDKs peer-depend on zod 4 while this project's
# own schemas are zod 3, and without the legacy-peer-deps setting the install
# fails outright. See the comment in that file.
COPY package.json package-lock.json .npmrc ./

# NODE_ENV is deliberately NOT set yet — `npm ci` skips devDependencies under
# production, and the build needs esbuild, Astro, TypeScript and the Prisma CLI.
RUN npm ci

# Prisma generates into node_modules/.prisma/client, so it has to run after the
# install and before the build. Generating inside the image is what makes the
# engine match this platform; a client generated on a developer's Mac and copied
# in would not run here.
COPY prisma ./prisma
RUN npx prisma generate

COPY . .

# Builds the MCP app views and the stdio binary, then the Astro server — see the
# `build` script. The views must exist in the image: the server reads them from
# disk at request time to serve the ui:// resources.
RUN npm run build

# Only now. Everything past this point is runtime.
ENV NODE_ENV=production

# The standalone adapter binds localhost unless told otherwise, and a container
# that only listens on localhost is unreachable from outside. Railway injects
# PORT; the adapter reads it, and 4330 is only the fallback for `docker run`.
ENV HOST=0.0.0.0
ENV PORT=4330
EXPOSE 4330

# Report what we actually built on, so a base-image bump that changes the Node
# version shows up in the deploy log instead of in a runtime error.
RUN node -v && npx playwright --version

CMD ["node", "./dist/server/entry.mjs"]
