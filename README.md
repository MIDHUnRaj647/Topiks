# ⚡ Topiks — Dynamic Hierarchical Knowledge Vault

A lightweight, self-hosted, mobile-first knowledge management application designed with a **generic self-referencing node architecture**.

Store Books, Chapters, Topics, Notes, and References to unlimited levels with **rich HTML editing (CKEditor 5)**, **OCR Image-to-Text conversion**, and **lightning-fast full-text search**.

---

## 📱 Mobile & Tablet Optimized
- **Responsive Layout**: Designed mobile-first with a slide-out drawer on phones/tablets and collapsible sidebar on desktop.
- **Touch-Friendly Controls**: 48px+ touch targets, swipeable navigation, and reordering controls.
- **Mobile Bottom Dock**: Instant one-thumb switching between Hierarchy Tree, Rich Editor, Mobile Camera OCR, Search, and Starred topics.
- **Glassmorphic Dark / Light Mode**: Seamless theme switcher with localStorage persistence.
- **Local Network Access**: Run with `--host 0.0.0.0` to browse from your iPhone, iPad, or Android device on the same Wi-Fi.

---

## 🏗️ Architecture

```
Angular 16 SPA (Mobile-First)
        │
        ▼ (REST API)
ASP.NET Core 9 Web API
        │
        ▼ (Entity Framework Core)
SQLite Database (`knowledgevault.db`)
        ├── Self-Referencing Nodes
        ├── Image Storage (`/storage/images`)
        └── OCR History (`/storage/ocr`)
```

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **.NET SDK 9+ / 10**
- **Node.js 18+** & npm

### 2. Run the Backend API (.NET 9 / 10)
```bash
cd backend/KnowledgeVault.Api
dotnet run --urls "http://localhost:5000"
```
The API starts at `http://localhost:5000`. Database is automatically initialized with seed data!

### 3. Run the Frontend (Angular)
```bash
cd frontend
npm start
```
Open `http://localhost:4200` in your desktop or mobile browser.

To access from your mobile phone or tablet on the same Wi-Fi:
```bash
npm start -- --host 0.0.0.0
```
Open `http://<YOUR_COMPUTER_IP>:4200` on your mobile device.

---

## 🐳 Easy 1-Command Hosting (Docker Compose)

Host the entire full-stack application anywhere with a single command:

```bash
docker compose up -d
```

- **Frontend**: `http://localhost:4200`
- **Backend API**: `http://localhost:5000`
- **Persistent Data**: SQLite database and images are saved in Docker volumes `topiks-data` and `topiks-storage`.

### Free Cloud Hosting Options
1. **Frontend**: Deploy `frontend/dist/frontend` to **GitHub Pages**, **Vercel**, or **Netlify** (100% Free).
2. **Backend**: Deploy `backend/KnowledgeVault.Api` using the included Dockerfile to **Render**, **Railway**, or **Fly.io** (Free tiers available).

---

## ✨ Features Included

| Feature | Description | Status |
|---------|-------------|:------:|
| **Generic Node Model** | Self-referencing node architecture supporting unlimited depth (Book → Chapter → Topic → Note → Reference) | ✅ |
| **CKEditor 5** | User-friendly WYSIWYG editor storing clean HTML | ✅ |
| **OCR Image-to-Text** | Upload screenshots, photos, or document scans; extracts text and appends to content without overwriting | ✅ |
| **Global Search** | Instant search across node titles, HTML content, OCR imports, and tags with snippet highlighting | ✅ |
| **Favorites / Bookmarks** | Star important topics and filter with one tap | ✅ |
| **Tags Management** | Add and filter topics by #tags | ✅ |
| **Reordering** | Move nodes up/down with touch-friendly controls | ✅ |
| **Export** | Export notes as standalone HTML documents, Markdown, or Print to PDF | ✅ |
| **Dark / Light Mode** | Modern slate glassmorphism theme | ✅ |
