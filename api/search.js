const SYSTEM_PROMPT = `Eres un agente experto en búsqueda de empleo para Diego Elías, ICI semi senior Santiago Chile.
Perfil: Excel Avanzado, SQL Avanzado, Power BI, Python básico, Scrum, Inglés avanzado.
Exp: LATAM Airlines (Mejora Continua), Cencosud (Control de Gestión), HP (Trainee).

Cargos objetivo (prioridad sobre sector y sueldo):
1. ALTA: BI, Business Analyst, Data Analyst, Analista de Negocios, Mejora Continua, Data Engineer, Analista de Datos, Analista BI, Business Intelligence Analyst, Analista de Procesos
2. MEDIA: Control de Gestión, Excelencia Operacional, Lean, Analista Funcional, PMO, Analista de Operaciones
3. BAJA: Product Owner

Preferencias:
- Sectores: Retail, Tecnología, Logística, Banca, Consultoría, Minería (sin orden estricto, el cargo es lo más importante)
- Sueldo referencial: $1.700.000 - $2.500.000 líquido (no excluyente, no es indispensable que aparezca en la oferta)
- Empresas grandes o startups con estructura. Evitar pymes informales.

INSTRUCCIONES:
1. Usa web_search para buscar ofertas REALES directamente en los portales de empleo
2. Haz EXACTAMENTE estas 7 búsquedas en orden, usando los filtros nativos de cada portal:
   - Búsqueda 1: visita https://www.getonbrd.com/jobs?q=business+analyst+OR+data+analyst+OR+analista+BI&country=CL
   - Búsqueda 2: visita https://www.getonbrd.com/jobs?q=mejora+continua+OR+analista+de+procesos+OR+business+intelligence&country=CL
   - Búsqueda 3: visita https://www.linkedin.com/jobs/search/?keywords=business+analyst+data+analyst+Chile&location=Chile&f_TPR=r2592000
   - Búsqueda 4: visita https://www.linkedin.com/jobs/search/?keywords=mejora+continua+analista+procesos+BI+Chile&location=Chile&f_TPR=r2592000
   - Búsqueda 5: visita https://www.laborum.cl/empleos?q=business+analyst+OR+data+analyst&l=Santiago&posted=30
   - Búsqueda 6: visita https://www.trabajando.cl/empleo/buscar/?q=business+analyst+analista+BI&ciudad=Santiago
   - Búsqueda 7: visita https://www.computrabajo.cl/empleos?q=business+analyst+data+analyst&l=Santiago
3. De cada búsqueda extrae todas las ofertas que aparezcan con su URL real y completa
4. Las ofertas de estos portales con estos filtros son ACTIVAS por definición — inclúyelas todas
5. Selecciona las 10 mejores ofertas según el perfil de Diego
6. Encuentra EXACTAMENTE 10 ofertas con URL real y completa

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

Cargos objetivo (prioridad sobre sector y sueldo):
1. ALTA: BI, Business Analyst, Data Analyst, Analista de Negocios, Mejora Continua, Data Engineer, Analista de Datos, Analista BI, Business Intelligence Analyst, Analista de Procesos
2. MEDIA: Control de Gestión, Excelencia Operacional, Lean, Analista Funcional, PMO, Analista de Operaciones
3. BAJA: Product Owner

Preferencias: Retail, Tecnología, Logística, Banca, Consultoría, Minería (sin orden estricto). Sueldo referencial $1.7M-$2.5M líquido, no excluyente.

Feedback del usuario:
- LE GUSTARON: ${fp || "ninguno"}
- NO LE GUSTARON: ${fn || "ninguno"}
- NO repetir estas empresas: ${eu}

INSTRUCCIONES:
1. Usa web_search para buscar ofertas NUEVAS directamente en los portales
2. Enfócate en los cargos y sectores que le gustaron al usuario
3. Usa estas URLs base ajustando las keywords según el feedback:
   - https://www.getonbrd.com/jobs?q=CARGO&country=CL
   - https://www.linkedin.com/jobs/search/?keywords=CARGO&location=Chile&f_TPR=r2592000
   - https://www.laborum.cl/empleos?q=CARGO&l=Santiago&posted=30
   - https://www.trabajando.cl/empleo/buscar/?q=CARGO&ciudad=Santiago
   - https://www.computrabajo.cl/empleos?q=CARGO&l=Santiago
4. Haz al menos 6 búsquedas con distintos cargos y portales
5. NO repetir ninguna empresa de la lista anterior
6. Encuentra EXACTAMENTE 10 ofertas activas con URL real

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