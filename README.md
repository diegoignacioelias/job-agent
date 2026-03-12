# Job Agent · Diego Elías

Agente de búsqueda laboral con web search real vía Anthropic API.

## Deploy en Vercel (5 pasos)

### 1. Sube el proyecto a GitHub
```bash
git init
git add .
git commit -m "job agent inicial"
git remote add origin https://github.com/TU_USUARIO/job-agent.git
git push -u origin main
```

### 2. Conecta en Vercel
- Ve a vercel.com → "Add New Project"
- Importa el repositorio desde GitHub
- Vercel detecta Vite automáticamente

### 3. Agrega tu API key
En Vercel → Settings → Environment Variables:
```
ANTHROPIC_API_KEY = sk-ant-...tu-key...
```

### 4. Deploy
- Haz click en "Deploy"
- En 2-3 minutos tienes tu URL

### 5. Usar
- Abre tu URL de Vercel
- Haz click en "Buscar ofertas reales"
- El agente navega la web y trae ofertas con links directos

## Desarrollo local
```bash
npm install
# Crea .env.local con: ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```
