const SYSTEM_PROMPT = `Eres un agente experto en búsqueda de empleo para Diego Elías, ICI semi senior Santiago Chile.
Perfil: Excel Avanzado, SQL Avanzado, Power BI, Python básico, Scrum, Inglés avanzado.
Exp: LATAM Airlines (Mejora Continua), Cencosud (Control de Gestión), HP (Trainee).

Cargos objetivo:
1. ALTA: Project Manager, Jefe Proyectos, PMO, Mejora Continua, Lean
2. MEDIA: Business Analyst, Analista Funcional
3. BAJA: BI, Control de Gestión, Data Analyst

Preferencias: Retail > Tecnología > Logística > Banca. Sueldo $2M-$2.5M líquido.

USA web_search para encontrar ofertas REALES publicadas esta semana en Chile.
Busca en: getonbrd.com, linkedin.com/jobs, laborum.cl, trabajando.cl, computrabajo.cl
Haz al menos 4 búsquedas. Extrae URL real y completa de cada oferta encontrada.

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
      "rango_sueldo": "monto o No especificado",
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

const REFINE_PROMPT = (fp, fn, eu) => `Agente búsqueda laboral Diego Elías, ICI semi senior Santiago.
Perfil: SQL, Excel, Power BI, Python, Inglés avanzado. LATAM, Cencosud.
Preferencias: PM > Business Analyst. Retail > Tech. Sueldo $2M-$2.5M.
LE GUSTARON: ${fp || "ninguno"}. NO GUSTARON: ${fn || "ninguno"}. NO repetir: ${eu}.
USA web_search. Busca 5 ofertas nuevas con URL real. Mismo formato JSON con campo aprendizaje.`;

async function runAgentLoop(apiKey, system, userMessage) {
  let messages = [{ role: "user", content: userMessage }];

  for (let i = 0; i < 10; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 6000,
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
      const start = clean.indexOf('{');
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
        ? "Busca nuevas ofertas reales ajustadas al feedback."
        : "Busca ofertas reales para Diego en Chile."
    );

    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
