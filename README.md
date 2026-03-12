# Hedef Takip

Kişisel hedef ve alışkanlık takip uygulaması.

## Deploy Adımları

### 1. GitHub'a yükle
```bash
git init
git add .
git commit -m "ilk commit"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADIN/hedef-takip.git
git push -u origin main
```

### 2. Vercel'e deploy et
1. vercel.com → "Add New Project"
2. GitHub reposunu seç
3. Environment Variables ekle:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
4. Deploy!

### 3. Supabase'e Vercel URL'ini ekle
Supabase → Authentication → URL Configuration → Site URL → Vercel URL'ini ekle
