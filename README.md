**🧩 PREREQUISITES**
Node.js & npm
MongoDB Atlas URI
Stripe API Key & Webhook Secret


**INSTALL NODE PACKAGES**
npm install

**RUN THE SERVER**
npm start

**EXPLANATION**
After running *peacock-BE* server, run this code file.

*Stripe Integration*
Create products and prices, initiate secure checkout sessions, and handle post-payment webhook events to update GPU availability.

*MongoDB Integration*
Stores payment and GPU metadata using Mongoose schemas.

*JWT Authentication*
Secure key-based flow to allow only verified providers to list GPUs.

*API Endpoints*
RESTful routes to manage GPUs, payments, connection history, and payment status.

