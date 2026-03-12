

const SYSTEM_PROMPT = `Eres un agente experto en búsqueda de empleo para profesionales chilenos. USA web_search para encontrar ofertas reales.

El candidato es Diego Elías:
- Título: Ingeniero Civil Industrial (UAI), mención TI
- Nivel: Semi Senior (2-5 años)
- Ubicación: Santiago, Chile
- Experiencia: LATAM Airlines (Mejora Continua), Cencosud (Control de Gestión), HP (Trainee)
- Herramientas: Excel Avanzado, SQL Avanzado, Power BI, Python básico, Scrum
- Idiomas: Inglés avanzado

Cargos objetivo por PRIORIDAD:
1. ALTA: Project Manager, Jefe de Proyectos, PMO, Mejora Continua, Lean, Excelencia Operacional
2. MEDIA: Business Analyst, Analista Funcional, Analista de Negocios
3. BAJA: BI, Control de Gestión, Data Analyst

Preferencias:
- Sectores: Retail > Tecnología/Startups > Aerolíneas/Logística > Banca > Consultoría > Minería
- Empresas grandes, multinacionales o startups con estructura
- Sueldo: $2.000.000 - $2.500.000 líquido
- Evitar: roles 100% técnicos sin negocio, ambientes caóticos

INSTRUCCIONES:
1. Usa web_search para buscar ofertas reales. Queries sugeridos:
   - "project manager Santiago Chile getonbrd.com 2025"
   - "analista mejora continua Santiago linkedin.com/jobs"
   - "business analyst Chile laborum 2025"
   - "jefe proyectos retail Chile trabajando.com"
2. Haz al menos 4 búsquedas distintas en distintos portales
3. Extrae URL real, empresa real, fecha real de cada oferta
4. Al terminar responde ÚNICAMENTE con el JSON, sin texto antes ni después

JSON final:
{
  "ofertas": [
    {
      "id": 1,
      "empresa": "nombre real",
      "sector": "sector",
      "cargo": "título exacto de la oferta",
      "ubicacion": "ciudad, Chile",
      "modalidad": "Presencial | Híbrido | Remoto",
      "rango_sueldo": "monto real o No especificado",
      "descripcion": "2-3 líneas basadas en la oferta real",
      "requisitos_clave": ["req1", "req2", "req3"],
      "match_herramientas": ["herramientas del perfil que coinciden"],
      "url": "URL real y completa de la oferta",
      "fuente": "GetOnBoard | LinkedIn | Laborum | Indeed | Trabajando.com | Computrabajo | Bumeran",
      "dias_publicada": "hoy | hace 1 día | hace 3 días | hace 1 semana",
      "match_score": 75
    }
  ],
  "resumen_mercado": "Una línea sobre el mercado laboral actual"
}`;

const REFINE_SYSTEM = (fp, fn, eu) => `Eres un agente de búsqueda laboral para Diego Elías, ICI semi senior Santiago Chile. USA web_search.

Perfil: SQL, Excel Avanzado, Power BI, Python básico, Inglés avanzado. Exp: LATAM, Cencosud.
Preferencias: PM/Mejora Continua > Business Analyst > BI. Retail > Tech > Logística. Sueldo $2M-$2.5M.

Feedback:
- GUSTARON: ${fp || "ninguno"}
- NO GUSTARON: ${fn || "ninguno"}
- NO repetir: ${eu}

Busca 5 ofertas REALES nuevas con web_search ajustadas al feedback.
Responde SOLO con JSON:
{
  "ofertas": [{
    "id":1,"empresa":"","sector":"","cargo":"","ubicacion":"","modalidad":"",
    "rango_sueldo":"","descripcion":"","requisitos_clave":[],"match_herramientas":[],
    "url":"","fuente":"","dias_publicada":"","match_score":75
  }],
  "resumen_mercado":"",
  "aprendizaje":"qué aprendiste del feedback"
}`;

async function runAgentLoop(apiKey, system, userMessage) {
  let messages = [{ role: "user", content: userMessage }];
  
  for (let i = 0; i < 10; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "interleaved-thinking-2025-05-14"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        system,
        messages,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error("Anthropic API error: " + err.slice(0, 300));
    }

    const data = await res.json();

    // If done, extract JSON from text blocks
    if (data.stop_reason === "end_turn") {
      const text = data.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");
      const clean = text.replace(/```json|```/g, "").trim();
      const start = clean.indexOf('{"ofertas"');
      if (start !== -1) {
        let depth = 0, end = -1;
        for (let j = start; j < clean.length; j++) {
          if (clean[j] === "{") depth++;
          else if (clean[j] === "}") { depth--; if (depth === 0) { end = j; break; } }
        }
        if (end !== -1) return JSON.parse(clean.slice(start, end + 1));
      }
      // fallback: find any JSON
      const match = clean.match(/\{[\s\S]*"ofertas"[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error("No JSON encontrado en respuesta final");
    }

    // Continue loop: add assistant turn and tool results
    messages.push({ role: "assistant", content: data.content });

    const toolResults = data.content
      .filter(b => b.type === "tool_use")
      .map(b => ({
        type: "tool_result",
        tool_use_id: b.id,
        content: "Search executed successfully."
      }));

    if (toolResults.length > 0) {
      messages.push({ role: "user", content: toolResults });
    } else {
      // No tool use and not end_turn — extract whatever text we have
      const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
      const match = text.match(/\{[\s\S]*"ofertas"[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error("Loop ended without result");
    }
  }
  throw new Error("Max iterations reached");
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada en Vercel");

    const body = await req.json();
    const { type, feedback_pos, feedback_neg, empresas } = body;

    let result;
    if (type === "refine") {
      result = await runAgentLoop(
        apiKey,
        REFINE_SYSTEM(feedback_pos, feedback_neg, empresas),
        "Busca nuevas ofertas reales ajustadas al feedback. Usa web_search."
      );
    } else {
      result = await runAgentLoop(
        apiKey,
        SYSTEM_PROMPT,
        "Busca ofertas reales de trabajo en Chile para el perfil de Diego. Usa web_search en múltiples portales."
      );
    }

    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
