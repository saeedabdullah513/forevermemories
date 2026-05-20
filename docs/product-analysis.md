# Product Analysis: Forever Memories vs Book By Anyone

## BookByAnyone observed flow

Public pages position the product as personalized printed books where the customer shares a few details, the system generates the book title, story or table of contents, lets the customer customize title/cover/theme, and then prints and ships the result. The public site emphasizes fiction, nonfiction, comics, bookmarks, free shipping, high-quality print, satisfaction guarantee, customer reviews, and order tracking.

## Forever Memories differentiation

Forever Memories should avoid copying the exact visual structure. The MVP uses a softer, more immersive guided journey:

1. Genre selection
2. Recipient profile
3. Story memory questions
4. Table of contents preview
5. Checkout, discounts, and print fulfillment

## MVP assumptions

- Estimated book length: 160 pages
- Default print format: 6 x 9 black-and-white paperback
- Default Lulu package ID: `0600X0900.BW.STD.PB.060UW444.MXX`
- Local mode generates placeholder PDFs for workflow testing
- Real production needs a full manuscript generation pipeline and print-ready PDFs

## Suggested question bank

- What are three words that describe the recipient?
- What memory should the story include?
- What challenge, dream, or theme should shape the book?
- Which places, people, or inside jokes should appear?
- Should the tone be funny, emotional, inspiring, romantic, or premium?
- Are there any subjects to avoid?

## Production architecture

Frontend: guided book builder and checkout UI
Backend: order creation, AI generation, PDF generation, payment, discounts, Lulu fulfillment, webhooks
Database: users, orders, inputs, generated books, payments, discounts, Lulu jobs
Storage: generated manuscript PDFs and cover PDFs
Integrations: OpenAI or another LLM, Stripe, Lulu Print API, transactional email
