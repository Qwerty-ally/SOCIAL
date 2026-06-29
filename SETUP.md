# ANCHOR Social — Setup Guide

## 1. Create a Firebase Project

1. Go to https://console.firebase.google.com
2. Click **Add project** → name it `anchor-social`
3. Enable **Google Analytics** (optional)

## 2. Enable Firebase Services

In your Firebase project, enable:
- **Authentication** → Sign-in methods → **Email/Password** ✓
- **Firestore Database** → Create in **production mode** (then apply rules below)
- **Storage** → Start in **production mode** (then apply rules below)

## 3. Get Your Config

1. In Firebase Console → Project Settings → General
2. Under "Your apps", click the **</>** (web) icon
3. Register app, copy the `firebaseConfig` object

## 4. Add Config to the Project

Open `src/firebase.js` and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
}
```

## 5. Apply Security Rules

**Firestore rules** — paste contents of `firestore.rules` in Firebase Console → Firestore → Rules

**Storage rules** — paste contents of `storage.rules` in Firebase Console → Storage → Rules

## 6. Create Firestore Indexes

In Firebase Console → Firestore → Indexes, add these composite indexes:

| Collection | Fields | Order |
|------------|--------|-------|
| `posts` | `authorId` ASC, `createdAt` DESC | — |
| `posts` | `tags` (array) + `createdAt` DESC | — |
| `notifications` | `to` ASC, `createdAt` DESC | — |
| `conversations` | `participants` (array) + `lastMessageAt` DESC | — |

## 7. Run the App

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Features

- **Sign up / Sign in** with email & password
- **Post** text + images, up to 280 characters with #tags
- **Like**, **Repost**, **Bookmark** any post
- **Comment / Reply** on posts with likes on comments
- **Follow / Unfollow** users
- **Notifications** — likes, follows, replies (real-time)
- **Direct Messages** — search users and start conversations
- **Explore** — search users & posts by hashtag
- **Trending** — most-liked posts, filterable by tag
- **Bookmarks** — saved posts
- **Edit Profile** — display name, bio, location, avatar
- **Delete** your own posts and comments
- **Copy link** to any post
- Fully **responsive** (mobile + desktop)
