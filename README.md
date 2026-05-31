# 🏢 ApartPro — Platformă Administrare Apartamente

Platformă web modernă pentru administrarea apartamentelor în regim hotelier, cu calcul financiar automat și rapoarte pentru proprietari.

## Stack
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend / DB**: Supabase (PostgreSQL)
- **Deploy**: Vercel
- **CI/CD**: GitHub Actions

## Setup în 5 pași

### 1. Clonează repo-ul
```bash
git clone https://github.com/username/apartpro.git
cd apartpro
npm install
```

### 2. Creează proiectul Supabase
1. supabase.com → New project
2. SQL Editor → rulează `supabase/schema.sql`
3. Project Settings → API → copiază URL și anon key

### 3. Variabile de mediu
```bash
cp .env.local.example .env.local
# Editează cu datele tale Supabase
```

### 4. Rulează local
```bash
npm run dev
# http://localhost:3000
```

### 5. Deploy Vercel
1. vercel.com → New Project → importă GitHub repo
2. Adaugă Environment Variables (URL + ANON_KEY)
3. Deploy ✅

## Formula calcul comision
```
Valoare brută
- Comision platformă (Booking/Airbnb)
- TVA platformă
- Costuri operaționale
= Baza comision
× 20% comision administrator
= Net de virat proprietarului
```
Formula este configurabilă per apartament.

## GitHub Secrets CI/CD
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID 1
```

<!-- deploy trigger 2026-05-31T07:36:01.063435 -->
