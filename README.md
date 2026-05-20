# Forever Memories — Production-Style Local Build

This version moves the MVP closer to production while still running locally. It includes a guided pastel UI, recipient photo upload, human-face validation, table-of-contents regeneration limits, cover regeneration, paperback/hardcover selection, Stripe checkout support, Lulu sandbox helpers, and full-wrap cover PDF generation.


## New in this update: personalized dynamic book titles

The book title is no longer generic. Every generated title now changes based on:

- selected genre
- recipient name
- relationship
- occasion
- selected tone
- the personal answers supplied by the customer

For example, two customers who both choose Adventure will still get different titles if their memories, themes, places, or personality words are different. Regenerating the table of contents can also produce a new title variation, while still staying connected to the same customer information.

## What is new in this version

1. **Human photo requirement**
   - The recipient must upload a JPG, PNG, or WebP image.
   - The browser tries to detect exactly one human face before upload.
   - The backend can enforce strict server-side face detection using AWS Rekognition by setting `FACE_DETECTION_PROVIDER=aws-rekognition`.
   - Local default is `local-preview` so non-developers can test without AWS setup. Browser face detection is used as a helpful preview only, not as a strict blocker.

2. **Production-style cover generation**
   - The generated cover is now a single full-wrap PDF with:
     - back cover
     - spine
     - front cover
     - barcode placeholder area
     - genre/theme-based pastel design
     - uploaded recipient photo
   - The app calls Lulu’s `/cover-dimensions/` endpoint when sandbox credentials are configured.
   - When Lulu is not configured, the app uses a local fallback based on trim size, page count, bleed, binding, and estimated spine width.

3. **Cover preview before checkout**
   - The customer can view the generated full cover inside the UI before checkout.
   - The “Regenerate cover” button creates a new cover version using the selected genre/theme.

4. **Table of contents regeneration**
   - The customer can generate/regenerate the table of contents up to 3 times.
   - The limit is enforced in the frontend and backend.

5. **Paperback and hardcover options**
   - The checkout step supports both paperback and hardcover pricing.
   - Each format has its own Lulu package ID field in `.env`.

6. **Lulu sandbox-ready flow**
   - The app has endpoints for cover dimensions, file validation, shipping options, cost calculation, and print-job creation.
   - Lulu still requires public HTTPS URLs for cover and interior files. Localhost files are not enough for real sandbox validation or print-job tests. Use ngrok or Cloudflare Tunnel when you want Lulu to download your PDFs.

## Important security note

Do not hardcode Lulu, Stripe, AWS, or any other API keys inside the app files. Put them inside `.env` only. Never upload `.env` to GitHub or send it to a client unless you intentionally want them to have access.

The Lulu keys you shared should be rotated before real production use because they were pasted into a chat. For local sandbox testing, paste the sandbox `Basic ...` value into your own `.env` file.

## How to run locally

1. Unzip the project.
2. Open the folder in VS Code or Command Prompt.
3. Create a `.env` file by copying `.env.example`.
4. Install dependencies:

```bash
npm install
```

5. Start the local server:

```bash
npm start
```

6. Open this in your browser:

```text
http://localhost:4242
```

## Where to paste Lulu sandbox keys

Open your `.env` file and add:

```text
LULU_BASIC_AUTH=Basic YOUR_SANDBOX_BASE64_KEY_HERE
LULU_TOKEN_URL=https://api.sandbox.lulu.com/auth/realms/glasstree/protocol/openid-connect/token
LULU_BASE_URL=https://api.sandbox.lulu.com
LULU_CONTACT_EMAIL=your-email@example.com
```

Keep the app in sandbox until you have tested file generation, validation, shipping cost, payment flow, and print-job creation.

## How to test real Lulu sandbox file validation

Lulu needs to download the cover and interior PDFs from public URLs. Your local URL, such as `http://localhost:4242/uploads/file.pdf`, will not work for Lulu.

Use a tunnel:

```bash
ngrok http 4242
```

Then copy the HTTPS ngrok URL into `.env`:

```text
APP_URL=https://your-ngrok-url.ngrok-free.app
PUBLIC_FILE_BASE_URL=https://your-ngrok-url.ngrok-free.app/uploads
```

Restart the app after changing `.env`.

## How to turn on stronger production face detection

For real production, use server-side face detection, not only browser detection.

Set this in `.env`:

```text
FACE_DETECTION_PROVIDER=aws-rekognition
AWS_REGION=us-east-1
MINIMUM_FACE_CONFIDENCE=90
```

Then configure AWS credentials on the server through environment variables, IAM role, or your hosting provider’s secrets manager. The app will reject images unless one confident human face is detected.

## Current production gaps still needing final build-out

This is a strong production-style starter, but before launch you should still add:

- Real AI text generation for full manuscript pages, not only a 160-page placeholder interior.
- Proper user accounts or guest-order tracking.
- Admin panel for discount code management.
- Stripe webhook verification for final payment confirmation.
- Lulu webhook handling for print-job status updates.
- Proper PDF proofing workflow before sending anything to print.
- Final legal pages: terms, privacy, refund policy, print disclaimer.
- Cloud file storage such as S3 for production PDF hosting.
- CDN and image moderation if the product becomes public.

