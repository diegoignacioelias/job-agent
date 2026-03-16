const SYSTEM_PROMPT = `Eres un agente experto en búsqueda de empleo para Diego Elías, ICI semi senior Santiago Chile.
Perfil: Excel Avanzado, SQL Avanzado, Power BI, Python básico, Scrum, Inglés avanzado.
Exp: LATAM Airlines (Mejora Continua), Cencosud (Control de Gestión), HP (Trainee).

Cargos objetivo:
1. ALTA: Project Manager, Jefe Proyectos, PMO, Mejora Continua, Lean, Excelencia Operacional
2. MEDIA: Business Analyst, Analista Funcional, Analista de Negocios
3. BAJA: BI, Control de Gestión, Data Analyst

Preferencias:
- Sectores: Retail > Tecnología > Logística > Banca > Consultoría > Minería
- Sueldo: $1.700.000 - $2.500.000 líquido (no es indispensable que aparezca en la oferta)
- Empresas grandes o startups con estructura. Evitar pymes informales.

INSTRUCCIONES:
1. Usa web_search para buscar ofertas REALES en Chile
2. Haz AL MENOS 6 búsquedas en distintos portales y con distintos cargos
3. Busca en: getonbrd.com, linkedin.com/jobs, laborum.cl, trabajando.cl, computrabajo.cl
4. Solo incluye ofertas que estén ACTIVAS y aceptando postulaciones ahora
5. Prioriza ofertas publicadas en los últimos 7 días
6. Si una oferta dice "cerrada", "no acepta postulaciones" o similar, descártala
7. Encuentra EXACTAMENTE 10 ofertas activas con URL real y completa

Queries sugeridos:
- "project manager Santiago Chile" site:getonbrd.com
- "jefe de proyectos Santiago" site:linkedin.com/jobs
- "mejora continua Santiago Chile 2025" site:laborum.cl
- "business analyst Santiago" site:trabajando.cl
- "PMO analista funcional Santiago" site:computrabajo.cl
- "excelencia operacional Chile" site:getonbrd.com

Responde SOLO con JSON válido:
{
  "ofertas": [
    {
      "id": 1,
      "empresa": "nombre real",
      "sector": "sector",
      "cargo": "título exacto",
      "ubicacion": "Santiago, Chile",
      "modalidad": "Presencial | Híbrido | Remoto",
      "rango_sueldo": "monto real o No especificado",
      "descripcion": "2-3 líneas del rol",
      "requisitos_clave": ["req1", "req2", "req3"],
      "match_herramientas": ["herramientas de Diego que coinciden"],
      "url": "URL completa y real de la oferta",
      "fuente": "GetOnBoard | LinkedIn | Laborum | Trabajando.com | Computrabajo",
      "publicada": "hoy | hace 1 día | hace 3 días | esta semana",
      "match_score": 75
    }
  ],
  "resumen_mercado": "Una línea sobre el mercado actual"
}`;

const REFINE_PROMPT = (fp, fn, eu) => `Eres un agente experto en búsqueda de empleo para Diego Elías, ICI semi senior Santiago Chile.
Perfil: Excel Avanzado, SQL Avanzado, Power BI, Python básico, Scrum, Inglés avanzado.
Exp: LATAM Airlines (Mejora Continua), Cencosud (Control de Gestión), HP (Trainee).

Cargos objetivo:
1. ALTA: Project Manager, Jefe Proyectos, PMO, Mejora Continua, Lean
2. MEDIA: Business Analyst, Analista Funcional
3. BAJA: BI, Control de Gestión, Data Analyst

Preferencias: Retail > Tech > Logística > Banca. Sueldo $1.7M-$2.5M líquido.

Feedback del usuario:
- LE GUSTARON: ${fp || "ninguno"}
- NO LE GUSTARON: ${fn || "ninguno"}
- NO repetir estas empresas: ${eu}

INSTRUCCIONES:
1. Usa web_search para buscar ofertas NUEVAS y DISTINTAS a las anteriores
2. Haz AL MENOS 6 búsquedas enfocadas en los cargos y sectores que le gustaron
3. Solo ofertas ACTIVAS que acepten postulaciones ahora
4. Encuentra EXACTAMENTE 10 ofertas con URL real
5. NO repetir ninguna empresa de la lista anterior

Responde SOLO con JSON válido:
{
  "ofertas": [
    {
      "id": 1,
      "empresa": "", "sector": "", "cargo": "", "ubicacion": "", "modalidad": "",
      "rango_sueldo": "", "descripcion": "",
      "requisitos_clave": [], "match_herramientas": [],
      "url": "", "fuente": "", "publicada": "", "match_score": 75
    }
  ],
  "resumen_mercado": "",
  "aprendizaje": "qué ajustaste según el feedback"
}`;

async function runAgentLoop(apiKey, system, userMessage) {
  let messages = [{ role: "user", content: userMessage }];

  for (let i = 0; i < 15; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        system,
        messages,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    if (data.stop_reason === "end_turn") {
      const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
      const clean = text.replace(/```json|```/g, "").trim();
      const start = clean.indexOf("{");
      if (start !== -1) {
        let depth = 0, end = -1;
        for (let j = start; j < clean.length; j++) {
          if (clean[j] === "{") depth++;
          else if (clean[j] === "}") { depth--; if (depth === 0) { end = j; break; } }
        }
        if (end !== -1) return JSON.parse(clean.slice(start, end + 1));
      }
      throw new Error("No JSON en respuesta");
    }

    messages.push({ role: "assistant", content: data.content });
    const toolUses = data.content.filter(b => b.type === "tool_use");
    if (toolUses.length > 0) {
      messages.push({
        role: "user",
        content: toolUses.map(b => ({
          type: "tool_result",
          tool_use_id: b.id,
          content: b.output || "OK",
        }))
      });
    } else {
      throw new Error("Sin herramientas ni resultado");
    }
  }
  throw new Error("Máximo de iteraciones alcanzado");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");

    const { type, feedback_pos, feedback_neg, empresas } = req.body;

    const result = await runAgentLoop(
      apiKey,
      type === "refine" ? REFINE_PROMPT(feedback_pos, feedback_neg, empresas) : SYSTEM_PROMPT,
      type === "refine"
        ? "Busca 10 ofertas NUEVAS ajustadas al feedback. Usa web_search en múltiples portales. Solo ofertas activas con URL real."
        : "Busca 10 ofertas reales y activas para Diego en Chile. Usa web_search en múltiples portales."
    );

    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}