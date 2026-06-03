# RGPVMate — AI Assistant for RGPV Students

> An intelligent, context-aware chatbot built specifically for students of **Rajiv Gandhi Proudyogiki Vishwavidyalaya (RGPV)**, Bhopal. Ask it anything about your syllabus, subjects, past papers, or university notices.

[![CI](https://github.com/himanshulokhande26/RGPVMate/actions/workflows/ci.yml/badge.svg)](https://github.com/himanshulokhande26/RGPVMate/actions/workflows/ci.yml)

---

## ✨ What It Can Do

- 📚 **Syllabus** — Unit-wise breakdown for any RGPV subject by code (CS-601, EC-501, etc.)
- 📋 **Scheme Details** — Credits, contact hours, electives for any semester & branch
- 🧠 **Academic Concepts** — Definitions, explanations, code examples for engineering topics
- 📝 **Past Year Questions (PYQs)** — Retrieved and ranked by subject code
- 🏫 **University Notices** — Latest RGPV announcements scraped daily
- 💬 **Hinglish Support** — Responds in the student's language (English or Hinglish)

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Student's Browser                              │
│                        (Next.js Frontend)                               │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ REST API (JSON)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Express.js Backend  (Node.js)                       │
│                                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────────────────┐   │
│  │  Rate Limit  │   │ Auth (JWT +  │   │   Input Validation        │   │
│  │  20 req/min  │   │  OAuth 2.0)  │   │   (question, semester,    │   │
│  └──────────────┘   └──────────────┘   │    program, history)      │   │
│                                        └───────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      RAG Pipeline                               │   │
│  │                                                                 │   │
│  │  Question → Embed (384-dim) → Qdrant Search → Context Builder  │   │
│  │                                    ↓                           │   │
│  │              Groq (llama-3.3-70b) + Gemini Fallback            │   │
│  │                                    ↓                           │   │
│  │                    Grounded Answer + Sources                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└────────┬────────────────┬──────────────────┬───────────────────────────┘
         │                │                  │
         ▼                ▼                  ▼
  ┌─────────────┐  ┌────────────┐  ┌──────────────────┐
  │ MongoDB     │  │ Qdrant     │  │ Python Embedder  │
  │ Atlas       │  │ Cloud      │  │ (Flask +         │
  │ (users,     │  │ (4,000+    │  │  all-MiniLM-L6)  │
  │  threads,   │  │  chunks)   │  │                  │
  │  cache,     │  │            │  └──────────────────┘
  │  notices)   │  └────────────┘
  └─────────────┘
```

### How RAG Works (in plain English)
When a student asks a question, 4 things happen:
1. The question is converted into a 384-number vector by the Python embedder (captures meaning, not just keywords)
2. Qdrant finds the most semantically similar document chunks (syllabus, PYQs, notices)
3. Those chunks are injected as context into the LLM prompt
4. The LLM answers using only that retrieved context — not hallucinated training data

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14, React, CSS Modules |
| **Backend** | Node.js, Express.js |
| **Vector DB** | Qdrant Cloud (cosine similarity, 384-dim) |
| **Embeddings** | Python Flask + `all-MiniLM-L6-v2` (SentenceTransformers) |
| **LLM** | Groq API (`llama-3.3-70b-versatile`) + Google Gemini Flash (fallback) |
| **Database** | MongoDB Atlas (users, threads, messages, cache, notices) |
| **Auth** | JWT + bcrypt + Passport.js (Google OAuth, GitHub OAuth) |
| **Testing** | Jest + Supertest (30 tests, runs offline) |
| **CI/CD** | GitHub Actions |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Python 3.9+ (for the embedder)
- A Qdrant Cloud account (free tier works)
- A Groq API key (free tier)
- A MongoDB Atlas connection string

### 1. Clone the repository
```bash
git clone https://github.com/himanshulokhande26/RGPVMate.git
cd RGPVMate
```

### 2. Set up the Python Embedder
```bash
cd embedder
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux
pip install -r requirements.txt
python embed_service.py        # Runs on http://localhost:5000
```

### 3. Set up the Backend
```bash
cd backend
npm install
```

Create `backend/.env`:
```env
PORT=3000
FRONTEND_URL=http://localhost:3001

# MongoDB
MONGODB_URI=your_mongodb_atlas_connection_string

# Qdrant
QDRANT_URL=your_qdrant_cloud_url
QDRANT_API_KEY=your_qdrant_api_key

# LLM
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
GEMINI_API_KEY=your_gemini_api_key

# Auth
JWT_SECRET=your_strong_random_secret
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret

# Services
EMBEDDER_URL=http://localhost:5000
ADMIN_PASSWORD=your_admin_panel_password
```

```bash
npm run dev    # Starts on http://localhost:3000
```

### 4. Set up the Frontend
```bash
cd frontend
npm install
```

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

```bash
npm run dev    # Starts on http://localhost:3001
```

### 5. Run the test suite
```bash
cd backend
npm test       # All 30 tests run offline — no API keys needed
```

---

## 📡 API Reference

### `POST /api/chat`
Send a question to the AI assistant.

**Request Body:**
```json
{
  "question": "Explain CS-601 Machine Learning syllabus",
  "semester": 6,
  "branch": "Computer Science Engineering",
  "program": "B.Tech",
  "history": []
}
```

**Response:**
```json
{
  "answer": "## CS-601 Machine Learning\n\n...",
  "sources": ["rgpvnotes_cse_sem6_cs601.md"],
  "elapsedSeconds": 1.23,
  "fromCache": false
}
```

**Rate Limit:** 20 requests/minute per IP

---

### `POST /api/auth/register` — Register new user
### `POST /api/auth/login` — Login with email + password
### `GET /api/auth/me` — Get current user profile
### `GET /api/auth/google` — Start Google OAuth flow
### `GET /api/auth/github` — Start GitHub OAuth flow

---

### `GET /api/chat/threads` — List user's conversation threads *(auth required)*
### `GET /api/chat/threads/:id` — Get messages in a thread *(auth required)*
### `DELETE /api/chat/threads/:id` — Delete a thread *(auth required)*

---

### `GET /api/notices` — Get latest RGPV university notices
### `GET /health` — Service health check

---

## 🔒 Security

- All passwords hashed with **bcrypt** (12 salt rounds)
- JWTs expire — never stored in `localStorage` unsafely
- Rate limiting on chat (20/min) and auth (10/15min) endpoints
- Production error handler never exposes internal error messages
- Input validated server-side (question length, semester range, program allowlist)

---

## 📁 Project Structure

```
RGPVMate/
├── backend/
│   ├── routes/         # Express route handlers (chat, auth, admin, notices, threads)
│   ├── services/       # Business logic (llm, retriever, cache, chunker)
│   ├── models/         # Mongoose schemas (User, Thread, Message)
│   ├── middleware/     # Auth guards (requireAuth, optionalAuth, adminGuard)
│   ├── scripts/        # Data pipeline scripts (scrape, ingest, schedule)
│   ├── tests/          # Jest unit + integration tests
│   └── index.js        # Express app entry point
├── frontend/
│   ├── app/            # Next.js App Router pages (chat, auth, profile, admin)
│   └── components/     # Shared UI components (CustomSelect, etc.)
└── embedder/
    └── embed_service.py  # Python Flask: text→vector + PDF extraction
```

---

## 👨‍💻 Author

**Himanshu Lokhande** — B.Tech Computer Science Engineering, RGPV  
Built with the goal of making university resources actually accessible to students.