## Main files

- `client/index.html` — main UI
- `client/app.js` — interactive flow, face check, regeneration, checkout calls
- `server/server.js` — backend API
- `server/services/pdfBuilder.js` — interior and full-wrap cover generation
- `server/services/lulu.js` — Lulu sandbox helpers
- `server/services/faceDetection.js` — local/browser-assisted and AWS Rekognition face checks
- `server/data/discounts.json` — test discount codes


## Face detection note for local testing

The local default is now `FACE_DETECTION_PROVIDER=local-preview`, and development mode uses a non-blocking upload path. This avoids false rejections from Chrome's experimental `FaceDetector` API. The upload is still limited to image files and size limits, and the app records whether the browser confirmed a face. Before launch, switch to `FACE_DETECTION_PROVIDER=aws-rekognition` and add AWS credentials so the server can strictly reject non-human or unclear images.

## Version 2.2 additions

This version adds several production-style features requested after the dynamic-title build.

### Customer-selected title and editable TOC

Customers can now enter a preferred book title and subtitle before generating the table of contents. After the TOC is generated, they can edit the final title, subtitle, chapter titles, and chapter summaries before creating the cover or checkout order.

### Story/resume upload flow

The top navigation includes a Story/Resume Upload option. Customers can upload a TXT, MD, PDF, DOC, or DOCX file. TXT and MD files are read locally and used for TOC generation. PDF/DOC/DOCX files are stored with the order for internal review. For best local testing, paste the resume or story text into the notes field as well.

### Internal order notifications

When an order is created, the system sends the order details, TOC, billing/shipping details, future-service preferences, and generated file URLs to the admin email if SMTP is configured.

If SMTP is not configured, the notification is saved locally here:

```text
server/data/notifications.json
```

Add these values to `.env` when you are ready to test real email delivery:

```env
ADMIN_NOTIFICATION_EMAIL=orders@yourdomain.com
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=Forever Memories <orders@yourdomain.com>
```

### Future-service questions before checkout

Before checkout, the customer can indicate whether they may want:

- Book promotion in the future
- Another book ghostwritten
- Publishing support

These preferences are stored in the order and included in the internal notification.

### Terms and privacy checkbox

Checkout is blocked unless the customer checks the Terms and Conditions and Privacy Policy consent box. The included terms and privacy pages are placeholders and should be replaced with final lawyer-reviewed pages before launch.

### Admin panel

Open the admin panel locally at:

```text
http://localhost:4242/admin.html
```

The default local admin key is:

```text
local-admin
```

Change it in `.env` before hosting:

```env
ADMIN_KEY=use-a-long-private-key-here
```

The admin panel lets you:

- See total order history
- See basic order counts and revenue totals
- Review customer title, genre, format, future-service interests, and status
- Add new discount codes
- Activate or deactivate discount codes
- Create up to 100% discount codes

### Cover graphics

Covers now include extra genre-based graphic patterns and selectable themes. The theme is used during final cover generation along with the selected genre, recipient photo, title, subtitle, spine, trim, and Lulu cover-dimension settings.



## New cover editor and admin login notes

### Cover customization
The production-style local build now generates covers from the selected title, genre, answers, theme, and cover settings. Customers can adjust:

- Primary, secondary, and accent colors
- Recipient image size
- Recipient image left/right and up/down placement
- Title left/right and up/down placement
- Title alignment
- Abstract art density
- Cover theme and AI cover mode

The generated Lulu-style cover PDF includes a front cover, spine, and back cover. The back cover includes abstract art generated locally from the title, genre, and customer details.

### AI image generation integration
Local testing uses built-in vector art so the app works without external AI costs. The project also includes an AI cover prompt builder in:

```text
server/services/aiCoverArt.js
```

You can later choose a provider in `.env`:

```env
AI_COVER_PROVIDER=openai
OPENAI_API_KEY=your_key_here
```

or:

```env
AI_COVER_PROVIDER=replicate
REPLICATE_API_TOKEN=your_key_here
```

or:

```env
AI_COVER_PROVIDER=stability
STABILITY_API_KEY=your_key_here
```

The current version prepares the prompt and provider hooks. Before going live, connect the selected provider's image endpoint and store the generated image asset for use in the cover PDF.

### Admin login
The admin panel is now protected by username and password.

Local default:

```text
Username: admin
Password: admin
```

Open:

```text
http://localhost:4242/admin.html
```

After logging in, use **Change admin login** to update the username and password. Before hosting, set a strong value for:

```env
ADMIN_SESSION_SECRET=change-this-to-a-long-random-secret-before-hosting
```

The admin credential hash is stored locally in:

```text
server/data/admin.json
```

Do not commit `.env` or private production credentials to GitHub.


## Cover preview path fix

This build saves generated cover and interior PDFs directly into `server/uploads`, which is the folder served publicly at `/uploads`. This fixes the earlier `Cannot GET /uploads/...cover-v2.pdf` issue.

After replacing the folder, run:

```bash
npm install
npm start
```

Then regenerate the cover preview from the website.
