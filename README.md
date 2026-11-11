# stripe-payment-BE

Express + MongoDB backend that sells time on GPU listings through Stripe Checkout. GPU hosts register a GPU via a signed (JWT) link, buyers pay through a Stripe Checkout session, and a Stripe webhook marks the payment as successful and the GPU as taken. After payment, the frontend can fetch the GPU access key.

## Features

- Create a Stripe product, price and Checkout session per purchase, storing a `pending` payment record in MongoDB.
- Stripe webhook (`checkout.session.completed`) that marks the payment `success` and sets the linked GPU's `status` to `success` and `isActive` to `false`.
- Payment status lookup that returns the GPU `key` once the payment has succeeded.
- GPU registration from a JWT-signed key carrying the access key and rental time.
- Record peer connection times against a GPU.

## Tech stack

- Node.js (CommonJS), Express 4
- MongoDB via Mongoose 8
- Stripe Node SDK
- `jsonwebtoken`, `uuid`, `cors`, `nodemon`

## Getting started

Prerequisites: Node.js and a MongoDB instance reachable at the connection string configured in `index.js` (local MongoDB, database `payments`).

```bash
npm install
npm start        # runs: nodemon index.js
```

The server listens on port `8282` (hard-coded).

To receive webhooks locally you can forward Stripe events to `http://localhost:8282/webhook` with the Stripe CLI (`stripe listen --forward-to localhost:8282/webhook`). The repository also contains a binary named `stripe` at the root, which appears to be a Stripe CLI build (needs confirmation).

## Configuration

This project currently does **not** read any environment variables (`dotenv` is installed but unused). The following are hard-coded in `index.js` and should be moved to environment variables before any real deployment:

- Stripe secret API key
- Stripe webhook signing secret
- JWT secret used to verify GPU registration keys
- MongoDB connection string
- Server port (`8282`)
- Frontend URLs used for Checkout success/cancel redirects and the add-GPU link (local development URLs)

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Health check text. |
| POST | `/webhook` | Stripe webhook endpoint (raw body, signature verified). Handles `checkout.session.completed`. |
| POST | `/create-payment-intent` | Body: `productData`, `priceData` (Stripe product/price params), `gpuId`. Creates a Checkout session and returns `checkoutUrl`. |
| GET | `/status/:paymentId` | Returns `{ isPaid: false }` or, once paid, `{ isPaid, objectId, key, id }`. |
| GET | `/payment/:id` | Payment record by `paymentId`. |
| GET | `/gpus` | All GPU listings. |
| POST | `/add-gpu` | Body: `hexcode` (JWT). Verifies it and returns the frontend URL for registering a GPU. |
| POST | `/add-gpus/:key` | `key` is a JWT containing `key` and `timeInSeconds`. Body: `host`, `gpu`, `vcpu`, `ram`, `network`, `storage`, `price`. Creates a GPU listing. |
| POST | `/gpus/:id/connection-time` | `id` is the GPU's MongoDB `_id`. Body: `peerId`, `connectionTime`. |

## Notes

- There are no tests; `npm test` is the default npm placeholder and exits with an error.
- `node_modules/` is committed to the repository.
