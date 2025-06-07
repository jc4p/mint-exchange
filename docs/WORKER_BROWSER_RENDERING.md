---
title: Deploy a Browser Rendering Worker · Browser Rendering docs
description: By following this guide, you will create a Worker that uses the Browser Rendering API to take screenshots from web pages. This is a common use case for browser automation.
lastUpdated: 2025-05-16T16:37:37.000Z
source_url:
  html: https://developers.cloudflare.com/browser-rendering/workers-binding-api/screenshots/
  md: https://developers.cloudflare.com/browser-rendering/workers-binding-api/screenshots/index.md
---

By following this guide, you will create a Worker that uses the Browser Rendering API to take screenshots from web pages. This is a common use case for browser automation.

1. Sign up for a [Cloudflare account](https://dash.cloudflare.com/sign-up/workers-and-pages).
2. Install [`Node.js`](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).

Node.js version manager

Use a Node version manager like [Volta](https://volta.sh/) or [nvm](https://github.com/nvm-sh/nvm) to avoid permission issues and change Node.js versions. [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/), discussed later in this guide, requires a Node version of `16.17.0` or later.

## 1. Create a Worker project

[Cloudflare Workers](https://developers.cloudflare.com/workers/) provides a serverless execution environment that allows you to create new applications or augment existing ones without configuring or maintaining infrastructure. Your Worker application is a container to interact with a headless browser to do actions, such as taking screenshots.

Create a new Worker project named `browser-worker` by running:

* npm

  ```sh
  npm create cloudflare@latest -- browser-worker
  ```

* yarn

  ```sh
  yarn create cloudflare browser-worker
  ```

* pnpm

  ```sh
  pnpm create cloudflare@latest browser-worker
  ```

For setup, select the following options:

* For *What would you like to start with?*, choose `Hello World Starter`.
* For *Which template would you like to use?*, choose `Worker only`.
* For *Which language do you want to use?*, choose `JavaScript / TypeScript`.
* For *Do you want to use git for version control?*, choose `Yes`.
* For *Do you want to deploy your application?*, choose `No` (we will be making some changes before deploying).

## 2. Install Puppeteer

In your `browser-worker` directory, install Cloudflare’s [fork of Puppeteer](https://developers.cloudflare.com/browser-rendering/platform/puppeteer/):

* npm

  ```sh
  npm i -D @cloudflare/puppeteer
  ```

* yarn

  ```sh
  yarn add -D @cloudflare/puppeteer
  ```

* pnpm

  ```sh
  pnpm add -D @cloudflare/puppeteer
  ```

## 3. Create a KV namespace

Browser Rendering can be used with other developer products. You might need a [relational database](https://developers.cloudflare.com/d1/), an [R2 bucket](https://developers.cloudflare.com/r2/) to archive your crawled pages and assets, a [Durable Object](https://developers.cloudflare.com/durable-objects/) to keep your browser instance alive and share it with multiple requests, or [Queues](https://developers.cloudflare.com/queues/) to handle your jobs asynchronous.

For the purpose of this guide, you are going to use a [KV store](https://developers.cloudflare.com/kv/concepts/kv-namespaces/) to cache your screenshots.

Create two namespaces, one for production, and one for development.

```sh
npx wrangler kv namespace create BROWSER_KV_DEMO
npx wrangler kv namespace create BROWSER_KV_DEMO --preview
```

Take note of the IDs for the next step.

## 4. Configure the Wrangler configuration file

Configure your `browser-worker` project's [Wrangler configuration file](https://developers.cloudflare.com/workers/wrangler/configuration/) by adding a browser [binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/) and a [Node.js compatibility flag](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#nodejs-compatibility-flag). Bindings allow your Workers to interact with resources on the Cloudflare developer platform. Your browser `binding` name is set by you, this guide uses the name `MYBROWSER`. Browser bindings allow for communication between a Worker and a headless browser which allows you to do actions such as taking a screenshot, generating a PDF and more.

Update your [Wrangler configuration file](https://developers.cloudflare.com/workers/wrangler/configuration/) with the Browser Rendering API binding and the KV namespaces you created:

* wrangler.jsonc

  ```jsonc
  {
    "name": "browser-worker",
    "main": "src/index.js",
    "compatibility_date": "2023-03-14",
    "compatibility_flags": [
      "nodejs_compat"
    ],
    "browser": {
      "binding": "MYBROWSER"
    },
    "kv_namespaces": [
      {
        "binding": "BROWSER_KV_DEMO",
        "id": "22cf855786094a88a6906f8edac425cd",
        "preview_id": "e1f8b68b68d24381b57071445f96e623"
      }
    ]
  }
  ```

* wrangler.toml

  ```toml
  name = "browser-worker"
  main = "src/index.js"
  compatibility_date = "2023-03-14"
  compatibility_flags = [ "nodejs_compat" ]


  browser = { binding = "MYBROWSER" }
  kv_namespaces = [
    { binding = "BROWSER_KV_DEMO", id = "22cf855786094a88a6906f8edac425cd", preview_id = "e1f8b68b68d24381b57071445f96e623" }
  ]
  ```

## 5. Code

* JavaScript

  Update `src/index.js` with your Worker code:

  ```js
  import puppeteer from "@cloudflare/puppeteer";


  export default {
    async fetch(request, env) {
      const { searchParams } = new URL(request.url);
      let url = searchParams.get("url");
      let img;
      if (url) {
        url = new URL(url).toString(); // normalize
        img = await env.BROWSER_KV_DEMO.get(url, { type: "arrayBuffer" });
        if (img === null) {
          const browser = await puppeteer.launch(env.MYBROWSER);
          const page = await browser.newPage();
          await page.goto(url);
          img = await page.screenshot();
          await env.BROWSER_KV_DEMO.put(url, img, {
            expirationTtl: 60 * 60 * 24,
          });
          await browser.close();
        }
        return new Response(img, {
          headers: {
            "content-type": "image/jpeg",
          },
        });
      } else {
        return new Response("Please add an ?url=https://example.com/ parameter");
      }
    },
  };
  ```

* TypeScript

  Update `src/index.ts` with your Worker code:

  ```ts
  import puppeteer from "@cloudflare/puppeteer";


  interface Env {
    MYBROWSER: Fetcher;
    BROWSER_KV_DEMO: KVNamespace;
  }


  export default {
    async fetch(request, env): Promise<Response> {
      const { searchParams } = new URL(request.url);
      let url = searchParams.get("url");
      let img: Buffer;
      if (url) {
        url = new URL(url).toString(); // normalize
        img = await env.BROWSER_KV_DEMO.get(url, { type: "arrayBuffer" });
        if (img === null) {
          const browser = await puppeteer.launch(env.MYBROWSER);
          const page = await browser.newPage();
          await page.goto(url);
          img = (await page.screenshot()) as Buffer;
          await env.BROWSER_KV_DEMO.put(url, img, {
            expirationTtl: 60 * 60 * 24,
          });
          await browser.close();
        }
        return new Response(img, {
          headers: {
            "content-type": "image/jpeg",
          },
        });
      } else {
        return new Response("Please add an ?url=https://example.com/ parameter");
      }
    },
  } satisfies ExportedHandler<Env>;
  ```

This Worker instantiates a browser using Puppeteer, opens a new page, navigates to what you put in the `"url"` parameter, takes a screenshot of the page, stores the screenshot in KV, closes the browser, and responds with the JPEG image of the screenshot.

If your Worker is running in production, it will store the screenshot to the production KV namespace. If you are running `wrangler dev`, it will store the screenshot to the dev KV namespace.

If the same `"url"` is requested again, it will use the cached version in KV instead, unless it expired.

## 6. Test

Run [`npx wrangler dev --remote`](https://developers.cloudflare.com/workers/wrangler/commands/#dev) to test your Worker remotely before deploying to Cloudflare's global network. Local mode support does not exist for Browser Rendering so `--remote` is required.

To test taking your first screenshot, go to the following URL:

`<LOCAL_HOST_URL>/?url=https://example.com`

## 7. Deploy

Run `npx wrangler deploy` to deploy your Worker to the Cloudflare global network.

To take your first screenshot, go to the following URL:

`<YOUR_WORKER>.<YOUR_SUBDOMAIN>.workers.dev/?url=https://example.com`

## Related resources

* Other [Puppeteer examples](https://github.com/cloudflare/puppeteer/tree/main/examples)

